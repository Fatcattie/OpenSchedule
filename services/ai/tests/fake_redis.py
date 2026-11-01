"""假 Redis 客户端（R11 单测用）：只实现 run_store / dead_letter 用到的命令子集。

为什么不用 fakeredis：门禁要验证的是**键布局与语义**（TTL、LTRIM 有界、zset 排序、
孤儿清扫），不是 Redis 本身。自建假客户端让这些断言显式可读，且不引入新依赖。
"""
from __future__ import annotations

from typing import Any


def _trim(items: list[Any], start: int, stop: int) -> None:
    """实现 LTRIM 语义（含负数下标）。"""
    n = len(items)
    if start < 0:
        start = max(0, n + start)
    if stop < 0:
        stop = n + stop
    del items[stop + 1 :]
    del items[:start]


class FakePipeline:
    """收集命令，`execute()` 时一次性套用（模拟 redis pipeline 的原子提交语义）。"""

    def __init__(self, redis: FakeRedis) -> None:
        self._redis = redis
        self._ops: list[tuple[str, tuple, dict]] = []

    def __getattr__(self, name: str) -> Any:
        def recorder(*args: Any, **kwargs: Any) -> FakePipeline:
            self._ops.append((name, args, kwargs))
            return self

        return recorder

    async def execute(self) -> list[Any]:
        out = []
        for name, args, kwargs in self._ops:
            out.append(await getattr(self._redis, name)(*args, **kwargs))
        self._ops.clear()
        return out


class FakeRedis:
    """内存版 Redis 子集：string/hash/list/zset + expire。"""

    def __init__(self) -> None:
        self.hashes: dict[str, dict[str, str]] = {}
        self.lists: dict[str, list[str]] = {}
        self.zsets: dict[str, dict[str, float]] = {}
        self.expires: dict[str, int] = {}
        self.closed = False
        self.commands: list[str] = []

    def pipeline(self) -> FakePipeline:
        return FakePipeline(self)

    # —— hash ——
    async def hset(
        self,
        key: str,
        field: str | None = None,
        value: str | None = None,
        mapping: dict[str, str] | None = None,
        **kwargs: Any,
    ) -> int:
        self.commands.append("hset")
        bucket = self.hashes.setdefault(key, {})
        payload: dict[str, Any] = {}
        if field is not None:
            payload[field] = value if value is not None else ""
        payload.update(mapping or {})
        payload.update(kwargs)
        for name, item in payload.items():
            bucket[str(name)] = str(item)
        return len(payload)

    async def hgetall(self, key: str) -> dict[str, str]:
        self.commands.append("hgetall")
        return dict(self.hashes.get(key, {}))

    # —— list ——
    async def rpush(self, key: str, *values: str) -> int:
        self.commands.append("rpush")
        self.lists.setdefault(key, []).extend(str(v) for v in values)
        return len(self.lists[key])

    async def lpush(self, key: str, *values: str) -> int:
        self.commands.append("lpush")
        bucket = self.lists.setdefault(key, [])
        for value in values:
            bucket.insert(0, str(value))
        return len(bucket)

    async def ltrim(self, key: str, start: int, stop: int) -> str:
        self.commands.append("ltrim")
        _trim(self.lists.setdefault(key, []), start, stop)
        return "OK"

    async def lrange(self, key: str, start: int, stop: int) -> list[str]:
        self.commands.append("lrange")
        items = list(self.lists.get(key, []))
        if stop < 0:
            stop = len(items) + stop
        return items[start : stop + 1]

    async def llen(self, key: str) -> int:
        self.commands.append("llen")
        return len(self.lists.get(key, []))

    # —— zset ——
    async def zadd(self, key: str, mapping: dict[str, float]) -> int:
        self.commands.append("zadd")
        self.zsets.setdefault(key, {}).update({str(k): float(v) for k, v in mapping.items()})
        return len(mapping)

    async def zrevrange(self, key: str, start: int, stop: int) -> list[str]:
        self.commands.append("zrevrange")
        ordered = sorted(self.zsets.get(key, {}).items(), key=lambda kv: kv[1], reverse=True)
        members = [m for m, _ in ordered]
        if stop < 0:
            stop = len(members) + stop
        return members[start : stop + 1]

    async def zrangebyscore(
        self, key: str, min: Any, max: Any, start: int = 0, num: int | None = None
    ) -> list[str]:
        self.commands.append("zrangebyscore")
        lo = float("-inf") if str(min) in ("-inf", "-infinity") else float(min)
        hi = float("inf") if str(max) in ("+inf", "inf") else float(max)
        scored = sorted(self.zsets.get(key, {}).items(), key=lambda kv: kv[1])
        members = [m for m, score in scored if lo <= score <= hi]
        return members[start : start + num] if num is not None else members[start:]

    # —— 通用 ——
    async def exists(self, key: str) -> int:
        self.commands.append("exists")
        found = key in self.hashes or key in self.lists or key in self.zsets
        return 1 if found else 0

    async def expire(self, key: str, ttl: int) -> int:
        self.commands.append("expire")
        self.expires[key] = int(ttl)
        return 1

    async def ping(self) -> bool:
        self.commands.append("ping")
        return True

    async def aclose(self) -> None:
        self.commands.append("aclose")
        self.closed = True
