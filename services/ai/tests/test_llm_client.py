"""LLM 客户端 + 确定性模板降级测试（§3.5.4）：错误分类、温度钳制、预算截断、模板确定性。"""
from __future__ import annotations

import json

import httpx
import pytest

from app.config import Settings
from app.schemas.decompose import DecomposeRequest, LlmTarget
from app.services import llm_client
from app.services.llm_client import (
    LLMAuthError,
    LLMBudgetExceededError,
    LLMClient,
    LLMConnectionError,
    LLMInvalidResponseError,
    LLMRateLimitError,
    LLMTimeoutError,
    LLMUpstreamError,
    estimate_cost_usd,
    generate_plan,
    template_decompose,
)
from app.services.validator import validate_l1_raw, validate_result

# ═══════════════ 成本估算 ═══════════════


class TestEstimateCost:
    def test_known_model_pricing(self):
        usage = {"prompt_tokens": 1_000_000, "completion_tokens": 1_000_000}
        assert estimate_cost_usd("deepseek-chat", usage) == 1.37
        assert estimate_cost_usd("glm-4", usage) == 2.5

    def test_unknown_model_falls_back_to_default_price(self):
        usage = {"prompt_tokens": 1_000_000, "completion_tokens": 1_000_000}
        assert estimate_cost_usd("some-new-model", usage) == 2.0

    def test_empty_usage_is_free(self):
        assert estimate_cost_usd("deepseek-chat", {}) == 0.0


# ═══════════════ LLMClient.generate ═══════════════

TARGET = LlmTarget(base_url="https://api.deepseek.com/v1", api_key="test-key", model="deepseek-chat")


def _settings(**overrides) -> Settings:
    return Settings(**overrides)


def _client(settings: Settings | None = None) -> LLMClient:
    return LLMClient(settings or _settings(), TARGET)


def _ok_response(text: str = '{"a": 1}') -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "choices": [{"message": {"content": text}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 20},
            "model": "deepseek-chat",
        },
    )


class TestGenerateErrors:
    async def test_missing_api_key_is_connection_error(self):
        client = LLMClient(Settings(), None)
        with pytest.raises(LLMConnectionError):
            await client.generate(system="s", user="u")

    @pytest.mark.parametrize(
        ("status", "expected"),
        [
            (401, LLMAuthError),
            (403, LLMAuthError),
            (429, LLMRateLimitError),
            (500, LLMUpstreamError),
            (400, LLMInvalidResponseError),
        ],
    )
    async def test_status_classification(self, status, expected):
        # LLMClient 内部自建 AsyncClient（用后 aclose），测试直接替换其 post 方法模拟响应
        fake_client = _client()
        async def fake_post(url, json=None, headers=None):
            return httpx.Response(status, json={"error": "x"})
        fake_client._client.post = fake_post  # type: ignore[method-assign]
        with pytest.raises(expected):
            await fake_client.generate(system="s", user="u")
        await fake_client.aclose()

    async def test_invalid_response_shape(self):
        fake_client = _client()
        async def fake_post(url, json=None, headers=None):
            return httpx.Response(200, json={"unexpected": True})
        fake_client._client.post = fake_post  # type: ignore[method-assign]
        with pytest.raises(LLMInvalidResponseError):
            await fake_client.generate(system="s", user="u")
        await fake_client.aclose()

    async def test_timeout_wrapped(self):
        fake_client = _client()
        async def fake_post(url, json=None, headers=None):
            raise httpx.TimeoutException("simulated", request=None)
        fake_client._client.post = fake_post  # type: ignore[method-assign]
        with pytest.raises(LLMTimeoutError):
            await fake_client.generate(system="s", user="u")
        await fake_client.aclose()

    async def test_connect_error_wrapped(self):
        fake_client = _client()
        async def fake_post(url, json=None, headers=None):
            raise httpx.ConnectError("simulated", request=None)
        fake_client._client.post = fake_post  # type: ignore[method-assign]
        with pytest.raises(LLMConnectionError):
            await fake_client.generate(system="s", user="u")
        await fake_client.aclose()


class TestGenerateSuccess:
    async def test_temperature_clamped_to_l1_ceiling(self):
        captured: dict = {}

        async def fake_post(url, json=None, headers=None):
            captured["payload"] = json
            captured["auth"] = headers.get("Authorization")
            return _ok_response()

        client = _client()
        client._client.post = fake_post  # type: ignore[method-assign]
        resp = await client.generate(system="s", user="u", temperature=0.9)
        await client.aclose()

        assert captured["payload"]["temperature"] == 0.2  # L1 铁律：≤0.2 截断
        assert captured["auth"] == "Bearer test-key"
        assert resp.text == '{"a": 1}'
        assert resp.cost_usd > 0

    async def test_budget_exceeded_raises(self):
        async def fake_post(url, json=None, headers=None):
            return httpx.Response(
                200,
                json={
                    "choices": [{"message": {"content": "x"}}],
                    "usage": {"prompt_tokens": 100, "completion_tokens": 1_000_000},
                },
            )

        client = _client()
        client._client.post = fake_post  # type: ignore[method-assign]
        with pytest.raises(LLMBudgetExceededError):
            await client.generate(system="s", user="u")
        await client.aclose()

    async def test_monthly_budget_alert_logged(self, caplog):
        import logging

        llm_client._monthly_spend_usd = 0.0
        settings = _settings(llm_monthly_budget_alert=0.000001)
        async def fake_post(url, json=None, headers=None):
            return _ok_response()
        client = _client(settings)
        client._client.post = fake_post  # type: ignore[method-assign]
        with caplog.at_level(logging.WARNING, logger="app.services.llm_client"):
            await client.generate(system="s", user="u")
        await client.aclose()
        assert any("告警线" in rec.message for rec in caplog.records)


class TestTenantTarget:
    async def test_uses_tenant_endpoint_model_and_key(self):
        captured: dict = {}

        async def fake_post(url, json=None, headers=None):
            captured.update(url=url, model=json["model"], auth=headers["Authorization"])
            return _ok_response()

        target = LlmTarget(
            base_url="https://open.bigmodel.cn/api/paas/v4/", api_key="zk-1", model="glm-4-flash"
        )
        client = LLMClient(_settings(), target)
        client._client.post = fake_post  # type: ignore[method-assign]
        await client.generate(system="s", user="u")
        await client.aclose()
        assert captured == {
            "url": "https://open.bigmodel.cn/api/paas/v4/chat/completions",
            "model": "glm-4-flash",
            "auth": "Bearer zk-1",
        }

    def test_key_never_serialized(self):
        request = DecomposeRequest(
            tenant_id="t",
            project_id="p",
            description="x",
            llm={
                "base_url": "https://api.deepseek.com/v1",
                "api_key": "sk-secret-123",
                "model": "deepseek-chat",
            },
        )
        assert request.llm is not None
        assert request.llm.api_key.get_secret_value() == "sk-secret-123"
        assert "llm" not in request.model_dump()  # exclude：图状态/存储序列化不带出
        assert "sk-secret-123" not in request.model_dump_json()
        assert "sk-secret-123" not in repr(request)

    def test_invalid_base_url_rejected(self):
        with pytest.raises(ValueError):
            LlmTarget(base_url="ftp://x", api_key="k", model="m")

    async def test_no_target_degrades_to_template(self):
        raw, degraded = await generate_plan(_request())
        assert degraded is True
        _, issues = validate_l1_raw(raw)
        assert issues == []


# ═══════════════ 确定性模板 ═══════════════

def _request(description: str = "开发一个内部管理系统", **overrides) -> DecomposeRequest:
    base = {"tenant_id": "t", "project_id": "p", "description": description}
    base.update(overrides)
    return DecomposeRequest(**base)


class TestTemplateDecompose:
    def test_deterministic_same_input_same_output(self):
        a = template_decompose(_request()).model_dump()
        b = template_decompose(_request()).model_dump()
        assert a == b

    def test_industry_keyword_selects_template(self):
        result = template_decompose(_request("组织一场线下发布会"))
        assert "活动策划与预算" in result.tasks[1].title

    def test_unknown_industry_uses_generic_template(self):
        result = template_decompose(_request("xyzabc"))
        assert "目标确认与范围梳理" in result.tasks[1].title

    def test_granularity_truncates_task_count(self):
        coarse = template_decompose(_request(granularity="粗"))
        fine = template_decompose(_request(granularity="细"))
        assert len(coarse.tasks) == 1 + 4  # 粗：模板截断到 4 项
        # 细 期望 6 项，但行业模板只有 5 项 → 按可用项截断（5 项），不补空任务
        assert len(fine.tasks) == 1 + 5

    def test_budget_scaling_clamped(self):
        result = template_decompose(_request(constraints={"budget_hours": 1}))
        # 1 小时预算 vs ~82h 模板总量 → 缩比 0.012 被钳制到 0.2（防失真下限）
        assert result.tasks[1].estimated_hours == pytest.approx(8.0 * 0.2)

    def test_time_perspective_prefixes_phase(self):
        result = template_decompose(_request(perspective="时间"))
        assert result.tasks[1].title.startswith("阶段1：")
        assert result.tasks[1].assignee_hint is None

    def test_template_passes_l1_and_l2(self):
        result = template_decompose(_request(constraints={"budget_hours": 100}))
        parsed, issues = validate_l1_raw(result.model_dump_json())
        assert issues == []
        report = validate_result(parsed, Settings())
        assert report.passed, report.issues


# ═══════════════ generate_plan 编排降级 ═══════════════


class TestGeneratePlan:
    async def test_llm_error_falls_back_to_template(self, monkeypatch):
        monkeypatch.setattr(llm_client, "get_settings", lambda: _settings())

        async def fake_generate(self, request, feedback=None):
            raise LLMConnectionError("模型服务不可达")

        monkeypatch.setattr(LLMClient, "generate_decompose", fake_generate)
        raw, degraded = await generate_plan(_request(), llm=TARGET)
        assert degraded is True
        parsed, issues = validate_l1_raw(raw)
        assert issues == []

    async def test_budget_exceeded_falls_back_to_template(self, monkeypatch):
        monkeypatch.setattr(llm_client, "get_settings", lambda: _settings())

        async def fake_generate(self, request, feedback=None):
            raise LLMBudgetExceededError("超预算")

        monkeypatch.setattr(LLMClient, "generate_decompose", fake_generate)
        _, degraded = await generate_plan(_request(), llm=TARGET)
        assert degraded is True

    async def test_success_path_not_degraded(self, monkeypatch):
        monkeypatch.setattr(llm_client, "get_settings", lambda: _settings())
        valid = template_decompose(_request()).model_dump_json()

        async def fake_generate(self, request, feedback=None):
            return valid

        monkeypatch.setattr(LLMClient, "generate_decompose", fake_generate)
        raw, degraded = await generate_plan(_request(), llm=TARGET)
        assert degraded is False
        assert json.loads(raw) == json.loads(valid)

    async def test_force_template_skips_llm(self, monkeypatch):
        monkeypatch.setattr(llm_client, "get_settings", lambda: _settings())

        async def fake_generate(self, request, feedback=None):
            raise AssertionError("force_template 时不应调用 LLM")

        monkeypatch.setattr(LLMClient, "generate_decompose", fake_generate)
        _, degraded = await generate_plan(_request(), force_template=True, llm=TARGET)
        assert degraded is True
