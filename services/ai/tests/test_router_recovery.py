"""重启恢复与死信管理接口测试（R11）。

「AI 服务重启后 run 状态和帧可恢复」的端到端验证：
  1. 用持久化存储写入 run 记录（含已发帧），**清空内存注册表**（模拟重启）；
  2. GET /ai/decompose/{run_id}/stream → 帧从持久化记录重放；
  3. 未终结的 run 补一帧确定性 ai.error（AI_RUN_INTERRUPTED）并落盘为 interrupted，
     让主服务可确定地重试（否则重连客户端永久挂起）；
  4. 已终结的 run 只重放历史，不再补帧。
死信接口：列表 / 重放 / 401 未鉴权 / 404 未找到 / 502 重放失败。
"""
from __future__ import annotations

import json

import httpx
import pytest

from app.main import create_app
from app.routers import decompose
from app.services import callback_delivery
from app.services.dead_letter import DeadLetterEntry, MemoryDeadLetterStore, set_dead_letter_store
from app.services.run_store import (
    RUN_INTERRUPTED,
    STATUS_INTERRUPTED,
    STATUS_SUCCEEDED,
    MemoryRunStore,
    set_run_store,
)

TOKEN = "dev-ai-service-token-change-me"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture(autouse=True)
def _isolated_state():
    """每个用例独立的内存存储 + 清空进程内注册表（模拟冷启动进程）。"""
    set_run_store(None)
    set_dead_letter_store(None)
    decompose._registry.clear()
    yield
    set_run_store(None)
    set_dead_letter_store(None)
    decompose._registry.clear()


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app()), base_url="http://ai.test")


def _frames(text: str) -> list[tuple[str, object]]:
    out: list[tuple[str, object]] = []
    for block in text.split("\n\n"):
        lines = [line for line in block.splitlines() if line.strip().startswith(("event:", "data:"))]
        if not lines:
            continue
        event = next((line.removeprefix("event: ") for line in lines if line.startswith("event: ")), None)
        data = next((line.removeprefix("data: ") for line in lines if line.startswith("data: ")), None)
        if event:
            out.append((event, json.loads(data) if data else None))
    return out


async def _persist_run(store: MemoryRunStore, run_id: str, *, terminal: bool) -> None:
    """写入一条 run 记录（含已发帧），模拟「重启前最后一次落盘」。"""
    await store.create(run_id, proposal_id="p-1")
    await store.append_frame(run_id, {"event": "ai.start", "data": {"run_id": run_id, "proposal_id": "p-1"}})
    await store.append_frame(run_id, {"event": "ai.status", "data": {"progress": 80, "stage": "validating"}})
    await store.append_frame(
        run_id, {"event": "ai.chunk", "data": {"op": "replace", "path": "/summary", "value": "s"}}
    )
    if terminal:
        await store.append_frame(
            run_id, {"event": "ai.done", "data": {"proposal_id": "p-1", "payload": {"tasks": []}}}
        )
        await store.set_status(run_id, STATUS_SUCCEEDED)


class TestStreamResumeAfterRestart:
    async def test_running_run_replays_frames_then_closes_with_interrupted(self):
        store = MemoryRunStore()
        set_run_store(store)
        await _persist_run(store, "run-restart", terminal=False)

        async with _client() as client:
            async with client.stream("GET", "/ai/decompose/run-restart/stream", headers=AUTH) as stream:
                assert stream.status_code == 200
                body = b""
                async for chunk in stream.aiter_bytes():
                    body += chunk

        frames = _frames(body.decode())
        names = [n for n, _ in frames]
        assert names[:3] == ["ai.start", "ai.status", "ai.chunk"], "已发帧必须按序从持久化记录重放"
        assert names[-1] == "ai.error"
        assert frames[-1][1]["code"] == RUN_INTERRUPTED

        record = await store.get("run-restart")
        assert record.status == STATUS_INTERRUPTED, "补终帧后必须把记录标记为 interrupted"
        assert record.frames[-1]["event"] == "ai.error"

    async def test_finished_run_replays_history_without_extra_frame(self):
        store = MemoryRunStore()
        set_run_store(store)
        await _persist_run(store, "run-done", terminal=True)

        async with _client() as client:
            async with client.stream("GET", "/ai/decompose/run-done/stream", headers=AUTH) as stream:
                body = b""
                async for chunk in stream.aiter_bytes():
                    body += chunk

        frames = _frames(body.decode())
        assert [n for n, _ in frames][-1] == "ai.done"
        assert all(n != "ai.error" for n, _ in frames), "已终结的 run 不得被补帧改写"
        record = await store.get("run-done")
        assert record.status == STATUS_SUCCEEDED

    async def test_unknown_run_still_404(self):
        set_run_store(MemoryRunStore())
        async with _client() as client:
            resp = await client.get("/ai/decompose/ghost/stream", headers=AUTH)
        assert resp.status_code == 404

    async def test_resume_requires_service_token(self):
        set_run_store(MemoryRunStore())
        async with _client() as client:
            resp = await client.get("/ai/decompose/ghost/stream")
        assert resp.status_code == 401


class TestDeadLetterEndpoints:
    async def test_list_returns_total_and_items(self):
        store = MemoryDeadLetterStore()
        set_dead_letter_store(store)
        await store.add(DeadLetterEntry(id="", run_id="r1", proposal_id="p1", status="succeeded", attempts=3))
        async with _client() as client:
            resp = await client.get("/ai/dead-letters?limit=10", headers=AUTH)
        assert resp.status_code == 200
        payload = resp.json()["data"]
        assert payload["total"] == 1
        assert payload["items"][0]["run_id"] == "r1"
        assert payload["items"][0]["attempts"] == 3

    async def test_list_requires_token(self):
        async with _client() as client:
            assert (await client.get("/ai/dead-letters")).status_code == 401

    async def test_replay_success(self, monkeypatch):
        store = MemoryDeadLetterStore()
        set_dead_letter_store(store)
        entry = await store.add(
            DeadLetterEntry(id="", run_id="r1", status="succeeded", body={"run_id": "r1"})
        )

        async def fake_replay(entry_id, **kwargs):
            await store.mark_replayed(entry_id, "ok status=200")
            return callback_delivery.ReplayResult(ok=True, entry_id=entry_id, detail="ok status=200")

        monkeypatch.setattr(callback_delivery, "replay_dead_letter", fake_replay)
        async with _client() as client:
            resp = await client.post(f"/ai/dead-letters/{entry.id}/replay", headers=AUTH)
        assert resp.status_code == 200
        assert resp.json() == {"entry_id": entry.id, "replayed": True, "detail": "ok status=200"}
        assert (await store.get(entry.id)).replayed_at is not None

    async def test_replay_failure_returns_502(self, monkeypatch):
        store = MemoryDeadLetterStore()
        set_dead_letter_store(store)
        entry = await store.add(DeadLetterEntry(id="", run_id="r1", status="succeeded"))

        async def fake_replay(entry_id, **kwargs):
            return callback_delivery.ReplayResult(ok=False, entry_id=entry_id, detail="failed attempts=1")

        monkeypatch.setattr(callback_delivery, "replay_dead_letter", fake_replay)
        async with _client() as client:
            resp = await client.post(f"/ai/dead-letters/{entry.id}/replay", headers=AUTH)
        assert resp.status_code == 502
        assert resp.json()["replayed"] is False

    async def test_replay_unknown_entry_404(self, monkeypatch):
        set_dead_letter_store(MemoryDeadLetterStore())

        async def fake_replay(entry_id, **kwargs):
            return None

        monkeypatch.setattr(callback_delivery, "replay_dead_letter", fake_replay)
        async with _client() as client:
            resp = await client.post("/ai/dead-letters/nope/replay", headers=AUTH)
        assert resp.status_code == 404


class TestRunRecordPersistedDuringLiveRun:
    async def test_decompose_persists_frames_and_terminal_status(self, monkeypatch):
        """活流程也要落盘：结束后存储里应有完整帧序列与终态（重启恢复的前提）。"""
        store = MemoryRunStore()
        set_run_store(store)

        async def fake_notify(*args, **kwargs):
            return None

        async def fake_generate(request, *, feedback=None, force_template=False, llm=None):
            from app.services.llm_client import template_decompose

            return template_decompose(request).model_dump_json(), True

        monkeypatch.setattr(decompose, "_notify_main_service", fake_notify)
        monkeypatch.setattr("app.graphs.decompose_graph.generate_plan", fake_generate)

        async with _client() as client:
            created = await client.post(
                "/ai/decompose",
                json={"tenant_id": "t", "project_id": "p", "description": "开发一个内部管理系统"},
                headers=AUTH,
            )
            run_id = created.json()["run_id"]
            async with client.stream("GET", f"/ai/decompose/{run_id}/stream", headers=AUTH) as stream:
                body = b""
                async for chunk in stream.aiter_bytes():
                    body += chunk

        record = await store.get(run_id)
        assert record is not None
        assert record.status == STATUS_SUCCEEDED
        assert record.frames[0]["event"] == "ai.start"
        assert record.frames[-1]["event"] == "ai.done"
        assert [n for n, _ in _frames(body.decode())][-1] == "ai.done"
