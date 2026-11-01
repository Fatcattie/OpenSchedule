/**
 * AI 回调 HMAC 验签（§3.3 / R4）：主服务侧验证 AI 服务回调签名。
 * 契约：
 *   signature = hex(HMAC-SHA256(secret, `${timestamp}.${rawBody}`))
 *   请求头：X-AI-Timestamp（unix 秒）、X-AI-Signature（hex 小写）
 * AI 侧发起端签名实现属 R11（services/ai，Python）。
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_TOLERANCE_SEC = 300;

/** 常数时间比较两个 hex 摘要（无等长则直接判不等） */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
}

/** 计算签名（供测试与文档参考；运行时主服务只做验签不主动算） */
export function computeAiSignature(secret: string, rawBody: string | Buffer, timestamp: string): string {
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  return createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex');
}

/**
 * 验证 AI 回调签名与时间窗。返回 null=通过；否则返回错误消息。
 * 时间窗容差默认 300s（防重放）；签名比较恒定时间。
 */
export function verifyAiSignature(
  secret: string,
  rawBody: string | Buffer,
  timestamp: string | undefined,
  signature: string | undefined,
  toleranceSec = DEFAULT_TOLERANCE_SEC,
): string | null {
  if (!timestamp || !signature) return '缺少 AI 回调签名头（X-AI-Timestamp / X-AI-Signature）';
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return 'AI 回调时间戳非法';
  const drift = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (drift > toleranceSec) return 'AI 回调超过时间窗，拒绝重放';
  const expected = computeAiSignature(secret, rawBody, timestamp);
  if (!timingSafeEqualHex(expected, signature.toLowerCase())) return 'AI 回调签名无效';
  return null;
}