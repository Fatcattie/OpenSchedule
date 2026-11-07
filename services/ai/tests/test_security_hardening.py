"""安全加固回归测试（docs/code-analysis-report.md：H-1 / M-2）。全部离线，不联网。"""
from __future__ import annotations

import httpx
import pytest
from pydantic import ValidationError

from app.config import Settings
from app.schemas.decompose import LlmTarget
from app.services.llm_client import LLMClient, LLMConnectionError, LLMInvalidResponseError
from app.services.url_guard import (
    SafeAsyncTransport,
    UnsafeOutboundTargetError,
    is_blocked_ip,
    resolve_safe_ip,
)

# ═══════════════ H-1：生产拒绝占位 token ═══════════════


class TestPlaceholderToken:
    def test_production_rejects_default_token(self):
        with pytest.raises(ValidationError, match="AI_SERVICE_TOKEN"):
            Settings(app_env="production")  # 默认值 dev-ai-service-token-change-me

    @pytest.mark.parametrize("token", ["", "  ", "change-me-ai-service-token", "xx-CHANGEME"])
    def test_production_rejects_empty_or_placeholder(self, token: str):
        with pytest.raises(ValidationError):
            Settings(app_env="production", ai_service_token=token)

    def test_production_accepts_real_token(self):
        s = Settings(app_env="production", ai_service_token="3f9a1c7e5b2d4a8f9e0c1b2a3d4e5f60")
        assert s.ai_service_token.startswith("3f9a")

    def test_development_keeps_default_for_local_use(self):
        assert "change-me" in Settings(app_env="development").ai_service_token


# ═══════════════ M-2：SSRF ═══════════════


class TestIsBlockedIp:
    @pytest.mark.parametrize(
        "ip",
        [
            "127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1",
            "198.18.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255",
            "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:a9fe:a9fe", "ff02::1", "[::1]",
            "localhost", "api.localhost",
        ],
    )
    def test_blocked(self, ip: str):
        assert is_blocked_ip(ip) is True

    @pytest.mark.parametrize("ip", ["8.8.8.8", "1.1.1.1", "2001:4860:4860::8888", "api.deepseek.com"])
    def test_allowed(self, ip: str):
        assert is_blocked_ip(ip) is False


class TestSafeTransport:
    async def test_resolve_rejects_loopback_resolution(self):
        # localhost 名称即拦截；IP 字面量同理
        with pytest.raises(UnsafeOutboundTargetError):
            await resolve_safe_ip("localhost", 80)
        with pytest.raises(UnsafeOutboundTargetError):
            await resolve_safe_ip("169.254.169.254", 80)

    async def test_public_ip_literal_passes_through(self):
        assert await resolve_safe_ip("8.8.8.8", 443) == "8.8.8.8"

    async def test_transport_blocks_internal_target_before_connecting(self):
        async with httpx.AsyncClient(transport=SafeAsyncTransport()) as client:
            with pytest.raises(UnsafeOutboundTargetError):
                await client.post("http://127.0.0.1:9/chat/completions", json={})

    async def test_llm_client_maps_unsafe_target_to_connection_error(self):
        target = LlmTarget(base_url="http://169.254.169.254/v1", api_key="k", model="m")
        client = LLMClient(Settings(), target)
        try:
            with pytest.raises(LLMConnectionError, match="不安全"):
                await client.generate(system="s", user="u")
        finally:
            await client.aclose()

    async def test_llm_client_does_not_follow_redirects(self):
        target = LlmTarget(base_url="https://api.example.com/v1", api_key="k", model="m")
        client = LLMClient(Settings(), target)
        assert client._client.follow_redirects is False

        async def fake_post(url, json=None, headers=None):
            return httpx.Response(302, headers={"location": "http://169.254.169.254/"})

        client._client.post = fake_post  # type: ignore[method-assign]
        try:
            with pytest.raises(LLMInvalidResponseError, match="重定向"):
                await client.generate(system="s", user="u")
        finally:
            await client.aclose()

    async def test_pins_connection_to_resolved_ip_with_original_host_and_sni(self, monkeypatch):
        """连接钉到已校验 IP；Host 头与 TLS SNI 保持原主机名。"""
        seen: dict = {}

        async def fake_resolve(host: str, port: int) -> str:
            return "93.184.216.34"

        async def fake_inner(self, request: httpx.Request) -> httpx.Response:
            seen["url_host"] = request.url.host
            seen["host_header"] = request.headers["host"]
            seen["sni"] = request.extensions.get("sni_hostname")
            return httpx.Response(200, json={"ok": True})

        monkeypatch.setattr("app.services.url_guard.resolve_safe_ip", fake_resolve)
        monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", fake_inner)
        async with httpx.AsyncClient(transport=SafeAsyncTransport()) as client:
            resp = await client.get("https://llm.example.com/v1/models")
        assert resp.status_code == 200
        assert seen == {
            "url_host": "93.184.216.34",
            "host_header": "llm.example.com",
            "sni": "llm.example.com",
        }
