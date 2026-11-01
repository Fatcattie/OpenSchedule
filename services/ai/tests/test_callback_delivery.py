"""回调投递与签名测试（R11 / §3.3）：HMAC 签名、幂等键、有界重试、永久失败、死信与重放。

签名契约必须与主服务验签实现逐字一致：
    signature = hex(HMAC-SHA256(secret, f"{timestamp}.{rawBody}"))
    headers   = X-AI-Timestamp（unix 秒）、X-AI-Signature（hex 小写）
本文件用「参考实现」（hashlib 手算）交叉验证；跨语言（Python 签 / TS 验）由
`tests/qa/ai-hardening-gates.test.ts` 用真实主服务函数做强校验。
"""
from __future__ import annotations

import hashlib
import hmac
import json
import time

import httpx
import pytest

from app.services import callback_delivery
from app.services.callback_signing import build_signature_headers, compute_signature, serialize_body
from app.services.dead_letter import DeadLetterEntry, MemoryDeadLetterStore, set_dead_letter_store

SECRET = "dev-ai-service-token-change-me"
URL = "http://main.test/internal/ai/results"


class RecordingSleeper:
    """记录退避时长（不真的睡）。"""

    def __init__(self) -> None:
        self.delays: list[float] = []

    async def __call__(self, seconds: float) -> None:
        self.delays.append(seconds)


def _client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://main.test")


class TestSigning:
    def test_serialize_body_is_compact_and_utf8_preserving(self):
        raw = serialize_body({"b": 1, "a": "中文"})
        assert raw == '{"b":1,"a":"中文"}'.encode()
        assert isinstance(raw, bytes)

    def test_signature_matches_reference_implementation(self):
        raw = serialize_body({"run_id": "r1"})
        ts = 1_700_000_000
        expected = hmac.new(SECRET.encode(), f"{ts}.".encode() + raw, hashlib.sha256).hexdigest()
        assert compute_signature(SECRET, raw, ts) == expected
        assert len(expected) == 64 and expected == expected.lower()

    def test_headers_contain_timestamp_and_signature(self):
        raw = serialize_body({"run_id": "r1"})
        headers = build_signature_headers(SECRET, raw, timestamp=1_700_000_000)
        assert headers["X-AI-Timestamp"] == "1700000000"
        assert headers["X-AI-Signature"] == compute_signature(SECRET, raw, 1_700_000_000)

    def test_default_timestamp_is_now(self):
        raw = b"{}"
        headers = build_signature_headers(SECRET, raw)
        assert abs(int(headers["X-AI-Timestamp"]) - int(time.time())) <= 5

    def test_same_body_signed_at_other_timestamp_differs(self):
        raw = b'{"a":1}'
        assert compute_signature(SECRET, raw, 1) != compute_signature(SECRET, raw, 2)

    def test_different_secret_differs(self):
        raw = b'{"a":1}'
        assert compute_signature("a", raw, 1) != compute_signature("b", raw, 1)


class TestBuildRequest:
    def test_body_and_headers(self):
        body = callback_delivery.build_callback_body("r1", "p1", "succeeded", payload={"tasks": []})
        assert body == {"run_id": "r1", "proposal_id": "p1", "status": "succeeded", "payload": {"tasks": []}}
        raw = serialize_body(body)
        headers = callback_delivery.build_headers(SECRET, raw, run_id="r1")
        assert headers["Authorization"] == f"Bearer {SECRET}"
        assert headers["Idempotency-Key"] == "ai-run:r1"
        assert headers["Content-Type"] == "application/json"
        assert headers["X-AI-Signature"] == compute_signature(SECRET, raw, headers["X-AI-Timestamp"])

    def test_failed_body_carries_error(self):
        body = callback_delivery.build_callback_body("r1", None, "failed", error={"code": "AI_LLM_TIMEOUT"})
        assert body["error"] == {"code": "AI_LLM_TIMEOUT"}
        assert "payload" not in body

    def test_backoff_is_bounded(self):
        assert callback_delivery.callback_delay_seconds(1) == 1
        assert callback_delivery.callback_delay_seconds(2) == 2
        assert callback_delivery.callback_delay_seconds(10) == 8


class TestDeliver:
    async def test_success_first_attempt_and_signature_verified_by_server(self):
        seen: dict[str, str] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen["body"] = request.content.decode()
            seen["sig"] = request.headers["X-AI-Signature"]
            seen["ts"] = request.headers["X-AI-Timestamp"]
            seen["idem"] = request.headers["Idempotency-Key"]
            seen["auth"] = request.headers["Authorization"]
            return httpx.Response(200, json={"ok": True})

        outcome = await callback_delivery.deliver(
            URL, {"run_id": "r1", "status": "succeeded"}, run_id="r1", secret=SECRET, client=_client(handler)
        )
        assert outcome.ok and outcome.attempts == 1 and outcome.status_code == 200
        # 服务端按原始字节验签必须通过 —— 证明「签的就是发的」
        assert seen["sig"] == compute_signature(SECRET, seen["body"].encode("utf-8"), seen["ts"])
        assert seen["idem"] == "ai-run:r1"
        assert seen["auth"] == f"Bearer {SECRET}"

    async def test_retries_then_succeeds_with_backoff(self):
        attempts = {"n": 0}
        sleeper = RecordingSleeper()

        def handler(request: httpx.Request) -> httpx.Response:
            attempts["n"] += 1
            return httpx.Response(500, text="boom") if attempts["n"] < 3 else httpx.Response(201)

        outcome = await callback_delivery.deliver(
            URL, {"run_id": "r1"}, run_id="r1", secret=SECRET, client=_client(handler), sleeper=sleeper
        )
        assert outcome.ok and outcome.attempts == 3
        assert sleeper.delays == [1.0, 2.0]

    async def test_network_error_is_retried(self):
        attempts = {"n": 0}

        def handler(request: httpx.Request) -> httpx.Response:
            attempts["n"] += 1
            raise httpx.ConnectError("refused", request=request)

        outcome = await callback_delivery.deliver(
            URL,
            {"run_id": "r1"},
            run_id="r1",
            secret=SECRET,
            client=_client(handler),
            sleeper=RecordingSleeper(),
        )
        assert not outcome.ok
        assert outcome.attempts == 3
        assert "ConnectError" in (outcome.last_error or "")

    @pytest.mark.parametrize("status", [400, 401, 403, 404])
    async def test_permanent_client_error_stops_immediately(self, status):
        attempts = {"n": 0}
        sleeper = RecordingSleeper()

        def handler(request: httpx.Request) -> httpx.Response:
            attempts["n"] += 1
            return httpx.Response(status, text="no retry")

        outcome = await callback_delivery.deliver(
            URL, {"run_id": "r1"}, run_id="r1", secret=SECRET, client=_client(handler), sleeper=sleeper
        )
        assert not outcome.ok and outcome.permanent is True
        assert attempts["n"] == 1
        assert sleeper.delays == []

    @pytest.mark.parametrize("status", [408, 429])
    async def test_throttle_like_4xx_is_retried(self, status):
        attempts = {"n": 0}

        def handler(request: httpx.Request) -> httpx.Response:
            attempts["n"] += 1
            return httpx.Response(status, text="retry me")

        outcome = await callback_delivery.deliver(
            URL,
            {"run_id": "r1"},
            run_id="r1",
            secret=SECRET,
            max_attempts=2,
            client=_client(handler),
            sleeper=RecordingSleeper(),
        )
        assert not outcome.ok and outcome.permanent is False
        assert attempts["n"] == 2


class TestDeliverCallbackDeadLetter:
    async def test_failure_records_dead_letter_with_body(self):
        store = MemoryDeadLetterStore()
        set_dead_letter_store(store)

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(503, text="unavailable")

        outcome = await callback_delivery.deliver_callback(
            run_id="run-42",
            proposal_id="p-42",
            status="succeeded",
            payload={"tasks": [{"title": "t"}]},
            internal_url="http://main.test",
            max_attempts=2,
            client=_client(handler),
            sleeper=RecordingSleeper(),
        )
        assert not outcome.ok
        entries = await store.list()
        assert len(entries) == 1
        assert entries[0].run_id == "run-42"
        assert entries[0].proposal_id == "p-42"
        assert entries[0].attempts == 2
        assert "503" in entries[0].last_error
        assert entries[0].body["payload"] == {"tasks": [{"title": "t"}]}

    async def test_success_records_no_dead_letter(self):
        store = MemoryDeadLetterStore()
        set_dead_letter_store(store)
        outcome = await callback_delivery.deliver_callback(
            run_id="run-1",
            proposal_id=None,
            status="failed",
            error={"code": "AI_INTERNAL_ERROR"},
            internal_url="http://main.test",
            client=_client(lambda request: httpx.Response(200, json={})),
        )
        assert outcome.ok
        assert await store.count() == 0


class TestReplayDeadLetter:
    async def test_replay_success_marks_entry(self):
        store = MemoryDeadLetterStore()
        set_dead_letter_store(store)
        entry = await store.add(
            DeadLetterEntry(
                id="",
                run_id="run-7",
                proposal_id="p",
                status="succeeded",
                attempts=3,
                last_error="HTTP 503",
                body={"run_id": "run-7", "proposal_id": "p", "status": "succeeded"},
            )
        )
        seen: dict[str, str] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen["idem"] = request.headers["Idempotency-Key"]
            seen["sig"] = request.headers["X-AI-Signature"]
            seen["ts"] = request.headers["X-AI-Timestamp"]
            seen["body"] = request.content.decode()
            return httpx.Response(200, json={"ok": True})

        result = await callback_delivery.replay_dead_letter(entry.id, client=_client(handler))
        assert result is not None and result.ok is True
        assert seen["idem"] == "ai-run:run-7", "重放必须沿用原幂等键（主服务去重）"
        assert seen["sig"] == compute_signature(SECRET, seen["body"].encode("utf-8"), seen["ts"])
        stored = await store.get(entry.id)
        assert stored.replayed_at is not None
        assert stored.replay_result.startswith("ok status=200")

    async def test_replay_failure_records_result_and_returns_none_for_unknown(self):
        store = MemoryDeadLetterStore()
        set_dead_letter_store(store)
        entry = await store.add(DeadLetterEntry(id="", run_id="r", status="succeeded", body={"run_id": "r"}))
        result = await callback_delivery.replay_dead_letter(
            entry.id, client=_client(lambda request: httpx.Response(500, text="still down"))
        )
        assert result is not None and result.ok is False
        stored = await store.get(entry.id)
        assert stored.replay_result.startswith("failed")
        missing = await callback_delivery.replay_dead_letter(
            "missing", client=_client(lambda r: httpx.Response(200))
        )
        assert missing is None


def test_json_body_matches_serialized_bytes():
    """回归保护：报文经 httpx `content=` 发送后，服务端拿到的字节必须可复现（否则验签必失败）。"""
    body = callback_delivery.build_callback_body("r1", "p1", "succeeded", payload={"tasks": [{"t": "中文"}]})
    raw = serialize_body(body)
    assert json.loads(raw.decode("utf-8")) == body
    assert raw == json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
