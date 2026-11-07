"""出站请求 SSRF 防护（安全问题 M-2）：与主服务 `common/security/url-guard.ts` 同语义。

AI 服务按请求体下发的 `LlmTarget.base_url` 直连模型厂商；主服务写入配置时已做 SSRF 预检，
但 AI 侧作为最后一道防线必须独立校验，且要在**连接时**校验（防 DNS 重绑定 TOCTOU）：

- `is_blocked_ip`：非全局可路由地址（私有/环回/链路本地/云元数据/CGNAT/保留/组播；IPv4-mapped 按内嵌 IPv4 判）
- `SafeAsyncTransport`：每个请求先解析主机、校验**全部**解析结果，再把连接钉到已校验的 IP
  （Host 头与 TLS SNI/证书校验仍用原主机名），校验与建连用同一次解析结果
- 客户端须 `follow_redirects=False`：30x 不跟随，防跳转到内网
"""
from __future__ import annotations

import asyncio
import ipaddress
import socket

import httpx

_LOCAL_HOSTNAMES = frozenset({"localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback"})


class UnsafeOutboundTargetError(httpx.ConnectError):
    """出站目标指向非全局地址（继承 ConnectError：调用方按「连不上」分类降级）。"""


def is_blocked_ip(value: str) -> bool:
    """是否非全局可路由地址；非 IP 字面量仅 localhost 类主机名返回 True。"""
    host = value.strip().strip("[]").lower()
    if host in _LOCAL_HOSTNAMES or host.endswith(".localhost"):
        return True
    try:
        ip = ipaddress.ip_address(host.split("%", 1)[0])  # 去掉 IPv6 zone id
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    # is_global 覆盖 IANA special-purpose registry；CGNAT 100.64/10 的 is_global 为 False；组播单独排除
    return not ip.is_global or ip.is_multicast


async def resolve_safe_ip(host: str, port: int) -> str:
    """解析主机并校验全部结果；返回用于建连的已校验 IP。任一结果非全局即拒绝。"""
    if is_blocked_ip(host):
        raise UnsafeOutboundTargetError(f"出站目标 {host} 为内网/环回/保留地址，已拒绝")
    try:
        ipaddress.ip_address(host.strip("[]"))
        return host.strip("[]")  # 已是公网 IP 字面量
    except ValueError:
        pass
    loop = asyncio.get_running_loop()
    try:
        infos = await loop.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise httpx.ConnectError(f"无法解析模型服务主机：{host}") from exc
    addresses = [str(info[4][0]) for info in infos]
    if not addresses or any(is_blocked_ip(a) for a in addresses):
        raise UnsafeOutboundTargetError(f"出站目标 {host} 解析到内网/环回/保留地址，已拒绝")
    return addresses[0]


class SafeAsyncTransport(httpx.AsyncBaseTransport):
    """连接时 SSRF 校验的传输层：把请求钉到已校验 IP，保留原 Host 头与 TLS SNI。"""

    def __init__(self, **transport_kwargs: object) -> None:
        self._inner = httpx.AsyncHTTPTransport(**transport_kwargs)  # type: ignore[arg-type]

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        url = request.url
        if url.scheme not in ("http", "https"):
            raise UnsafeOutboundTargetError(f"仅支持 http/https 出站：{url.scheme}")
        host = url.host
        ip = await resolve_safe_ip(host, url.port or (443 if url.scheme == "https" else 80))
        if ip != host:
            # Host 头在 build_request 时已按原主机名写入；SNI 与证书主机名校验沿用原主机名
            request.url = url.copy_with(host=ip)
            if url.scheme == "https":
                request.extensions = {**request.extensions, "sni_hostname": host}
        return await self._inner.handle_async_request(request)

    async def aclose(self) -> None:
        await self._inner.aclose()
