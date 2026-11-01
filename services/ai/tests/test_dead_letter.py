"""回调死信测试（R11）：可查询 / 可重放 / 可告警。

覆盖：memory 与 redis 两种实现的有界性、条目字段、重放标记、count；
`record_dead_letter` 的结构化告警日志；装配策略（memory / auto 降级 / redis fail-fast）。
"""
from __future__ import annotations

import logging

import pytest

from app.config import Settings, get_settings
from app.services.dead_letter import (
    DLQ_ENTRY_PREFIX,
    DLQ_IDS_KEY,
    KIND_CALLBACK,
    DeadLetterEntry,
    MemoryDeadLetterStore,
    RedisDeadLetterStore,
    get_dead_letter_store,
    init_dead_letter_store,
    record_dead_letter,
    set_dead_letter_store,
)
from tests.fake_redis import FakeRedis

UNREACHABLE = "redis://127.0.0.1:1/0"


@pytest.fixture(autouse=True)
def _reset_singleton():
    set_dead_letter_store(None)
    yield
    set_dead_letter_store(None)


def _entry(**overrides) -> DeadLetterEntry:
    base = {
        "id": "",
        "run_id": "run-1",
        "proposal_id": "p-1",
        "status": "succeeded",
        "attempts": 3,
        "last_error": "HTTP 503: upstream unavailable",
        "body": {"run_id": "run-1", "status": "succeeded"},
    }
    base.update(overrides)
    return DeadLetterEntry(**base)


class TestMemoryDeadLetterStore:
    async def test_add_assigns_id_and_time(self):
        store = MemoryDeadLetterStore()
        entry = await store.add(_entry())
        assert entry.id
        assert entry.created_at > 0
        assert entry.kind == KIND_CALLBACK
        assert await store.count() == 1

    async def test_list_newest_first_and_limit(self):
        store = MemoryDeadLetterStore()
        first = await store.add(_entry(run_id="r1"))
        second = await store.add(_entry(run_id="r2"))
        listed = await store.list(limit=1)
        assert [e.id for e in listed] == [second.id]
        assert (await store.list())[1].id == first.id

    async def test_bounded_by_max_entries(self):
        store = MemoryDeadLetterStore(max_entries=2)
        for i in range(4):
            await store.add(_entry(run_id=f"r{i}"))
        assert await store.count() == 2
        assert [e.run_id for e in await store.list()] == ["r3", "r2"]

    async def test_mark_replayed_records_result(self):
        store = MemoryDeadLetterStore()
        entry = await store.add(_entry())
        updated = await store.mark_replayed(entry.id, "ok status=201")
        assert updated.replayed_at is not None
        assert updated.replay_result == "ok status=201"

    async def test_mark_replayed_missing_returns_none(self):
        assert await MemoryDeadLetterStore().mark_replayed("nope", "ok") is None


class TestRedisDeadLetterStore:
    def _store(self, *, max_entries: int = 200, ttl: int = 60) -> tuple[RedisDeadLetterStore, FakeRedis]:
        client = FakeRedis()
        return RedisDeadLetterStore(client, max_entries=max_entries, ttl_seconds=ttl), client

    async def test_add_layout_and_ttl(self):
        store, client = self._store(ttl=77)
        entry = await store.add(_entry())
        raw = client.hashes[f"{DLQ_ENTRY_PREFIX}{entry.id}"]
        assert raw["run_id"] == "run-1"
        assert raw["attempts"] == "3"
        assert raw["kind"] == KIND_CALLBACK
        assert client.lists[DLQ_IDS_KEY] == [entry.id]
        assert client.expires[f"{DLQ_ENTRY_PREFIX}{entry.id}"] == 77

    async def test_ids_index_is_bounded(self):
        store, client = self._store(max_entries=2)
        ids = [(await store.add(_entry())) for _ in range(3)]
        assert client.lists[DLQ_IDS_KEY] == [ids[2].id, ids[1].id]
        assert await store.count() == 2, "索引长度即死信上限"

    async def test_get_and_mark_replayed(self):
        store, _ = self._store()
        entry = await store.add(_entry())
        fetched = await store.get(entry.id)
        assert fetched.body == {"run_id": "run-1", "status": "succeeded"}
        assert fetched.replayed_at is None
        updated = await store.mark_replayed(entry.id, "failed attempts=1 error=HTTP 500")
        assert updated.replay_result == "failed attempts=1 error=HTTP 500"
        assert (await store.get(entry.id)).replayed_at is not None

    async def test_get_missing_and_mark_missing(self):
        store, _ = self._store()
        assert await store.get("nope") is None
        assert await store.mark_replayed("nope", "ok") is None

    async def test_list_skips_vanished_entries(self):
        store, client = self._store()
        entry = await store.add(_entry())
        del client.hashes[f"{DLQ_ENTRY_PREFIX}{entry.id}"]  # 模拟 TTL 过期
        assert await store.list() == []

    async def test_ping_and_close(self):
        store, client = self._store()
        assert await store.ping() is True
        await store.close()
        assert client.closed is True


class TestRecordDeadLetter:
    async def test_records_entry_and_emits_alertable_log(self, caplog):
        store = MemoryDeadLetterStore()
        set_dead_letter_store(store)
        with caplog.at_level(logging.ERROR):
            entry = await record_dead_letter(
                run_id="run-9",
                proposal_id="p-9",
                status="succeeded",
                attempts=3,
                last_error="HTTP 503",
                body={"run_id": "run-9", "status": "succeeded", "payload": {"tasks": []}},
            )
        assert entry.id and entry.created_at > 0
        assert await store.count() == 1
        logs = [r.message for r in caplog.records if "ai_callback_dead_letter" in r.message]
        assert logs and "run-9" in logs[0], "死信必须输出可被日志告警命中的结构化日志"
        assert (await store.get(entry.id)).body["payload"] == {"tasks": []}


class TestInitDeadLetterStore:
    def _settings(self, monkeypatch, **env):
        for key, value in env.items():
            monkeypatch.setenv(key, value)
        get_settings.cache_clear()
        monkeypatch.setattr("app.services.dead_letter.get_settings", lambda: Settings())

    async def test_memory_mode(self, monkeypatch):
        self._settings(monkeypatch, AI_RUN_STORE="memory")
        store, mode = await init_dead_letter_store()
        assert mode == "memory"
        assert isinstance(store, MemoryDeadLetterStore)

    async def test_redis_mode_fails_fast(self, monkeypatch):
        self._settings(monkeypatch, AI_RUN_STORE="redis", AI_STATE_REDIS_URL=UNREACHABLE)
        with pytest.raises(RuntimeError, match="死信 Redis 不可用"):
            await init_dead_letter_store()

    async def test_auto_mode_degrades(self, monkeypatch, caplog):
        self._settings(monkeypatch, AI_RUN_STORE="auto", AI_STATE_REDIS_URL=UNREACHABLE)
        with caplog.at_level(logging.WARNING):
            store, mode = await init_dead_letter_store()
        assert mode == "memory"
        assert isinstance(store, MemoryDeadLetterStore)
        assert any("ai_dead_letter_degraded" in r.message for r in caplog.records)

    async def test_lazy_default_is_memory(self):
        assert isinstance(get_dead_letter_store(), MemoryDeadLetterStore)
