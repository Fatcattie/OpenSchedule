"""路由层测试（§3.5.3）：异常分类、帧缓存上限、SSE 重放语义、服务 token 鉴权、端到端降级流。"""
from __future__ import annotations

import json

import httpx
import pytest

from app.main import create_app
from app.routers import decompose
from app.routers.decompose import (
    EVENT_CHUNK,
    EVENT_DONE,
    EVENT_ERROR,
    EVENT_START,
    RunState,
    _classify_exception,
    _emit_frame,
    _sse_events,
    stream_decompose,
)
from app.services.llm_client import (
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

TOKEN = "dev-ai-service-token-change-me"  # Settings 默认值（测试不注入真实密钥）

# ═══════════════ 异常 → ai.error 错误码 ═══════════════


class TestClassifyException:
    @pytest.mark.parametrize(
        ("exc", "code"),
        [
            (LLMConnectionError("x"), AI_LLM_UNAVAILABLE),
            (LLMTimeoutError("x"), AI_LLM_TIMEOUT),
            (LLMAuthError("x"), AI_LLM_AUTH),
            (LLMRateLimitError("x"), AI_LLM_RATE_LIMITED),
            (LLMBudgetExceededError("x"), AI_BUDGET_EXCEEDED),
            (ValueError("boom"), AI_INTERNAL_ERROR),
        ],
    )
    def test_mapping(self, exc, code):
        classified, message = _classify_exception(exc)
        assert classified == code
        assert message


# ═══════════════ 帧缓存（断线重连重放） ═══════════════


class TestFrameBuffer:
    async def test_replay_cap_at_200_frames(self):
        state = RunState()
        for i in range(205):
            await _emit_frame(state, EVENT_CHUNK, {"i": i})
        assert len(state.frames) == 200
        assert state.frames[0]["data"] == {"i": 5}  # 最旧帧被挤出

    async def test_replay_after_terminal_yields_history_only(self):
        state = RunState()
        await _emit_frame(state, EVENT_START, {"run_id": "r"})
        await _emit_frame(state, EVENT_DONE, {"payload": {}})
        chunks = [chunk async for chunk in _sse_events(state)]
        assert len(chunks) == 2
        assert "event: ai.start" in chunks[0]
        assert "event: ai.done" in chunks[1]

    async def test_live_consumption_stops_at_terminal(self):
        state = RunState()

        async def producer():
            await _emit_frame(state, EVENT_START, {"run_id": "r"})
            await _emit_frame(state, EVENT_DONE, {"payload": {}})

        import asyncio

        task = asyncio.create_task(producer())
        chunks = [chunk async for chunk in _sse_events(state)]
        await task
        assert [c.splitlines()[0] for c in chunks] == ["event: ai.start", "event: ai.done"]

    async def test_unknown_run_raises_404(self):
        with pytest.raises(Exception) as exc_info:
            await stream_decompose("no-such-run")
        assert getattr(exc_info.value, "status_code", None) == 404


# ═══════════════ 应用级：鉴权 + 端到端降级流 ═══════════════


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=create_app()), base_url="http://ai.test"
    )


class TestAppLevel:
    async def test_health_is_public(self):
        async with _client() as client:
            resp = await client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    async def test_decompose_requires_service_token(self):
        async with _client() as client:
            no_token = await client.post(
                "/ai/decompose", json={"tenant_id": "t", "project_id": "p", "description": "d"}
            )
            bad_token = await client.post(
                "/ai/decompose",
                json={"tenant_id": "t", "project_id": "p", "description": "d"},
                headers={"Authorization": "Bearer wrong"},
            )
        assert no_token.status_code == 401
        assert no_token.json()["detail"]["code"] == "40101"
        assert bad_token.status_code == 401

    async def test_degraded_end_to_end_sse_frames(self, monkeypatch):
        """LLM 不可用 → 模板降级：完整断言 ai.start/status/chunk/done 帧协议与降级 warning。"""
        # 防真实网络：回调主服务打为空操作；generate_plan 直接给模板降级结果
        async def fake_notify(*args, **kwargs):
            return None

        async def fake_generate(request, *, feedback=None, force_template=False, llm=None):
            from app.services.llm_client import template_decompose

            return template_decompose(request).model_dump_json(), True

        monkeypatch.setattr(decompose, "_notify_main_service", fake_notify)
        monkeypatch.setattr(
            "app.graphs.decompose_graph.generate_plan", fake_generate
        )

        async with _client() as client:
            created = await client.post(
                "/ai/decompose",
                json={
                    "tenant_id": "t1",
                    "project_id": "p1",
                    "description": "开发一个内部管理系统",
                },
                headers={"Authorization": f"Bearer {TOKEN}"},
            )
            assert created.status_code == 202
            run_id = created.json()["run_id"]
            assert created.headers["location"].endswith(f"/ai/decompose/{run_id}/stream")

            body = b""
            # 整个 /ai/* 路由挂服务 token 鉴权（§3.5.2：浏览器经主服务 SSE 代理收口，直连须带 token）
            async with client.stream(
                "GET",
                f"/ai/decompose/{run_id}/stream",
                headers={"Authorization": f"Bearer {TOKEN}"},
            ) as stream:
                assert stream.status_code == 200
                async for chunk in stream.aiter_bytes():
                    body += chunk

        frames = []
        for block in body.decode().split("\n\n"):
            lines = [line for line in block.splitlines() if line.strip()]
            if not lines:
                continue
            event = next((line.removeprefix("event: ") for line in lines if line.startswith("event: ")), None)
            data = next((line.removeprefix("data: ") for line in lines if line.startswith("data: ")), None)
            if event:
                frames.append((event, json.loads(data) if data else None))

        names = [name for name, _ in frames]
        assert names[0] == EVENT_START
        assert names[-1] == EVENT_DONE
        assert EVENT_CHUNK in names
        assert "ai.status" in names
        done = frames[-1][1]
        assert done["payload"]["tasks"], "done 帧必须携带完整草稿"
        assert any("降级" in w for w in done["payload"]["warnings"])

    async def test_stream_unknown_run_404(self):
        async with _client() as client:
            resp = await client.get(
                "/ai/decompose/nope/stream", headers={"Authorization": f"Bearer {TOKEN}"}
            )
        assert resp.status_code == 404
        assert resp.json()["detail"]["code"] == "AI_RUN_NOT_FOUND"

    async def test_error_event_on_internal_failure(self, monkeypatch):
        """未预期异常 → ai.error 帧 + 失败回调（回调此处打为空操作）。"""
        async def fake_notify(*args, **kwargs):
            return None

        async def boom_generate(request, *, feedback=None, force_template=False, llm=None):
            raise RuntimeError(" simulated crash")

        monkeypatch.setattr(decompose, "_notify_main_service", fake_notify)
        monkeypatch.setattr("app.graphs.decompose_graph.generate_plan", boom_generate)

        async with _client() as client:
            created = await client.post(
                "/ai/decompose",
                json={"tenant_id": "t", "project_id": "p", "description": "d"},
                headers={"Authorization": f"Bearer {TOKEN}"},
            )
            run_id = created.json()["run_id"]
            body = b""
            async with client.stream(
                "GET",
                f"/ai/decompose/{run_id}/stream",
                headers={"Authorization": f"Bearer {TOKEN}"},
            ) as stream:
                async for chunk in stream.aiter_bytes():
                    body += chunk

        text = body.decode()
        assert f"event: {EVENT_ERROR}" in text
        assert AI_INTERNAL_ERROR in text
        assert "simulated crash" in text


async def test_tenant_llm_target_passed_through_and_never_echoed(monkeypatch):
    """主服务下发的租户模型配置：JSON 体 strict 解析为 LlmTarget 传到 generate_plan；SSE/回调不回显 key。"""
    from app.schemas.decompose import LlmTarget
    from app.services.llm_client import template_decompose

    seen: dict = {}
    callbacks: list = []

    async def fake_notify(*args, **kwargs):
        callbacks.append((args, kwargs))

    async def fake_generate(request, *, feedback=None, force_template=False, llm=None):
        seen["llm"] = llm
        return template_decompose(request).model_dump_json(), False

    monkeypatch.setattr(decompose, "_notify_main_service", fake_notify)
    monkeypatch.setattr("app.graphs.decompose_graph.generate_plan", fake_generate)

    async with _client() as client:
        created = await client.post(
            "/ai/decompose",
            json={
                "tenant_id": "t1",
                "project_id": "p1",
                "description": "开发一个内部管理系统",
                "llm": {
                    "base_url": "https://api.deepseek.com/v1",
                    "api_key": "sk-tenant-xyz",
                    "model": "deepseek-chat",
                },
            },
            headers={"Authorization": f"Bearer {TOKEN}"},
        )
        assert created.status_code == 202
        run_id = created.json()["run_id"]
        body = b""
        async with client.stream(
            "GET", f"/ai/decompose/{run_id}/stream", headers={"Authorization": f"Bearer {TOKEN}"}
        ) as stream:
            async for chunk in stream.aiter_bytes():
                body += chunk

    assert isinstance(seen["llm"], LlmTarget)
    assert seen["llm"].api_key.get_secret_value() == "sk-tenant-xyz"
    assert seen["llm"].model == "deepseek-chat"
    assert b"event: ai.done" in body
    assert b"sk-tenant-xyz" not in body
    assert "sk-tenant-xyz" not in repr(callbacks)
