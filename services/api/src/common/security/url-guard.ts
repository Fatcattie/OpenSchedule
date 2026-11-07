/**
 * 出站 URL 安全守卫（§3.3 / R4）：SSRF 防护。
 * - isPrivateIp：纯函数判私有/环回/链路本地/保留/组播等非全局地址（IPv4 + IPv6，基于 net.BlockList 网段匹配）。
 * - assertSafeOutboundUrl：async 预检（协议 + DNS 解析结果），用于写入配置时给出友好报错。
 * - safeLookup / safeHttpAgent / safeHttpsAgent / safeFetch：**连接时**校验（安全问题 M-3）——
 *   校验用的 DNS 结果就是实际建连用的结果，杜绝「预检通过后 DNS 重绑定到内网」的 TOCTOU；
 *   safeFetch 不跟随重定向，防 30x 跳转到内网。
 */
import { promises as dns, lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';

/**
 * 非全局可路由网段（IANA special-purpose registry 中不应作为出站目标的部分）。
 * 文档网段（TEST-NET-1/2/3、2001:db8::/32）公网不可路由也不通向内网，不构成 SSRF 风险，未列入（单测用作公网样例）。
 */
const BLOCKED = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], // 「本网络」
  ['10.0.0.0', 8], // 私有
  ['100.64.0.0', 10], // CGNAT 共享地址
  ['127.0.0.0', 8], // 环回
  ['169.254.0.0', 16], // 链路本地（含云元数据 169.254.169.254）
  ['172.16.0.0', 12], // 私有
  ['192.0.0.0', 24], // IETF 协议分配
  ['192.88.99.0', 24], // 6to4 中继（已废弃）
  ['192.168.0.0', 16], // 私有
  ['198.18.0.0', 15], // 基准测试
  ['224.0.0.0', 4], // 组播
  ['240.0.0.0', 4], // 保留（含 255.255.255.255 广播）
] as const) {
  BLOCKED.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128], // 未指定
  ['::1', 128], // 环回
  ['64:ff9b::', 96], // NAT64（内嵌 IPv4，可被引到内网）
  ['64:ff9b:1::', 48], // 本地 NAT64
  ['100::', 64], // 丢弃前缀
  ['2001::', 23], // IETF 协议分配（含 Teredo）
  ['2002::', 16], // 6to4（内嵌 IPv4）
  ['fc00::', 7], // 唯一本地 ULA
  ['fe80::', 10], // 链路本地
  ['fec0::', 10], // 站点本地（已废弃）
  ['ff00::', 8], // 组播
] as const) {
  BLOCKED.addSubnet(net, prefix, 'ipv6');
}

const LOCAL_HOSTNAMES = new Set(['localhost', 'localhost.localdomain', 'ip6-localhost', 'ip6-loopback']);

/**
 * 是否非全局可路由地址（纯函数，供单测）。
 * - IPv4-mapped IPv6（::ffff:a.b.c.d 与十六进制写法 ::ffff:7f00:1）按内嵌 IPv4 判。
 * - 非 IP 字面量：仅 localhost 类主机名返回 true，其余域名返回 false（域名需经 DNS 解析后再判）。
 */
export function isPrivateIp(ip: string): boolean {
  const addr = ip.trim().replace(/^\[|\]$/g, '').toLowerCase();
  if (LOCAL_HOSTNAMES.has(addr) || addr.endsWith('.localhost')) return true;
  const family = isIP(addr);
  if (family === 4) return BLOCKED.check(addr, 'ipv4');
  if (family === 6) {
    const mapped = mappedIpv4(addr);
    if (mapped) return BLOCKED.check(mapped, 'ipv4');
    return BLOCKED.check(addr, 'ipv6');
  }
  return false;
}

/** 解出 IPv4-mapped IPv6（::ffff:0:0/96）内嵌的 IPv4；不是则返回 null */
function mappedIpv4(addr: string): string | null {
  const dotted = /^(?:0{0,4}:){0,4}:?:ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (dotted) return dotted[1];
  const hex = /^(?:0{0,4}:){0,4}:?:ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(addr);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  }
  return null;
}

/** 出站目标不安全（内网/环回/元数据/保留地址或非 http(s)） */
export class UnsafeOutboundUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeOutboundUrlError';
  }
}

/** 协议 + 字面量主机校验；返回解析后的 URL */
function parseOutboundUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UnsafeOutboundUrlError('URL 非法');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new UnsafeOutboundUrlError('仅支持 http/https URL');
  }
  if (isPrivateIp(parsed.hostname)) {
    throw new UnsafeOutboundUrlError('目标地址不可达（内网/环回/元数据地址被拒绝）');
  }
  return parsed;
}

/**
 * 校验出站 URL 安全（预检）：仅 http/https；解析主机后不得指向非全局地址。
 * 用于写入配置时给出友好报错；**真正发请求请用 safeFetch / safe*Agent**（连接时再校验一次）。
 */
export async function assertSafeOutboundUrl(rawUrl: string): Promise<void> {
  const parsed = parseOutboundUrl(rawUrl);
  const addresses = await dns.lookup(parsed.hostname, { all: true }).catch(() => []);
  for (const a of addresses) {
    if (isPrivateIp(a.address)) {
      throw new UnsafeOutboundUrlError('目标地址解析到内网/环回地址，已被拒绝');
    }
  }
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/**
 * 连接时 DNS 校验（net/http `lookup` 选项签名）：解析结果中任一地址非全局即拒绝建连。
 * 与实际连接共用同一次解析结果，不存在校验后重绑定的时间窗口。
 */
export function safeLookup(hostname: string, options: LookupOptions, callback: LookupCallback): void {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, options.all ? [] : '', undefined);
    const list = addresses as LookupAddress[];
    const blocked = list.find((a) => isPrivateIp(a.address));
    if (blocked || list.length === 0) {
      const e = new UnsafeOutboundUrlError(`目标主机 ${hostname} 解析到内网/环回/保留地址，已拒绝连接`) as NodeJS.ErrnoException;
      e.code = 'EUNSAFEADDR';
      return callback(e, options.all ? [] : '', undefined);
    }
    if (options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

/** 带连接时 SSRF 校验的 Agent（供 web-push 等接受 agent 的库使用） */
export const safeHttpAgent = new http.Agent({ keepAlive: true, lookup: safeLookup as never });
export const safeHttpsAgent = new https.Agent({ keepAlive: true, lookup: safeLookup as never });

/** 响应体上限（防恶意目标返回超大响应耗尽内存） */
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

/**
 * SSRF 安全的 fetch（子集）：基于 node:http(s) + safeLookup，**从不跟随重定向**。
 * - init.redirect === 'error'（与原生 fetch 同语义）时遇 3xx 抛错；否则原样返回 3xx 响应。
 * - 支持 method / headers / string|Buffer body / signal；返回标准 Response。
 */
export async function safeFetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  const url = parseOutboundUrl(input instanceof Request ? input.url : String(input));
  const transport = url.protocol === 'https:' ? https : http;
  const agent = url.protocol === 'https:' ? safeHttpsAgent : safeHttpAgent;
  const headers = Object.fromEntries(new Headers(init.headers).entries());
  const body = init.body == null ? undefined : typeof init.body === 'string' ? init.body : Buffer.from(init.body as ArrayBuffer);
  if (body !== undefined && headers['content-length'] === undefined) {
    headers['content-length'] = String(Buffer.byteLength(body));
  }

  return new Promise<Response>((resolve, reject) => {
    const req = transport.request(
      url,
      { method: init.method ?? 'GET', headers, agent, signal: init.signal ?? undefined },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && init.redirect === 'error') {
          res.resume();
          reject(new TypeError(`出站请求被重定向（HTTP ${status}），已拒绝跟随`));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) {
            req.destroy(new Error('出站响应体超过上限'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          const resHeaders = new Headers();
          for (const [k, v] of Object.entries(res.headers)) {
            if (Array.isArray(v)) v.forEach((item) => resHeaders.append(k, item));
            else if (v !== undefined) resHeaders.set(k, v);
          }
          const nullBody = status === 204 || status === 304 || init.method === 'HEAD';
          resolve(new Response(nullBody ? null : Buffer.concat(chunks), { status, statusText: res.statusMessage, headers: resHeaders }));
        });
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}
