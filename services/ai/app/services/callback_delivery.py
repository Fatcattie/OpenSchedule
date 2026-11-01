"""回调投递（R11）：签名外呼主服务 /internal/ai/results，失败入死信，死信可重放。

一次投递的四件事（缺一不可）：
  1. **HMAC 签名**（§3.3）：签的是实际发出的 raw bytes（`serialize_body` 的产物）；
  2. **幂等键**（§3.1）：`Idempotency-Key: ai-run:<run_id>`，主服务 24h 去重 → 重放安全；
  3. **有界重试**：指数退避（1s/2s/4s，上限 8s）；4xx（除 408/429）视为永久失败立即停止；
  4. **死信留痕**：重试耗尽 → `dead_letter.record_dead_letter`（可查询/可重放/可告警）。

初始投递与死信重放共用本模块，保证两条路径的报文与签名逻辑完全一致。
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any

import httpx

from . import dead_letter
from .callback_signing import build_signature_headers, serialize_body

logger = logging.getLogger(__name__)

CALLBACK_PATH = "/internal/ai/results"
MAX_BACKOFF_SECONDS = 8.0
# 这些 4xx 是「暂时性」的，值得重试；其余 4xx 重试无用（如 401 验签失败、400 报文非法）
RETRYABLE_CLIENT_STATUS = (408, 409, 425, 429)


def callback_delay_seconds(attempt: int) -> float:
    """退避时长：2^(attempt-1)，上限 8s（attempt 从 1 开始）。"""
    return min(MAX_BACKOFF_SECONDS, 2.0 ** max(0, attempt - 1))


@dataclass
class DeliveryOutcome:
    """一次投递（含重试）的结果。"""

    ok: bool
    attempts: int
    status_code: int | None = None
    last_error: str | None = None
    permanent: bool = False


def build_callback_body(
    run_id: str,
    proposal_id: str | None,
    status: str,
    *,
    payload: dict[str, Any] | None = None,
    error: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """构造回调报文（§3.5.2 字段：run_id / proposal_id / status / payload? / error?）。"""
    body: dict[str, Any] = {"run_id": run_id, "proposal_id": proposal_id, "status": status}
    if payload is not None:
        body["payload"] = payload
    if error is not None:
        body["error"] = error
    return body


def build_headers(secret: str, raw_body: bytes, *, run_id: str) -> dict[str, str]:
    """构造请求头：鉴权 + 幂等键 + HMAC 签名（含时间戳）。"""
    headers = {
        "Authorization": f"Bearer {secret}",
        "Idempotency-Key": f"ai-run:{run_id}",
        "Content-Type": "application/json",
    }
    headers.update(build_signature_headers(secret, raw_body))
    return headers


async def post_once(
    url: str,
    raw_body: bytes,
    headers: dict[str, str],
    *,
    timeout_seconds: float,
    client: httpx.AsyncClient | None = None,
) -> httpx.Response:
    """单次 POST（发送的是签名用的同一份 bytes）。"""
    if client is not None:
        return await client.post(url, content=raw_body, headers=headers, timeout=timeout_seconds)
    async with httpx.AsyncClient(timeout=timeout_seconds) as owned:
        return await owned.post(url, content=raw_body, headers=headers)


async def deliver(
    url: str,
    body: dict[str, Any],
    *,
    run_id: str,
    secret: str,
    timeout_seconds: float = 10.0,
    max_attempts: int = 3,
    client: httpx.AsyncClient | None = None,
    sleeper: Any = asyncio.sleep,
) -> DeliveryOutcome:
    """带签名与退避重试的投递。返回结果，不抛异常（由调用方决定是否入死信）。"""
    raw_body = serialize_body(body)
    headers = build_headers(secret, raw_body, run_id=run_id)
    last_error: str | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            resp = await post_once(
                url, raw_body, headers, timeout_seconds=timeout_seconds, client=client
            )
        except httpx.HTTPError as exc:
            last_error = f"{type(exc).__name__}: {exc}"
            logger.warning("回调主服务异常 attempt=%s/%s：%s", attempt, max_attempts, last_error)
        else:
            if resp.status_code < 300:
                logger.info("回调主服务成功 run_id=%s attempt=%s", run_id, attempt)
                return DeliveryOutcome(ok=True, attempts=attempt, status_code=resp.status_code)
            last_error = f"HTTP {resp.status_code}: {resp.text[:200]}"
            permanent = 400 <= resp.status_code < 500 and resp.status_code not in RETRYABLE_CLIENT_STATUS
            logger.warning(
                "回调主服务失败 attempt=%s/%s status=%s permanent=%s body=%s",
                attempt,
                max_attempts,
                resp.status_code,
                permanent,
                resp.text[:200],
            )
            if permanent:
                return DeliveryOutcome(
                    ok=False,
                    attempts=attempt,
                    status_code=resp.status_code,
                    last_error=last_error,
                    permanent=True,
                )
        if attempt < max_attempts:
            await sleeper(callback_delay_seconds(attempt))
    return DeliveryOutcome(ok=False, attempts=max_attempts, last_error=last_error)


async def deliver_callback(
    *,
    run_id: str,
    proposal_id: str | None,
    status: str,
    payload: dict[str, Any] | None = None,
    error: dict[str, Any] | None = None,
    internal_url: str | None = None,
    secret: str | None = None,
    timeout_seconds: float | None = None,
    max_attempts: int | None = None,
    client: httpx.AsyncClient | None = None,
    sleeper: Any = asyncio.sleep,
) -> DeliveryOutcome:
    """投递回调；失败（含永久失败）→ 落死信并输出可告警日志。"""
    from ..config import get_settings  # 局部导入：避免模块导入期读取配置（利于测试注入）

    settings = get_settings()
    url = (internal_url or settings.main_service_internal_url).rstrip("/") + CALLBACK_PATH
    api_secret = secret if secret is not None else settings.ai_service_token
    body = build_callback_body(run_id, proposal_id, status, payload=payload, error=error)
    outcome = await deliver(
        url,
        body,
        run_id=run_id,
        secret=api_secret,
        timeout_seconds=(
            timeout_seconds if timeout_seconds is not None else settings.callback_timeout_seconds
        ),
        max_attempts=max_attempts if max_attempts is not None else settings.ai_callback_max_attempts,
        client=client,
        sleeper=sleeper,
    )
    if not outcome.ok:
        await dead_letter.record_dead_letter(
            run_id=run_id,
            proposal_id=proposal_id,
            status=status,
            attempts=outcome.attempts,
            last_error=outcome.last_error or "unknown",
            body=body,
        )
    return outcome


@dataclass
class ReplayResult:
    ok: bool
    entry_id: str
    detail: str
    delivery: DeliveryOutcome | None = None


async def replay_dead_letter(
    entry_id: str,
    *,
    client: httpx.AsyncClient | None = None,
    sleeper: Any = asyncio.sleep,
) -> ReplayResult | None:
    """重放一条死信（同一 `Idempotency-Key` → 主服务去重，重复重放安全）。"""
    from ..config import get_settings

    store = dead_letter.get_dead_letter_store()
    entry = await store.get(entry_id)
    if entry is None:
        return None
    settings = get_settings()
    url = settings.main_service_internal_url.rstrip("/") + CALLBACK_PATH
    outcome = await deliver(
        url,
        entry.body,
        run_id=entry.run_id,
        secret=settings.ai_service_token,
        timeout_seconds=settings.callback_timeout_seconds,
        max_attempts=1,  # 重放即人工/巡检触发：单次尝试后如实回报，避免阻塞接口
        client=client,
        sleeper=sleeper,
    )
    detail = (
        f"ok status={outcome.status_code}"
        if outcome.ok
        else f"failed attempts={outcome.attempts} error={(outcome.last_error or '')[:200]}"
    )
    await store.mark_replayed(entry_id, detail)
    logger.info("ai_dead_letter_replay: entry=%s run_id=%s %s", entry_id, entry.run_id, detail)
    return ReplayResult(ok=outcome.ok, entry_id=entry_id, detail=detail, delivery=outcome)
