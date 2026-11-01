"""AI 指标端点测试（R11）：死信可告警 / 存储形态可观测。

覆盖：text exposition 格式与全部指标名 · 死信累计 counter 与积压 gauge 同源
· redis 形态标签 · 端点公开（Prometheus 抓取不带服务 token）· 存储异常不整体 500。
"""
from __future__ import annotations

import httpx
import pytest

from app.main import create_app
from app.services.dead_letter import (
    DeadLetterEntry,
    MemoryDeadLetterStore,
    record_dead_letter,
    set_dead_letter_store,
)
from app.services.metrics import render_metrics, reset_metrics
from app.services.run_store import MemoryRunStore, RedisRunStore, set_run_store
from tests.fake_redis import FakeRedis


@pytest.fixture(autouse=True)
def _isolated_state():
    set_run_store(None)
    set_dead_letter_store(None)
    reset_metrics()
    yield
    set_run_store(None)
    set_dead_letter_store(None)
    reset_metrics()


async def test_render_metrics_exposes_required_series():
    set_run_store(MemoryRunStore())
    set_dead_letter_store(MemoryDeadLetterStore())
    text = await render_metrics()

    assert "openschedule_ai_up 1" in text
    assert "openschedule_ai_dead_letters_recorded_total 0" in text
    assert "openschedule_ai_dead_letters 0" in text
    assert 'openschedule_ai_run_store_mode{mode="memory"} 1' in text
    assert 'openschedule_ai_dead_letter_store_mode{mode="memory"} 1' in text
    assert "# TYPE openschedule_ai_dead_letters_recorded_total counter" in text
    assert text.endswith("\n")


async def test_dead_letter_counter_and_backlog_track_store():
    set_dead_letter_store(MemoryDeadLetterStore())
    await record_dead_letter(
        run_id="r1",
        proposal_id="p1",
        status="succeeded",
        attempts=3,
        last_error="HTTP 503",
        body={"run_id": "r1"},
    )
    await record_dead_letter(
        run_id="r2",
        proposal_id=None,
        status="failed",
        attempts=1,
        last_error="HTTP 502",
        body={"run_id": "r2"},
    )
    text = await render_metrics()
    assert "openschedule_ai_dead_letters_recorded_total 2" in text
    assert "openschedule_ai_dead_letters 2" in text


async def test_redis_store_is_reported_as_redis_mode():
    set_run_store(RedisRunStore(FakeRedis()))
    set_dead_letter_store(MemoryDeadLetterStore())
    text = await render_metrics()
    assert 'openschedule_ai_run_store_mode{mode="redis"} 1' in text


async def test_count_failure_does_not_break_endpoint(monkeypatch):
    class BrokenStore(MemoryDeadLetterStore):
        async def count(self) -> int:
            raise RuntimeError("redis down")

    set_dead_letter_store(BrokenStore())
    text = await render_metrics()
    assert "openschedule_ai_up 1" in text
    assert "openschedule_ai_dead_letters " not in text, "取不到积压时不得输出可能误导的 0"


async def test_metrics_endpoint_is_public_and_prometheus_formatted():
    set_run_store(MemoryRunStore())
    set_dead_letter_store(MemoryDeadLetterStore())
    transport = httpx.ASGITransport(app=create_app())
    async with httpx.AsyncClient(transport=transport, base_url="http://ai.test") as client:
        resp = await client.get("/metrics")  # 不带服务 token：Prometheus 抓取路径

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/plain")
    assert "version=0.0.4" in resp.headers["content-type"]
    assert "openschedule_ai_up 1" in resp.text


async def test_metrics_reflects_dead_letter_added_directly():
    store = MemoryDeadLetterStore()
    set_dead_letter_store(store)
    await store.add(DeadLetterEntry(id="", run_id="direct", status="succeeded"))
    text = await render_metrics()
    assert "openschedule_ai_dead_letters 1" in text
    # 直接写入存储不经过 record_dead_letter 时不加累计
    assert "openschedule_ai_dead_letters_recorded_total 0" in text
