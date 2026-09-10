"""AI 拆解路由：POST /ai/decompose（202 + run_id）→ GET /ai/decompose/{run_id}/stream（SSE 推流）。

事件帧协议见 §3.5.3：ai.start → ai.chunk（增量 JSON patch）→ ai.status → ai.done | ai.error。
流程：注册 run → 后台执行（LangGraph plan→validate→emit；LLM 不可用降级模板）→
chunk 逐任务推送 → 回调主服务 /internal/ai/results（AI 永不直连业务库）→ ai.done。
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any, AsyncGenerator

import httpx
from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse

from ..config import get_settings
from ..graphs.decompose_graph import DecomposeState, run_decompose_graph
from ..schemas.decompose import DecomposeRequest
from ..services.llm_client import (
    AI_BUDGET_EXCEEDED,
    AI_INTERNAL_ERROR,
    AI_LLM_AUTH,
    AI_LLM_RATE_LIMITED,
    AI_LLM_TIMEOUT,
    AI_LLM_UNAVAILABLE,
    LLMAuthError,
    LLMBudgetExceededError,
    LLMConnectionError,
    LLMRateLimitError,
    LLMTimeoutError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])

# 事件帧类型（§3.5.3）
EVENT_START = "ai.start"
EVENT_CHUNK = "ai.chunk"
EVENT_STATUS = "ai.status"
EVENT_DONE = "ai.done"
EVENT_ERROR = "ai.error"
_TERMINAL_EVENTS = (EVENT_DONE, EVENT_ERROR)

# run 注册表（内存态；进程重启即失效 → TODO：持久化 run 记录 + 断线重连语义对齐主服务缓冲策略）
_registry: dict[str, "RunState"] = {}
_MAX_REPLAY_FRAMES = 200      # 断线重连可重放的帧上限
_REPLAY_GRACE_SECONDS = 300   # run 结束后保留时间（供重连重放 ai.done）


def _callback_delay_seconds(attempt: int) -> float:
    return min(8.0, 2.0 ** max(0, attempt - 1))


class RunState:
    """单次拆解运行状态：事件队列 + 完成标记 + 已发帧缓存（断线重连重放）。"""

    def __init__(self) -> None:
        self.queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self.finished = asyncio.Event()
        self.frames: list[dict[str, Any]] = []
        self.task: asyncio.Task | None = None  # 后台任务强引用（防 GC 中断执行）


def _format_sse(frame: dict[str, Any]) -> str:
    """格式化为 SSE 文本：event: <name>\\ndata: <json>\\n\\n（§3.5.3）。"""
    return f"event: {frame['event']}\ndata: {json.dumps(frame['data'], ensure_ascii=False)}\n\n"


async def _emit_frame(state: RunState, event: str, data: dict[str, Any]) -> None:
    """写入事件帧：入队（live 消费者）+ 缓存（断线重连重放）。"""
    frame = {"event": event, "data": data}
    state.frames.append(frame)
    if len(state.frames) > _MAX_REPLAY_FRAMES:
        state.frames.pop(0)
    await state.queue.put(frame)


def _cleanup_later(run_id: str) -> None:
    """run 结束后延迟清理注册表（给重连留窗口）。"""
    asyncio.get_running_loop().call_later(_REPLAY_GRACE_SECONDS, _registry.pop, run_id, None)


# ═══════════════ POST /ai/decompose ═══════════════

@router.post("/decompose", status_code=202)
async def create_decompose(
    body: DecomposeRequest,
    x_proposal_id: str | None = Header(default=None, alias="X-Proposal-Id"),
) -> JSONResponse:
    """接受拆解请求：202 + run_id，后台执行，SSE 推流（§3.5.2）。

    X-Proposal-Id（可选扩展）：主服务侧 ai_proposals 草稿 id，随 ai.start/ai.done/回调透传，
    便于主服务将 run_id ↔ proposal_id 关联（骨架允许为空，主服务也可自行关联）。
    """
    run_id = str(uuid.uuid4())
    state = RunState()
    _registry[run_id] = state

    # ai.start：流开始（§3.5.3）
    await _emit_frame(state, EVENT_START, {"run_id": run_id, "proposal_id": x_proposal_id})

    # 后台执行（不阻塞 202 返回；强引用防任务被 GC）
    state.task = asyncio.create_task(_run_decompose(run_id, body, x_proposal_id, state))

    stream_url = f"/ai/decompose/{run_id}/stream"
    response = JSONResponse(
        status_code=202,
        content={"run_id": run_id, "status": "accepted", "stream_url": stream_url},
    )
    response.headers["Location"] = stream_url
    response.headers["X-Run-Id"] = run_id
    return response


async def _run_decompose(
    run_id: str, body: DecomposeRequest, proposal_id: str | None, state: RunState
) -> None:
    """后台流水线：LangGraph（plan→validate→emit）→ chunk 推流 → 回调主服务 → ai.done/ai.error。"""
    settings = get_settings()

    async def emit_status(progress: int, stage: str) -> None:
        await _emit_frame(state, EVENT_STATUS, {"progress": progress, "stage": stage})

    try:
        await emit_status(5, "planning")

        # 1) 生成 + 校验（LLM → L1 → L2，失败重试 ≤3，再失败降级模板；逻辑见 decompose_graph）
        initial: DecomposeState = {
            "run_id": run_id,
            "proposal_id": proposal_id,
            "request": body.model_dump(mode="json"),
            "retries": 0,
            "max_retries": settings.llm_max_retries,
            "degraded": False,
            "emit_status": emit_status,
        }
        final_state = await run_decompose_graph(initial)
        result = final_state["result"]
        assert result is not None, "拆解图必须以合法结果终止（emit 节点模板兜底）"

        await emit_status(80, "validating")

        # 2) 增量 chunk 帧：逐任务推送（前端按块渲染，§3.5.3）
        await emit_status(90, "emitting")
        payload = result.model_dump(mode="json")
        for task in payload["tasks"]:
            await _emit_frame(state, EVENT_CHUNK, {"op": "add", "path": "/tasks/-", "value": task})
        await _emit_frame(state, EVENT_CHUNK, {"op": "replace", "path": "/summary", "value": payload["summary"]})
        await _emit_frame(state, EVENT_CHUNK, {"op": "replace", "path": "/warnings", "value": payload["warnings"]})

        # 3) 回调主服务（AI 永不直连业务库；主服务写回 ai_proposals 草稿，§3.5.2）
        await _notify_main_service(run_id, proposal_id, "succeeded", payload=payload)

        # 4) ai.done：完整结构化草稿（严格符合 §3.5.2 schema）
        await _emit_frame(state, EVENT_DONE, {"proposal_id": proposal_id, "payload": payload})
    except Exception as exc:  # 兜底：任何未预期异常 → ai.error + 失败回调
        logger.exception("decompose run %s 失败", run_id)
        code, message = _classify_exception(exc)
        await _emit_frame(state, EVENT_ERROR, {"code": code, "message": message})
        await _notify_main_service(run_id, proposal_id, "failed", error={"code": code, "message": message})
    finally:
        state.finished.set()
        _cleanup_later(run_id)


def _classify_exception(exc: Exception) -> tuple[str, str]:
    """异常 → ai.error 错误码（§3.5.3 {code, message}）。"""
    if isinstance(exc, LLMConnectionError):
        return AI_LLM_UNAVAILABLE, str(exc)
    if isinstance(exc, LLMTimeoutError):
        return AI_LLM_TIMEOUT, str(exc)
    if isinstance(exc, LLMAuthError):
        return AI_LLM_AUTH, str(exc)
    if isinstance(exc, LLMRateLimitError):
        return AI_LLM_RATE_LIMITED, str(exc)
    if isinstance(exc, LLMBudgetExceededError):
        return AI_BUDGET_EXCEEDED, str(exc)
    return AI_INTERNAL_ERROR, f"{type(exc).__name__}: {exc}"


async def _notify_main_service(
    run_id: str,
    proposal_id: str | None,
    status: str,
    *,
    payload: dict[str, Any] | None = None,
    error: dict[str, Any] | None = None,
) -> None:
    """回调主服务 POST /internal/ai/results（§3.5.2）：主服务据此写回 ai_proposals 草稿。

    骨架为尽力而为（best-effort）：失败打日志。TODO：重试退避/死信队列（与主服务 ack
    语义对齐后实现）；回调可升级为 HMAC 双端签名校验。
    """
    settings = get_settings()
    url = settings.main_service_internal_url.rstrip("/") + "/internal/ai/results"
    body: dict[str, Any] = {"run_id": run_id, "proposal_id": proposal_id, "status": status}
    if payload is not None:
        body["payload"] = payload
    if error is not None:
        body["error"] = error
    headers = {
        "Authorization": f"Bearer {settings.ai_service_token}",
        "Idempotency-Key": f"ai-run:{run_id}",  # §3.1 幂等约定：主服务 24h 去重
        "Content-Type": "application/json",
    }
    for attempt in range(1, 4):
        try:
            async with httpx.AsyncClient(timeout=settings.callback_timeout_seconds) as client:
                resp = await client.post(url, json=body, headers=headers)
            if resp.status_code < 300:
                logger.info("回调主服务成功 run_id=%s status=%s attempt=%s", run_id, status, attempt)
                return
            logger.warning("回调主服务失败 status=%s attempt=%s body=%s", resp.status_code, attempt, resp.text[:200])
        except httpx.HTTPError as exc:
            logger.warning("回调主服务异常 attempt=%s：%s", attempt, exc)
        if attempt < 3:
            await asyncio.sleep(_callback_delay_seconds(attempt))
    logger.error("回调主服务重试耗尽 run_id=%s status=%s", run_id, status)


# ═══════════════ GET /ai/decompose/{run_id}/stream ═══════════════

@router.get("/decompose/{run_id}/stream")
async def stream_decompose(run_id: str) -> StreamingResponse:
    """SSE 推流（§3.5.3）。断线重连：先重放已发帧，再消费 live 队列。"""
    state = _registry.get(run_id)
    if state is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "AI_RUN_NOT_FOUND", "message": "run 不存在或已过期（重连语义见 README TODO）"},
        )
    return StreamingResponse(
        _sse_events(state),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _sse_events(state: RunState) -> AsyncGenerator[str, None]:
    """SSE 异步生成器：重放历史帧 → 消费 live 队列 → 心跳保活 → 终帧收尾。"""
    # 断线重连：重放已发帧
    for frame in state.frames:
        yield _format_sse(frame)
    if state.frames and state.frames[-1]["event"] in _TERMINAL_EVENTS:
        return  # 已结束：重放即完整（含 ai.done/ai.error）
    while True:
        try:
            frame = await asyncio.wait_for(state.queue.get(), timeout=30.0)
        except asyncio.TimeoutError:
            if state.finished.is_set():
                break  # 结束且无剩余帧
            yield ": keep-alive\n\n"  # 心跳保活（LLM 长调用期间防代理/浏览器断连）
            continue
        yield _format_sse(frame)
        if frame["event"] in _TERMINAL_EVENTS:
            break
