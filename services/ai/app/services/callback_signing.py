"""AI → 主服务回调 HMAC 签名（R11 / §3.3）。

契约与主服务验签实现逐字对齐（`services/api/src/common/auth/ai-callback-signature.ts`）：

    signature = hex(HMAC-SHA256(secret, f"{timestamp}.{rawBody}"))
    请求头：X-AI-Timestamp（unix 秒）、X-AI-Signature（hex 小写）

要点：**签名的输入必须是实际发出的原始字节**——因此调用方必须把同一份 raw bytes
既用于签名也用于发送（见 `callback_delivery.deliver`）。若用 JSON 重新序列化会因
键序/空格差异导致验签失败。
"""
from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import Any

ALGORITHM = "sha256"


def serialize_body(body: dict[str, Any]) -> bytes:
    """把回调体序列化为稳定的原始字节（紧凑分隔符 + 保持非 ASCII 原样）。

    主服务侧 `rawBody` 是收到的原始字节，因此这里产出的字节就是签名与发送的同一份。
    """
    return json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def compute_signature(secret: str, raw_body: bytes, timestamp: int | str) -> str:
    """计算签名：hex(HMAC-SHA256(secret, f"{timestamp}.{raw_body_utf8}"))，hex 小写。"""
    payload = f"{timestamp}.".encode() + raw_body
    return hmac.new(secret.encode("utf-8"), payload, getattr(hashlib, ALGORITHM)).hexdigest()


def build_signature_headers(
    secret: str, raw_body: bytes, *, timestamp: int | None = None
) -> dict[str, str]:
    """构造签名头（X-AI-Timestamp / X-AI-Signature）。timestamp 缺省取当前秒。"""
    ts = int(time.time()) if timestamp is None else int(timestamp)
    return {
        "X-AI-Timestamp": str(ts),
        "X-AI-Signature": compute_signature(secret, raw_body, ts),
    }
