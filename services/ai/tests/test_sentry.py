"""AI 错误上报测试：DSN 解析 · 脱敏 · Envelope 结构 · 限流 · no-op · 500 处理器上报 · 4xx 不上报。"""
from __future__ import annotations

import json

import httpx
import pytest

from app.main import create_app
from app.services import sentry
from app.services.dead_letter import MemoryDeadLetterStore, set_dead_letter_store
from app.services.run_store import MemoryRunStore, set_run_store

DSN = "https://abc123@o1.ingest.sentry.io/42"


class Recorder:
    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return httpx.Response(200)

    def event(self, index: int = 0) -> dict:
        return json.loads(self.requests[index].content.decode().strip().split("\n")[2])


@pytest.fixture
def recorder():
    rec = Recorder()
    client = httpx.AsyncClient(transport=httpx.MockTransport(rec.handler))
    sentry.init_sentry(DSN, "staging", "v1.2.3", client=client)
    yield rec
    sentry.reset_for_test()


@pytest.fixture(autouse=True)
def _reset():
    yield
    sentry.reset_for_test()


def _raise(message: str) -> Exception:
    try:
        raise RuntimeError(message)
    except RuntimeError as exc:
        return exc


def test_parse_dsn_variants():
    assert sentry.parse_dsn(DSN) == ("abc123", "https://o1.ingest.sentry.io/api/42/envelope/")
    assert sentry.parse_dsn("https://k@sentry.example.com:9000/prefix/7") == (
        "k",
        "https://sentry.example.com:9000/prefix/api/7/envelope/",
    )
    for bad in ["", None, "not a url", "https://o1.ingest.sentry.io/42", "https://k@host/abc"]:
        assert sentry.parse_dsn(bad) is None


def test_settings_prefers_ai_sentry_dsn(monkeypatch):
    from app.config import Settings

    monkeypatch.setenv("SENTRY_DSN", "https://shared@h/1")
    assert Settings(_env_file=None).sentry_dsn == "https://shared@h/1"
    monkeypatch.setenv("AI_SENTRY_DSN", "https://ai@h/2")
    assert Settings(_env_file=None).sentry_dsn == "https://ai@h/2"


def test_no_dsn_is_noop():
    assert sentry.init_sentry("", "production") is False
    assert sentry.is_enabled() is False
    assert sentry.capture_exception(_raise("x")) is None


def test_scrub_message_masks_credentials():
    out = sentry.scrub_message(
        "Bearer abc.def api_key=xyz sk-abcdefghijklmnopqrstu "
        "eyJaaaaaaaaaa.bbbbbbbbbbbb.cccccccccccc " + "a" * 40
    )
    for leaked in ["abc.def", "xyz", "sk-abcdefghijklmnopqrstu", "eyJa", "a" * 40]:
        assert leaked not in out


def test_build_event_shape():
    options = sentry.resolve_options(DSN, "prod", "v1")
    event = sentry.build_event(_raise("boom token=secret"), options, {"route": "/ai/decompose"})
    assert event["platform"] == "python"
    assert event["environment"] == "prod"
    assert event["release"] == "v1"
    assert event["tags"] == {"service": "openschedule-ai", "route": "/ai/decompose"}
    exc = event["exception"]["values"][0]
    assert exc["type"] == "RuntimeError"
    assert "secret" not in exc["value"]
    frames = exc["stacktrace"]["frames"]
    assert frames[-1]["function"] == "_raise"


def test_envelope_has_three_lines():
    options = sentry.resolve_options(DSN, "prod", None)
    event = sentry.build_event(_raise("x"), options)
    assert "release" not in event
    lines = sentry.build_envelope(event).decode().strip().split("\n")
    assert len(lines) == 3
    assert json.loads(lines[0])["event_id"] == event["event_id"]
    assert json.loads(lines[1])["type"] == "event"


async def test_capture_posts_envelope_with_auth_header(recorder):
    task = sentry.capture_exception(_raise("boom"), {"run_id": "r1"})
    assert task is not None
    await task
    assert len(recorder.requests) == 1
    req = recorder.requests[0]
    assert str(req.url) == "https://o1.ingest.sentry.io/api/42/envelope/"
    assert req.headers["content-type"] == "application/x-sentry-envelope"
    assert "sentry_key=abc123" in req.headers["x-sentry-auth"]
    assert "sentry_version=7" in req.headers["x-sentry-auth"]
    event = recorder.event()
    assert event["environment"] == "staging"
    assert event["tags"]["run_id"] == "r1"


async def test_rate_limit_per_minute():
    rec = Recorder()
    now = [0.0]
    client = httpx.AsyncClient(transport=httpx.MockTransport(rec.handler))
    sentry.init_sentry(DSN, "staging", client=client, clock=lambda: now[0])
    tasks = [sentry.capture_exception(_raise(f"e{i}")) for i in range(sentry.MAX_EVENTS_PER_MINUTE + 5)]
    sent = [t for t in tasks if t is not None]
    assert len(sent) == sentry.MAX_EVENTS_PER_MINUTE
    now[0] = 61.0
    later = sentry.capture_exception(_raise("later"))
    assert later is not None
    for t in [*sent, later]:
        await t
    assert len(rec.requests) == sentry.MAX_EVENTS_PER_MINUTE + 1


async def test_transport_failure_is_silent():
    def boom(_: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("offline")

    client = httpx.AsyncClient(transport=httpx.MockTransport(boom))
    sentry.init_sentry(DSN, "staging", client=client)
    task = sentry.capture_exception(_raise("x"))
    await task  # 不抛


def _app_with_routes():
    set_run_store(MemoryRunStore())
    set_dead_letter_store(MemoryDeadLetterStore())
    app = create_app()

    @app.get("/__boom")
    async def boom() -> dict:
        raise RuntimeError("unexpected password=hunter2")

    @app.get("/__teapot")
    async def teapot() -> dict:
        from fastapi import HTTPException

        raise HTTPException(status_code=418, detail="no")

    return app


async def test_unhandled_exception_returns_500_and_reports(recorder):
    app = _app_with_routes()
    client = httpx.AsyncClient(transport=httpx.MockTransport(recorder.handler))
    sentry.init_sentry(DSN, "staging", client=client)
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://ai.test") as client:
        resp = await client.get("/__boom")
        assert resp.status_code == 500
        assert resp.json()["detail"]["code"] == "AI_INTERNAL_ERROR"
        assert "hunter2" not in resp.text
        resp = await client.get("/__teapot")
        assert resp.status_code == 418
    for task in list(sentry._active.tasks):  # noqa: SLF001
        await task
    assert len(recorder.requests) == 1, "只有 5xx 上报，HTTPException(4xx) 不上报"
    event = recorder.event()
    assert event["tags"]["route"] == "/__boom"
    assert "hunter2" not in event["exception"]["values"][0]["value"]
