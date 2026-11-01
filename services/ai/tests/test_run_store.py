"""run 状态持久化测试（R11）：跨重启可恢复的状态与帧。

覆盖：memory 语义（帧上限/状态/列表/清扫）· redis 键布局与 TTL/有界 LTRIM/zset 排序
· 孤儿清扫审计 · 装配策略（memory / auto 降级并告警 / redis 失败即抛 / 非法值）。
"""
from __future__ import annotations

import asyncio
import logging

import pytest

from app.config import Settings, get_settings
from app.services.run_store import (
    KEY_PREFIX,
    RUN_INTERRUPTED,
    RUNS_INDEX,
    STATUS_FAILED,
    STATUS_INTERRUPTED,
    STATUS_RUNNING,
    STATUS_SUCCEEDED,
    MemoryRunStore,
    RedisRunStore,
    get_run_store,
    init_run_store,
    set_run_store,
)
from tests.fake_redis import FakeRedis

UNREACHABLE = "redis://127.0.0.1:1/0"  # 端口 1 必然拒绝连接（快速失败）


@pytest.fixture(autouse=True)
def _reset_singleton():
    """每个用例前后复位存储单例，避免跨用例污染。"""
    set_run_store(None)
    yield
    set_run_store(None)


class TestMemoryRunStore:
    async def test_create_get_and_status_transitions(self):
        store = MemoryRunStore()
        await store.create("r1", proposal_id="p1")
        record = await store.get("r1")
        assert record is not None
        assert record.status == STATUS_RUNNING
        assert record.proposal_id == "p1"
        assert record.created_at > 0
        assert not record.terminal

        await store.append_frame("r1", {"event": "ai.start", "data": {}})
        await store.set_status("r1", STATUS_SUCCEEDED)
        record = await store.get("r1")
        assert record.status == STATUS_SUCCEEDED
        assert record.terminal is True
        assert len(record.frames) == 1

    async def test_not_found_returns_none(self):
        assert await MemoryRunStore().get("missing") is None

    async def test_frame_cap_keeps_latest(self):
        store = MemoryRunStore(max_frames=3)
        await store.create("r1")
        for i in range(5):
            await store.append_frame("r1", {"event": "ai.chunk", "data": {"i": i}})
        record = await store.get("r1")
        assert [f["data"]["i"] for f in record.frames] == [2, 3, 4]

    async def test_set_status_on_missing_is_noop(self):
        store = MemoryRunStore()
        await store.set_status("nope", STATUS_FAILED)  # 不抛错
        assert await store.get("nope") is None

    async def test_list_runs_ordered_by_updated_at(self):
        store = MemoryRunStore()
        await store.create("old")
        await asyncio.sleep(0.002)  # 让 updated_at 真正拉开（时间戳分辨率）
        await store.create("new")
        await store.append_frame("new", {"event": "ai.status", "data": {}})
        ids = [meta["run_id"] for meta in await store.list_runs()]
        assert ids[0] == "new"
        assert set(ids) == {"old", "new"}

    async def test_append_frame_to_unknown_run_is_noop(self):
        store = MemoryRunStore()
        await store.append_frame("ghost", {"event": "ai.chunk", "data": {}})
        assert await store.get("ghost") is None

    async def test_recover_orphans_marks_interrupted(self):
        store = MemoryRunStore()
        await store.create("r1")
        recovered = await store.recover_orphans(idle_seconds=0)
        assert recovered == ["r1"]
        record = await store.get("r1")
        assert record.status == STATUS_INTERRUPTED

    async def test_recover_orphans_skips_finished(self):
        store = MemoryRunStore()
        await store.create("r1")
        await store.set_status("r1", STATUS_SUCCEEDED)
        assert await store.recover_orphans(idle_seconds=0) == []


class TestRedisRunStore:
    """键布局与语义（注入假客户端，不依赖真实 Redis）。"""

    def _store(self, *, max_frames: int = 200, ttl: int = 60) -> tuple[RedisRunStore, FakeRedis]:
        client = FakeRedis()
        return RedisRunStore(client, max_frames=max_frames, ttl_seconds=ttl), client

    async def test_create_writes_meta_index_and_ttl(self):
        store, client = self._store(ttl=99)
        await store.create("r1", proposal_id="p1")
        meta = client.hashes[f"{KEY_PREFIX}r1"]
        assert meta["status"] == STATUS_RUNNING
        assert meta["proposal_id"] == "p1"
        assert client.zsets[RUNS_INDEX] == {"r1": float(meta["created_at"])}
        assert client.expires[f"{KEY_PREFIX}r1"] == 99

    async def test_append_frame_is_bounded_and_refreshes_ttl(self):
        store, client = self._store(max_frames=2, ttl=42)
        await store.create("r1")
        for i in range(4):
            await store.append_frame("r1", {"event": "ai.chunk", "data": {"i": i}})
        frames = client.lists[f"{KEY_PREFIX}r1:frames"]
        assert len(frames) == 2, "LTRIM 必须把帧数限制在 AI_STATE_MAX_FRAMES"
        assert '"i": 3' in frames[-1]
        assert client.expires[f"{KEY_PREFIX}r1:frames"] == 42

    async def test_append_frame_to_expired_run_does_not_resurrect(self):
        store, client = self._store()
        await store.append_frame("ghost", {"event": "ai.chunk", "data": {}})
        assert f"{KEY_PREFIX}ghost" not in client.hashes
        assert f"{KEY_PREFIX}ghost:frames" not in client.lists

    async def test_get_roundtrip_with_error(self):
        store, _ = self._store()
        await store.create("r1", proposal_id="p1")
        await store.append_frame("r1", {"event": "ai.start", "data": {}})
        await store.set_status("r1", STATUS_FAILED, error={"code": "AI_LLM_TIMEOUT", "message": "x"})
        record = await store.get("r1")
        assert record.status == STATUS_FAILED
        assert record.error == {"code": "AI_LLM_TIMEOUT", "message": "x"}
        assert record.frames == [{"event": "ai.start", "data": {}}]
        assert record.proposal_id == "p1"

    async def test_get_missing_returns_none(self):
        store, _ = self._store()
        assert await store.get("missing") is None

    async def test_list_runs_sorted_newest_first(self):
        store, client = self._store()
        await store.create("a")
        await store.create("b")
        client.zsets[RUNS_INDEX] = {"a": 1.0, "b": 2.0}
        assert [m["run_id"] for m in await store.list_runs()] == ["b", "a"]

    async def test_recover_orphans_appends_terminal_frame_and_flags(self, caplog):
        store, _ = self._store()
        await store.create("r1")
        await store.append_frame("r1", {"event": "ai.start", "data": {}})
        with caplog.at_level(logging.WARNING):
            recovered = await store.recover_orphans(idle_seconds=0)
        assert recovered == ["r1"]
        record = await store.get("r1")
        assert record.status == STATUS_INTERRUPTED
        assert record.error["code"] == RUN_INTERRUPTED
        assert record.frames[-1]["event"] == "ai.error"
        assert any("ai_run_store_recovered" in r.message for r in caplog.records)

    async def test_recover_orphans_is_idempotent(self):
        store, _ = self._store()
        await store.create("r1")
        assert await store.recover_orphans(idle_seconds=0) == ["r1"]
        assert await store.recover_orphans(idle_seconds=0) == []  # 已不是 running
        record = await store.get("r1")
        assert len([f for f in record.frames if f["event"] == "ai.error"]) == 1

    async def test_ping_and_close(self):
        store, client = self._store()
        assert await store.ping() is True
        await store.close()
        assert client.closed is True


class TestInitRunStore:
    def _settings(self, monkeypatch, **env):
        for key, value in env.items():
            monkeypatch.setenv(key, value)
        get_settings.cache_clear()
        monkeypatch.setattr("app.services.run_store.get_settings", lambda: Settings())

    async def test_memory_mode_never_touches_redis(self, monkeypatch):
        self._settings(monkeypatch, AI_RUN_STORE="memory")
        store, mode = await init_run_store()
        assert mode == "memory"
        assert isinstance(store, MemoryRunStore)
        assert get_run_store() is store

    async def test_redis_mode_fails_fast_when_unreachable(self, monkeypatch):
        self._settings(monkeypatch, AI_RUN_STORE="redis", AI_STATE_REDIS_URL=UNREACHABLE)
        with pytest.raises(RuntimeError, match="AI_RUN_STORE=redis"):
            await init_run_store()

    async def test_auto_mode_degrades_with_warning(self, monkeypatch, caplog):
        self._settings(monkeypatch, AI_RUN_STORE="auto", AI_STATE_REDIS_URL=UNREACHABLE)
        with caplog.at_level(logging.WARNING):
            store, mode = await init_run_store()
        assert mode == "memory"
        assert isinstance(store, MemoryRunStore)
        assert any("ai_run_store_degraded" in r.message for r in caplog.records)

    async def test_illegal_mode_rejected(self, monkeypatch):
        self._settings(monkeypatch, AI_RUN_STORE="sqlite")
        with pytest.raises(ValueError, match="AI_RUN_STORE 非法"):
            await init_run_store()

    async def test_lazy_default_is_memory(self):
        # 未显式装配时（例如 ASGI 直连测试未跑 lifespan）不得崩，且为 memory
        assert isinstance(get_run_store(), MemoryRunStore)
