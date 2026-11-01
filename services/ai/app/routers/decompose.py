"""AI 拆解路由：POST /ai/decompose（202 + run_id）→ GET /ai/decompose/{run_id}/stream（SSE 推流）。

事件帧协议见 §3.5.3：ai.start → ai.chunk（增量 JSON patch）→ ai.status → ai.done | ai.error。
流程：注册 run（**持久化**，R11）→ 后台执行（LangGraph plan→validate→emit；LLM 不可用降级模板）→
chunk 逐任务推送 → **HMAC 签名**回调主服务 /internal/ai/results（失败入死信，R11）→ ai.done。

R11 加固点：
  - run 状态与已发帧落持久化存储（`run_store`）→ 进程重启后仍可重放（状态与帧可恢复）；
  - 回调带 HMAC 签名（与主服务验签逐字对齐）+ 幂等键 + 有界重试，重试耗尽入**死信**；
  - 死信管理接口：GET /ai/dead-letters、POST /ai/dead-letters/{id}/replay（均需服务 token）。
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import JSONResponse, StreamingResponse

from ..config import get_settings
from ..graphs.decompose_graph import DecomposeState, run_decompose_graph
from ..schemas.decompose import DecomposeRequest
from ..services import callback_delivery, dead_letter, sentry
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
from ..services.run_store import (
    RUN_INTERRUPTED,
    STATUS_FAILED,
    STATUS_INTERRUPTED,
    STATUS_SUCCEEDED,
    RunRecord,
    get_run_store,
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

# 进程内 run 注册表（live 消费者队列 + 强引用后台任务）；持久化状态在 run_store（R11）
_registry: dict[str, RunState] = {}
_MAX_REPLAY_FRAMES = 200      # 断线重连可重放的帧上限（与 AI_STATE_MAX_FRAMES 对齐）
_REPLAY_GRACE_SECONDS = 300   # run 结束后内存注册表保留时间（含终帧重放窗口）


class RunState:
    """单次拆解运行的**进程内**运行态：事件队列 + 完成标记 + 已发帧缓存 + 后台任务强引用。

    已发帧同时写入持久化存储（`state.store`），因此进程重启后仍可从存储重放（R11）。
    """

    def __init__(self, run_id: str | None = None, store: Any = None) -> None:
        self.run_id = run_id
        self.store = store
        self.queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self.finished = asyncio.Event()
        self.frames: list[dict[str, Any]] = []
        self.task: asyncio.Task | None = None  # 后台任务强引用（防 GC 中断执行）


def _format_sse(frame: dict[str, Any]) -> str:
    """格式化为 SSE 文本：event: <name>\\ndata: <json>\\n\\n（§3.5.3）。"""
    return f"event: {frame['event']}\ndata: {json.dumps(frame['data'], ensure_ascii=False)}\n\n"


async def _emit_frame(state: RunState, event: str, data: dict[str, Any]) -> None:
    """写入事件帧：入队（live 消费者）+ 内存缓存（本进程重放）+ 持久化（跨重启重放，R11）。"""
    frame = {"event": event, "data": data}
    state.frames.append(frame)
    if len(state.frames) > _MAX_REPLAY_FRAMES:
        state.frames.pop(0)
    if state.store is not None and state.run_id:
        await state.store.append_frame(state.run_id, frame)
    await state.queue.put(frame)


def _cleanup_later(run_id: str) -> None:
    """run 结束后延迟清理**内存**注册表（给重连留窗口）；持久化记录按 TTL 保留。"""
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
    store = get_run_store()
    await store.create(run_id, proposal_id=x_proposal_id)
    state = RunState(run_id=run_id, store=store)
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
            "request": body.model_dump(mode="json"),  # 不含 llm（exclude）
            "llm": body.llm,
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
        await _emit_frame(
            state, EVENT_CHUNK, {"op": "replace", "path": "/summary", "value": payload["summary"]}
        )
        await _emit_frame(
            state, EVENT_CHUNK, {"op": "replace", "path": "/warnings", "value": payload["warnings"]}
        )

        # 3) 回调主服务（AI 永不直连业务库；主服务写回 ai_proposals 草稿，§3.5.2）
        await _notify_main_service(run_id, proposal_id, "succeeded", payload=payload)
        if state.store is not None:
            await state.store.set_status(run_id, STATUS_SUCCEEDED)

        # 4) ai.done：完整结构化草稿（严格符合 §3.5.2 schema）
        await _emit_frame(state, EVENT_DONE, {"proposal_id": proposal_id, "payload": payload})
    except Exception as exc:  # 兜底：任何未预期异常 → ai.error + 失败回调
        logger.exception("decompose run %s 失败", run_id)
        code, message = _classify_exception(exc)
        if code == AI_INTERNAL_ERROR:  # 只报非预期异常；LLM 超时/限流/鉴权属运维信号，走指标
            sentry.capture_exception(exc, {"run_id": run_id, "route": "/ai/decompose"})
        error = {"code": code, "message": message}
        await _emit_frame(state, EVENT_ERROR, error)
        await _notify_main_service(run_id, proposal_id, "failed", error=error)
        if state.store is not None:
            await state.store.set_status(run_id, STATUS_FAILED, error=error)
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
    """回调主服务 POST /internal/ai/results（§3.5.2 / §3.3）：

    HMAC 签名 + 幂等键 + 有界重试；重试耗尽 → 死信（R11）。
    """
    await callback_delivery.deliver_callback(
        run_id=run_id, proposal_id=proposal_id, status=status, payload=payload, error=error
    )


# ═══════════════ GET /ai/decompose/{run_id}/stream ═══════════════

@router.get("/decompose/{run_id}/stream")
async def stream_decompose(run_id: str) -> StreamingResponse:
    """SSE 推流（§3.5.3）。断线重连：先重放已发帧，再消费 live 队列。

    进程重启后（内存注册表已丢）：从持久化存储恢复 run 记录，重放已发帧；
    若记录已终结则补终帧后收流（R11：状态与帧可恢复）。
    """
    state = _registry.get(run_id)
    if state is not None:
        return StreamingResponse(
            _sse_events(state),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    record = await get_run_store().get(run_id)
    if record is None:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "AI_RUN_NOT_FOUND",
                "message": "run 不存在或已过期（帧保留窗口见 AI_STATE_TTL_SECONDS）",
            },
        )
    logger.info(
        "ai_run_resumed_from_store: run_id=%s status=%s frames=%s（内存态已丢失，走持久化重放）",
        run_id,
        record.status,
        len(record.frames),
    )
    return StreamingResponse(
        _sse_replay(record),
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
        except TimeoutError:
            if state.finished.is_set():
                break  # 结束且无剩余帧
            yield ": keep-alive\n\n"  # 心跳保活（LLM 长调用期间防代理/浏览器断连）
            continue
        yield _format_sse(frame)
        if frame["event"] in _TERMINAL_EVENTS:
            break


async def _sse_replay(record: RunRecord) -> AsyncGenerator[str, None]:
    """从持久化记录重放（R11）：已发帧原样回放；未终帧则补一帧确定性 ai.error 后收流。

    补帧语义：进程重启后 run 无法续跑（无检查点），若不给终帧，重连客户端会**永久挂起**。
    因此这里补 `AI_RUN_INTERRUPTED` 并把记录标为 interrupted——让主服务能确定地重试/告警。
    """
    store = get_run_store()
    for frame in record.frames:
        yield _format_sse(frame)
    if record.has_terminal_frame:
        return
    error = {
        "code": RUN_INTERRUPTED,
        "message": "AI 服务重启，run 未能续跑（状态与帧已保留，可重放重试）",
    }
    await store.append_frame(record.run_id, {"event": EVENT_ERROR, "data": error})
    await store.set_status(record.run_id, STATUS_INTERRUPTED, error=error)
    yield _format_sse({"event": EVENT_ERROR, "data": error})


# ═══════════════ 死信管理（R11：可查询 / 可重放 / 可告警） ═══════════════

@router.get("/dead-letters")
async def list_dead_letters(limit: int = Query(default=50, ge=1, le=200)) -> dict[str, Any]:
    """列出回调死信（最近在前），并带总数与存储形态。"""
    store = dead_letter.get_dead_letter_store()
    entries = await store.list(limit)
    return {
        "data": {
            "total": await store.count(),
            "items": [e.to_dict() for e in entries],
        }
    }


@router.post("/dead-letters/{entry_id}/replay")
async def replay_dead_letter(entry_id: str) -> JSONResponse:
    """重放一条死信：沿用原报文的 `Idempotency-Key` → 主服务去重（重复重放安全）。"""
    result = await callback_delivery.replay_dead_letter(entry_id)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "AI_DEAD_LETTER_NOT_FOUND", "message": "死信不存在或已过期"},
        )
    return JSONResponse(
        status_code=200 if result.ok else 502,
        content={"entry_id": result.entry_id, "replayed": result.ok, "detail": result.detail},
    )

