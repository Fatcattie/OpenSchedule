/**
 * Express `trust proxy` 解析（安全问题 M-1）。
 *
 * 只有被信任的反向代理写入的 X-Forwarded-For 才可用于确定客户端 IP；否则任何人都能伪造 XFF 绕过按 IP 限流。
 * 生产拓扑：公网 → Caddy → api:3000（一跳，Caddy 默认丢弃客户端自带的 XFF 并写入真实对端地址）→ TRUST_PROXY=1。
 *
 * TRUST_PROXY 取值：
 * - 空 / `false` / `0` → 不信任任何代理（req.ip = socket 地址，XFF 被忽略）—— 默认
 * - 正整数 N → 信任最近 N 跳代理
 * - `true` → 信任全部（不安全，仅限确认全链路可信时）
 * - 其他 → 逗号分隔的 IP / CIDR / Express 预设名（loopback、linklocal、uniquelocal）
 */
export type TrustProxySetting = boolean | number | string[];

export function parseTrustProxy(raw: string | undefined): TrustProxySetting {
  const value = (raw ?? '').trim();
  if (!value || value === 'false' || value === '0') return false;
  if (value === 'true') return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}
