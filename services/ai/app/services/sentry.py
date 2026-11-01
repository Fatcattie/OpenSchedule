"""AI 服务错误上报：Sentry Envelope 直连（零新依赖，复用已有 httpx）。

与主服务 `services/api/src/common/observability/sentry.ts` 同口径：
- 不引入 `sentry-sdk`（审计面零新增）；只实现官方公开的 Envelope 协议；
- `AI_SENTRY_DSN`（优先）/ `SENTRY_DSN` 为空时完全 no-op；
- 事件只含异常类型/脱敏消息/栈帧/白名单标签，**不含请求体、LLM 提示词或模型输出**；
- 每分钟限流 + 3s 超时；任何失败静默，绝不影响拆解流程。

上报点：未捕获的请求异常（全局 500 处理器）与拆解后台任务中的**非预期**异常
（`AI_INTERNAL_ERROR`；LLM 超时/限流/鉴权等可预期运维错误走 ai.error + 指标，不上报）。
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import traceback
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from urllib.parse import quote, unquote, urlsplit

import httpx

logger = logging.getLogger(__name__)

SDK_NAME = "openschedule.ai.envelope"
SDK_VERSION = "1.0.0"
MAX_EVENTS_PER_MINUTE = 20
SEND_TIMEOUT_SECONDS = 3.0
MAX_MESSAGE_LENGTH = 2000
MAX_FRAMES = 30


@dataclass(frozen=True)
class SentryOptions:
    public_key: str
    envelope_url: str
    environment: str
    release: str | None = None


def parse_dsn(raw: str | None) -> tuple[str, str] | None:
    """解析 DSN → (public_key, envelope_url)；非法/缺失返回 None。"""
    value = (raw or "").strip()
    if not value:
        return None
    try:
        parts = urlsplit(value)
    except ValueError:
        return None
    if not parts.scheme or not parts.hostname or not parts.username:
        return None
    segments = [s for s in parts.path.split("/") if s]
    if not segments or not segments[-1].isdigit():
        return None
    project_id = segments.pop()
    prefix = "/" + "/".join(segments) if segments else ""
    host = parts.hostname + (f":{parts.port}" if parts.port else "")
    return unquote(parts.username), f"{parts.scheme}://{host}{prefix}/api/{project_id}/envelope/"


def resolve_options(dsn: str | None, environment: str, release: str | None) -> SentryOptions | None:
    parsed = parse_dsn(dsn)
    if parsed is None:
        return None
    public_key, envelope_url = parsed
    return SentryOptions(
        public_key=public_key,
        envelope_url=envelope_url,
        environment=environment or "development",
        release=(release or "").strip() or None,
    )


_SCRUB_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"Bearer\s+[A-Za-z0-9\-._~+/]+=*", re.I), "Bearer [REDACTED]"),
    (re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b"), "[JWT REDACTED]"),
    (
        re.compile(
            r"(password|passwd|secret|token|api[_-]?key|authorization)\s*[:=]\s*(\"[^\"]*\"|'[^']*'|\S+)",
            re.I,
        ),
        r"\1=[REDACTED]",
    ),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"), "[API_KEY REDACTED]"),  # OpenAI/DeepSeek 风格密钥
    (re.compile(r"\b[A-Fa-f0-9]{32,}\b"), "[REDACTED_HEX]"),
]


def scrub_message(message: str) -> str:
    """凭据脱敏（规则与主服务一致，另加 `sk-*` 模型密钥）。"""
    for pattern, repl in _SCRUB_RULES:
        message = pattern.sub(repl, message)
    return message


def build_frames(exc: BaseException) -> list[dict[str, Any]]:
    """traceback → Sentry frames（最早调用在前；site-packages/标准库标记 in_app=False）。"""
    frames: list[dict[str, Any]] = []
    for fs in traceback.extract_tb(exc.__traceback__)[-MAX_FRAMES:]:
        filename = fs.filename.replace("\\", "/")
        in_app = "/site-packages/" not in filename and "/app/" in filename
        frames.append(
            {
                "filename": filename,
                "function": fs.name,
                "lineno": fs.lineno,
                "in_app": in_app,
            }
        )
    return frames


def build_event(
    exc: BaseException,
    options: SentryOptions,
    tags: dict[str, str] | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    """构造事件体（纯函数）。"""
    moment = now or datetime.now(UTC)
    value = scrub_message(str(exc) or type(exc).__name__)[:MAX_MESSAGE_LENGTH]
    frames = build_frames(exc)
    exception: dict[str, Any] = {"type": type(exc).__name__, "value": value}
    if frames:
        exception["stacktrace"] = {"frames": frames}
    event: dict[str, Any] = {
        "event_id": uuid.uuid4().hex,
        "timestamp": moment.timestamp(),
        "platform": "python",
        "level": "error",
        "logger": "openschedule-ai",
        "environment": options.environment,
        "sdk": {"name": SDK_NAME, "version": SDK_VERSION},
        "tags": {"service": "openschedule-ai", **(tags or {})},
        "exception": {"values": [exception]},
    }
    if options.release:
        event["release"] = options.release
    return event


def build_envelope(event: dict[str, Any], sent_at: datetime | None = None) -> bytes:
    """序列化 Envelope：信封头 / item 头 / 事件体，逐行分隔。"""
    moment = (sent_at or datetime.now(UTC)).isoformat().replace("+00:00", "Z")
    header = json.dumps({"event_id": event["event_id"], "sent_at": moment})
    item = json.dumps({"type": "event", "content_type": "application/json"})
    body = json.dumps(event, ensure_ascii=False)
    return f"{header}\n{item}\n{body}\n".encode()


class _State:
    def __init__(self, options: SentryOptions, client: httpx.AsyncClient | None, clock: Any) -> None:
        self.options = options
        self.client = client
        self.clock = clock
        self.window_start = 0.0
        self.window_count = 0
        self.tasks: set[asyncio.Task[None]] = set()  # 强引用，防 fire-and-forget 任务被 GC


_active: _State | None = None


def init_sentry(
    dsn: str | None,
    environment: str,
    release: str | None = None,
    *,
    client: httpx.AsyncClient | None = None,
    clock: Any = time.monotonic,
) -> bool:
    """初始化；无有效 DSN 返回 False 并保持 no-op。`client`/`clock` 仅供测试注入。"""
    global _active
    options = resolve_options(dsn, environment, release)
    _active = _State(options, client, clock) if options else None
    return _active is not None


def is_enabled() -> bool:
    return _active is not None


def reset_for_test() -> None:
    global _active
    _active = None


def _within_rate_limit(state: _State) -> bool:
    now = state.clock()
    if now - state.window_start >= 60:
        state.window_start = now
        state.window_count = 0
    if state.window_count >= MAX_EVENTS_PER_MINUTE:
        return False
    state.window_count += 1
    return True


async def _send(state: _State, body: bytes) -> None:
    headers = {
        "content-type": "application/x-sentry-envelope",
        "x-sentry-auth": (
            f"Sentry sentry_version=7, sentry_client={SDK_NAME}/{SDK_VERSION}, "
            f"sentry_key={quote(state.options.public_key)}"
        ),
    }
    try:
        if state.client is not None:
            await state.client.post(state.options.envelope_url, content=body, headers=headers)
        else:
            async with httpx.AsyncClient(timeout=SEND_TIMEOUT_SECONDS) as client:
                await client.post(state.options.envelope_url, content=body, headers=headers)
    except Exception:  # noqa: BLE001 - 观测失败不得影响业务
        logger.debug("sentry 上报失败（已忽略）", exc_info=True)


def capture_exception(exc: BaseException, tags: dict[str, str] | None = None) -> asyncio.Task[None] | None:
    """上报一次异常（fire-and-forget）；未启用/超限/无事件循环时静默返回 None。"""
    state = _active
    if state is None:
        return None
    try:
        if not _within_rate_limit(state):
            return None
        body = build_envelope(build_event(exc, state.options, tags))
        task = asyncio.get_running_loop().create_task(_send(state, body))
        state.tasks.add(task)
        task.add_done_callback(state.tasks.discard)
        return task
    except Exception:  # noqa: BLE001
        return None
