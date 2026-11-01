"""run 状态持久化（R11）：AI 服务重启后 run 状态与已发帧可恢复。

背景：原实现把 run 放在进程内 `_registry`（内存），进程重启即丢失——SSE 断线重连、
客户端重放、运维排查全部失效。R11 引入可插拔的持久化后端：

- `redis`：生产形态（`ai_run_store=redis`）。键布局（DB 独立于主服务，默认 db 3）：
    osai:run:{run_id}         hash  → proposal_id / status / created_at / updated_at / error
    osai:run:{run_id}:frames  list  → 已发帧（JSON 文本，RPUSH + LTRIM 保最近 N 帧）
    osai:runs                 zset  → member=run_id, score=updated_at（列表 / 孤儿清扫）
  所有键都带 TTL（`ai_state_ttl_seconds`），避免无界增长。
- `memory`：单进程开发/单测形态（无外部依赖）。
- `auto`（默认）：探测 Redis；连不上则降级 memory 并**显式告警**（`ai_run_store_degraded`），
  绝不让「持久化静默失效」。

**明确的边界**：持久化让「状态与帧」可恢复，但**不提供执行续跑**（拆解流水线没有检查点）。
因此启动时会清扫上一进程遗留的 running 记录，统一标记为 `interrupted` 并补一帧 `ai.error`
（code=AI_RUN_INTERRUPTED），使重连客户端得到确定性的终态而不是永久挂起。
"""
from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Protocol

from ..config import get_settings

logger = logging.getLogger(__name__)

STATUS_RUNNING = "running"
STATUS_SUCCEEDED = "succeeded"
STATUS_FAILED = "failed"
STATUS_INTERRUPTED = "interrupted"
TERMINAL_STATUSES = (STATUS_SUCCEEDED, STATUS_FAILED, STATUS_INTERRUPTED)

RUN_INTERRUPTED = "AI_RUN_INTERRUPTED"

KEY_PREFIX = "osai:run:"
RUNS_INDEX = "osai:runs"


@dataclass
class RunRecord:
    """一次拆解的持久化状态：元信息 + 已发帧（可重放）。"""

    run_id: str
    proposal_id: str | None = None
    status: str = STATUS_RUNNING
    created_at: float = 0.0
    updated_at: float = 0.0
    error: dict[str, Any] | None = None
    frames: list[dict[str, Any]] = field(default_factory=list)

    @property
    def terminal(self) -> bool:
        """状态已终结（不代表最后一帧一定是终帧——见 interrupted 补齐语义）。"""
        return self.status in TERMINAL_STATUSES

    @property
    def has_terminal_frame(self) -> bool:
        return bool(self.frames) and self.frames[-1].get("event") in ("ai.done", "ai.error")

    def to_meta(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "proposal_id": self.proposal_id,
            "status": self.status,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "error": self.error,
            "frames": len(self.frames),
        }


class RunStore(Protocol):
    """存储契约（memory / redis 两种实现，测试可注入假实现）。"""

    async def create(self, run_id: str, *, proposal_id: str | None = None) -> None: ...

    async def append_frame(self, run_id: str, frame: dict[str, Any]) -> None: ...

    async def get(self, run_id: str) -> RunRecord | None: ...

    async def set_status(
        self, run_id: str, status: str, *, error: dict[str, Any] | None = None
    ) -> None: ...

    async def list_runs(self, limit: int = 50) -> list[dict[str, Any]]: ...

    async def recover_orphans(self, *, idle_seconds: float = 60.0) -> list[str]: ...

    async def ping(self) -> bool: ...

    async def close(self) -> None: ...


class MemoryRunStore:
    """单进程实现（开发/单测；进程重启即丢失——因此仅供非生产使用）。"""

    def __init__(self, *, max_frames: int | None = None) -> None:
        self._records: dict[str, RunRecord] = {}
        settings = get_settings()
        self._max_frames = max_frames or settings.ai_state_max_frames

    async def create(self, run_id: str, *, proposal_id: str | None = None) -> None:
        now = time.time()
        self._records[run_id] = RunRecord(
            run_id=run_id, proposal_id=proposal_id, created_at=now, updated_at=now
        )

    async def append_frame(self, run_id: str, frame: dict[str, Any]) -> None:
        record = self._records.get(run_id)
        if record is None:
            return
        record.frames.append(frame)
        if len(record.frames) > self._max_frames:
            del record.frames[: len(record.frames) - self._max_frames]
        record.updated_at = time.time()

    async def get(self, run_id: str) -> RunRecord | None:
        return self._records.get(run_id)

    async def set_status(
        self, run_id: str, status: str, *, error: dict[str, Any] | None = None
    ) -> None:
        record = self._records.get(run_id)
        if record is None:
            return
        record.status = status
        record.error = error
        record.updated_at = time.time()

    async def list_runs(self, limit: int = 50) -> list[dict[str, Any]]:
        ordered = sorted(self._records.values(), key=lambda r: r.updated_at, reverse=True)
        return [r.to_meta() for r in ordered[:limit]]

    async def recover_orphans(self, *, idle_seconds: float = 60.0) -> list[str]:
        now = time.time()
        recovered: list[str] = []
        for record in self._records.values():
            if record.status == STATUS_RUNNING and now - record.updated_at >= idle_seconds:
                record.status = STATUS_INTERRUPTED
                record.updated_at = now
                recovered.append(record.run_id)
        return recovered

    async def ping(self) -> bool:
        return True

    async def close(self) -> None:
        return None


class RedisRunStore:
    """Redis 实现（生产形态）。客户端可注入，便于单测用假客户端验证键布局与语义。"""

    def __init__(self, client: Any, *, max_frames: int | None = None, ttl_seconds: int | None = None) -> None:
        self._client = client
        settings = get_settings()
        self._max_frames = max_frames or settings.ai_state_max_frames
        self._ttl = ttl_seconds or settings.ai_state_ttl_seconds

    @staticmethod
    async def from_url(url: str, **kwargs: Any) -> RedisRunStore:
        import redis.asyncio as redis  # 延迟导入：memory 形态无需该依赖

        client = redis.Redis.from_url(url, decode_responses=True, **kwargs)
        return RedisRunStore(client)

    def _meta_key(self, run_id: str) -> str:
        return f"{KEY_PREFIX}{run_id}"

    def _frames_key(self, run_id: str) -> str:
        return f"{KEY_PREFIX}{run_id}:frames"

    async def create(self, run_id: str, *, proposal_id: str | None = None) -> None:
        now = time.time()
        pipe = self._client.pipeline()
        pipe.hset(
            self._meta_key(run_id),
            mapping={
                "run_id": run_id,
                "proposal_id": proposal_id or "",
                "status": STATUS_RUNNING,
                "created_at": str(now),
                "updated_at": str(now),
                "error": "",
            },
        )
        pipe.expire(self._meta_key(run_id), self._ttl)
        pipe.zadd(RUNS_INDEX, {run_id: now})
        await pipe.execute()

    async def append_frame(self, run_id: str, frame: dict[str, Any]) -> None:
        meta_key, frames_key = self._meta_key(run_id), self._frames_key(run_id)
        if not await self._client.exists(meta_key):
            return  # run 已过期（TTL）：丢弃迟到帧，避免造出无主键
        pipe = self._client.pipeline()
        pipe.rpush(frames_key, json.dumps(frame, ensure_ascii=False))
        pipe.ltrim(frames_key, -self._max_frames, -1)
        pipe.expire(frames_key, self._ttl)
        pipe.hset(meta_key, "updated_at", str(time.time()))
        pipe.expire(meta_key, self._ttl)
        await pipe.execute()

    async def get(self, run_id: str) -> RunRecord | None:
        meta = await self._client.hgetall(self._meta_key(run_id))
        if not meta:
            return None
        raw_frames = await self._client.lrange(self._frames_key(run_id), 0, -1)
        frames = [json.loads(item) for item in raw_frames]
        error = json.loads(meta["error"]) if meta.get("error") else None
        return RunRecord(
            run_id=run_id,
            proposal_id=meta.get("proposal_id") or None,
            status=meta.get("status") or STATUS_RUNNING,
            created_at=float(meta.get("created_at") or 0.0),
            updated_at=float(meta.get("updated_at") or 0.0),
            error=error,
            frames=frames,
        )

    async def set_status(
        self, run_id: str, status: str, *, error: dict[str, Any] | None = None
    ) -> None:
        key = self._meta_key(run_id)
        if not await self._client.exists(key):
            return
        now = time.time()
        pipe = self._client.pipeline()
        pipe.hset(
            key,
            mapping={
                "status": status,
                "updated_at": str(now),
                "error": json.dumps(error, ensure_ascii=False) if error else "",
            },
        )
        pipe.expire(key, self._ttl)
        pipe.zadd(RUNS_INDEX, {run_id: now})
        await pipe.execute()

    async def list_runs(self, limit: int = 50) -> list[dict[str, Any]]:
        run_ids = await self._client.zrevrange(RUNS_INDEX, 0, max(0, limit - 1))
        out: list[dict[str, Any]] = []
        for run_id in run_ids:
            record = await self.get(run_id)
            if record is not None:
                out.append(record.to_meta())
        return out

    async def recover_orphans(self, *, idle_seconds: float = 60.0) -> list[str]:
        """启动清扫：把上一进程遗留的 running 记录标记为 interrupted（并补终帧）。"""
        cutoff = time.time() - idle_seconds
        stale = await self._client.zrangebyscore(RUNS_INDEX, 0, cutoff, start=0, num=200)
        recovered: list[str] = []
        for run_id in stale:
            record = await self.get(run_id)
            if record is None or record.status != STATUS_RUNNING:
                continue
            error = {
                "code": RUN_INTERRUPTED,
                "message": "AI 服务重启，run 未能续跑（状态与帧已保留，可重放）",
            }
            if not record.has_terminal_frame:
                await self.append_frame(run_id, {"event": "ai.error", "data": error})
            await self.set_status(run_id, STATUS_INTERRUPTED, error=error)
            recovered.append(run_id)
        if recovered:
            logger.warning(
                "ai_run_store_recovered: %s 个 running run 被标记为 interrupted（重启遗留）: %s",
                len(recovered),
                ",".join(recovered),
            )
        return recovered

    async def ping(self) -> bool:
        try:
            await self._client.ping()
            return True
        except Exception:  # noqa: BLE001 - 探测失败即可降级，具体原因由调用方记录
            return False

    async def close(self) -> None:
        try:
            await self._client.aclose()
        except Exception:  # noqa: BLE001 - 关闭失败不阻塞进程退出
            logger.debug("redis 客户端关闭异常", exc_info=True)


# ─────────────── 单例装配 ───────────────

_store: RunStore | None = None


def set_run_store(store: RunStore | None) -> None:
    """注入/重置存储（测试与启动装配用）。"""
    global _store
    _store = store


def get_run_store() -> RunStore:
    """取得当前存储；未装配时按配置惰性装配（默认 memory，避免无配置即崩）。"""
    global _store
    if _store is None:
        _store = MemoryRunStore()
    return _store


async def init_run_store() -> tuple[RunStore, str]:
    """按配置装配存储：redis 显式要求失败即抛（fail-fast），auto 连不上则降级并告警。

    返回 (store, effective_mode)；effective_mode ∈ {redis, memory}。
    """
    settings = get_settings()
    mode = (settings.ai_run_store or "auto").strip().lower()
    if mode not in ("auto", "redis", "memory"):
        raise ValueError(f"AI_RUN_STORE 非法：{mode}（可选 auto|redis|memory）")
    if mode == "memory":
        store: RunStore = MemoryRunStore()
        set_run_store(store)
        logger.info("ai_run_store: memory（单进程，重启不保留——勿用于生产）")
        return store, "memory"

    try:
        store = await RedisRunStore.from_url(settings.ai_state_redis_url)
        if not await store.ping():
            raise ConnectionError("ping 失败")
    except Exception as exc:  # noqa: BLE001 - 依配置决定 fail-fast 还是降级
        if mode == "redis":
            raise RuntimeError(
                f"AI_RUN_STORE=redis 但 Redis 不可用（{settings.ai_state_redis_url}）：{exc}"
            ) from exc
        fallback: RunStore = MemoryRunStore()
        set_run_store(fallback)
        logger.warning(
            "ai_run_store_degraded: Redis 不可用（%s），已降级 memory——run 状态不会跨重启保留（原因：%s）",
            settings.ai_state_redis_url,
            exc,
        )
        return fallback, "memory"

    set_run_store(store)
    recovered = await store.recover_orphans()
    logger.info(
        "ai_run_store: redis（%s，ttl=%ss，max_frames=%s，孤儿清扫 %s 个）",
        settings.ai_state_redis_url,
        settings.ai_state_ttl_seconds,
        settings.ai_state_max_frames,
        len(recovered),
    )
    return store, "redis"
