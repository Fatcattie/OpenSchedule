"""回调死信队列（R11 / §3.5.2）：回调主服务失败后的可查询、可重放、可告警记录。

为什么需要：拆解结果的落库依赖「AI → 主服务 /internal/ai/results」这一次外呼。
主服务短暂不可用/部署窗口内的回调会彻底丢失（原实现只打日志），导致 run 终态
在主服务侧永远停留在 running。死信把失败的投递**持久化留痕**，并提供重放入口
（重放沿用同一 `Idempotency-Key`，主服务 24h 去重 → 重放幂等，见 §3.1）。

存储形态与 run_store 一致：redis（生产）/ memory（开发与单测）。设计要求
「不使用仅本地文件」，因此这里没有任何文件后端。
"""
from __future__ import annotations

import json
import logging
import time
import uuid
from dataclasses import asdict, dataclass, field
from typing import Any, Protocol

from ..config import get_settings

logger = logging.getLogger(__name__)

DLQ_IDS_KEY = "osai:dlq:ids"
DLQ_ENTRY_PREFIX = "osai:dlq:"
KIND_CALLBACK = "ai_callback"


@dataclass
class DeadLetterEntry:
    """一条死信：投递目标 + 原始报文 + 失败原因 + 重放结果。"""

    id: str
    kind: str = KIND_CALLBACK
    run_id: str = ""
    proposal_id: str | None = None
    status: str = ""
    attempts: int = 0
    last_error: str = ""
    body: dict[str, Any] = field(default_factory=dict)
    created_at: float = 0.0
    replayed_at: float | None = None
    replay_result: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class DeadLetterStore(Protocol):
    async def add(self, entry: DeadLetterEntry) -> DeadLetterEntry: ...

    async def list(self, limit: int = 50) -> list[DeadLetterEntry]: ...

    async def get(self, entry_id: str) -> DeadLetterEntry | None: ...

    async def mark_replayed(self, entry_id: str, result: str) -> DeadLetterEntry | None: ...

    async def count(self) -> int: ...

    async def ping(self) -> bool: ...

    async def close(self) -> None: ...


class MemoryDeadLetterStore:
    """单进程实现（开发/单测）。有界，避免长跑进程无界增长。"""

    def __init__(self, *, max_entries: int | None = None) -> None:
        self._entries: list[DeadLetterEntry] = []
        self._max = max_entries or get_settings().ai_dlq_max_entries

    async def add(self, entry: DeadLetterEntry) -> DeadLetterEntry:
        if not entry.id:
            entry.id = str(uuid.uuid4())
        if not entry.created_at:
            entry.created_at = time.time()
        self._entries.insert(0, entry)
        del self._entries[self._max :]
        return entry

    async def list(self, limit: int = 50) -> list[DeadLetterEntry]:
        return self._entries[:limit]

    async def get(self, entry_id: str) -> DeadLetterEntry | None:
        return next((e for e in self._entries if e.id == entry_id), None)

    async def mark_replayed(self, entry_id: str, result: str) -> DeadLetterEntry | None:
        entry = await self.get(entry_id)
        if entry is None:
            return None
        entry.replayed_at = time.time()
        entry.replay_result = result
        return entry

    async def count(self) -> int:
        return len(self._entries)

    async def ping(self) -> bool:
        return True

    async def close(self) -> None:
        return None


class RedisDeadLetterStore:
    """Redis 实现：`osai:dlq:ids`（有界索引）+ `osai:dlq:{id}`（条目 hash，带 TTL）。"""

    def __init__(
        self, client: Any, *, max_entries: int | None = None, ttl_seconds: int | None = None
    ) -> None:
        self._client = client
        settings = get_settings()
        self._max = max_entries or settings.ai_dlq_max_entries
        self._ttl = ttl_seconds or settings.ai_state_ttl_seconds

    @staticmethod
    async def from_url(url: str, **kwargs: Any) -> RedisDeadLetterStore:
        import redis.asyncio as redis

        return RedisDeadLetterStore(redis.Redis.from_url(url, decode_responses=True, **kwargs))

    def _key(self, entry_id: str) -> str:
        return f"{DLQ_ENTRY_PREFIX}{entry_id}"

    async def add(self, entry: DeadLetterEntry) -> DeadLetterEntry:
        if not entry.id:
            entry.id = str(uuid.uuid4())
        if not entry.created_at:
            entry.created_at = time.time()
        payload = entry.to_dict()
        pipe = self._client.pipeline()
        pipe.hset(
            self._key(entry.id),
            mapping={
                "id": entry.id,
                "kind": entry.kind,
                "run_id": entry.run_id,
                "proposal_id": entry.proposal_id or "",
                "status": entry.status,
                "attempts": str(entry.attempts),
                "last_error": entry.last_error,
                "body": json.dumps(entry.body, ensure_ascii=False),
                "created_at": str(payload["created_at"]),
                "replayed_at": "",
                "replay_result": "",
            },
        )
        pipe.expire(self._key(entry.id), self._ttl)
        pipe.lpush(DLQ_IDS_KEY, entry.id)
        pipe.ltrim(DLQ_IDS_KEY, 0, self._max - 1)
        await pipe.execute()
        return entry

    def _to_entry(self, raw: dict[str, str]) -> DeadLetterEntry:
        return DeadLetterEntry(
            id=raw.get("id", ""),
            kind=raw.get("kind", KIND_CALLBACK),
            run_id=raw.get("run_id", ""),
            proposal_id=raw.get("proposal_id") or None,
            status=raw.get("status", ""),
            attempts=int(raw.get("attempts") or 0),
            last_error=raw.get("last_error", ""),
            body=json.loads(raw["body"]) if raw.get("body") else {},
            created_at=float(raw.get("created_at") or 0.0),
            replayed_at=float(raw["replayed_at"]) if raw.get("replayed_at") else None,
            replay_result=raw.get("replay_result") or None,
        )

    async def list(self, limit: int = 50) -> list[DeadLetterEntry]:
        ids = await self._client.lrange(DLQ_IDS_KEY, 0, max(0, limit - 1))
        out: list[DeadLetterEntry] = []
        for entry_id in ids:
            raw = await self._client.hgetall(self._key(entry_id))
            if raw:
                out.append(self._to_entry(raw))
        return out

    async def get(self, entry_id: str) -> DeadLetterEntry | None:
        raw = await self._client.hgetall(self._key(entry_id))
        return self._to_entry(raw) if raw else None

    async def mark_replayed(self, entry_id: str, result: str) -> DeadLetterEntry | None:
        key = self._key(entry_id)
        if not await self._client.exists(key):
            return None
        await self._client.hset(key, mapping={"replayed_at": str(time.time()), "replay_result": result})
        return await self.get(entry_id)

    async def count(self) -> int:
        return int(await self._client.llen(DLQ_IDS_KEY))

    async def ping(self) -> bool:
        try:
            await self._client.ping()
            return True
        except Exception:  # noqa: BLE001
            return False

    async def close(self) -> None:
        try:
            await self._client.aclose()
        except Exception:  # noqa: BLE001
            logger.debug("redis 客户端关闭异常", exc_info=True)


_dlq: DeadLetterStore | None = None


def set_dead_letter_store(store: DeadLetterStore | None) -> None:
    """注入/重置死信存储（测试与启动装配用）。"""
    global _dlq
    _dlq = store


def get_dead_letter_store() -> DeadLetterStore:
    """当前死信存储；未装配时用 memory（测试友好，且不会因缺配置而崩）。"""
    global _dlq
    if _dlq is None:
        _dlq = MemoryDeadLetterStore()
    return _dlq


async def init_dead_letter_store() -> tuple[DeadLetterStore, str]:
    """按 run 存储同一套配置装配死信存储（共享 Redis URL，键前缀独立）。"""
    settings = get_settings()
    mode = (settings.ai_run_store or "auto").strip().lower()
    if mode == "memory":
        store: DeadLetterStore = MemoryDeadLetterStore()
        set_dead_letter_store(store)
        return store, "memory"
    try:
        store = await RedisDeadLetterStore.from_url(settings.ai_state_redis_url)
        if not await store.ping():
            raise ConnectionError("ping 失败")
    except Exception as exc:  # noqa: BLE001
        if mode == "redis":
            raise RuntimeError(f"AI_RUN_STORE=redis 但死信 Redis 不可用：{exc}") from exc
        fallback: DeadLetterStore = MemoryDeadLetterStore()
        set_dead_letter_store(fallback)
        logger.warning("ai_dead_letter_degraded: Redis 不可用，死信降级 memory（重启丢失）")
        return fallback, "memory"
    set_dead_letter_store(store)
    return store, "redis"


async def record_dead_letter(
    *,
    run_id: str,
    proposal_id: str | None,
    status: str,
    attempts: int,
    last_error: str,
    body: dict[str, Any],
) -> DeadLetterEntry:
    """落一条死信并**输出可告警日志**（结构化字段，供日志告警规则命中）。"""
    entry = await get_dead_letter_store().add(
        DeadLetterEntry(
            id=str(uuid.uuid4()),
            run_id=run_id,
            proposal_id=proposal_id,
            status=status,
            attempts=attempts,
            last_error=last_error,
            body=body,
        )
    )
    logger.error(
        "ai_callback_dead_letter: 回调重试耗尽，已入死信 "
        "run_id=%s status=%s attempts=%s dlq_id=%s last_error=%s",
        run_id,
        status,
        attempts,
        entry.id,
        last_error[:200],
    )
    # 局部导入：metrics 依赖本模块的 get_dead_letter_store，顶层互相 import 会成环
    from .metrics import inc_dead_letters_recorded

    inc_dead_letters_recorded()
    return entry
