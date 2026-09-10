/**
 * webhook-signer.ts —— Webhook 签名生成与验证（纯函数）
 */
import * as crypto from 'crypto'

const SECRET_BYTES = 32
const SIGNATURE_PREFIX = 'sha256='

/** 生成一个随机签名密钥（创建 Webhook 时返回给用户） */
export function generateSigningSecret(): string {
  return crypto.randomBytes(SECRET_BYTES).toString('hex')
}

/**
 * 计算 Webhook 请求签名
 * HMAC-SHA256(secret, timestamp + "." + body)
 */
export function computeSignature(
  secret: string,
  body: string,
  timestamp: number | string,
): string {
  const timestampStr = String(timestamp)
  const payload = `${timestampStr}.${body}`
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(payload)
  return SIGNATURE_PREFIX + hmac.digest('hex')
}

/**
 * 验证 Webhook 签名
 * @param secret 签名密钥
 * @param body 请求 body（原始 JSON 字符串）
 * @param timestamp 请求时间戳（秒）
 * @param signature 请求头中的签名（sha256=xxx）
 * @param toleranceSec 时间容忍度（秒），默认 300 秒。0 或负数表示不检查时间
 */
export function verifySignature(
  secret: string,
  body: string,
  timestamp: number | string,
  signature: string,
  toleranceSec: number = 300,
): { valid: boolean; reason?: string } {
  // 格式校验
  if (!signature.startsWith(SIGNATURE_PREFIX)) {
    return { valid: false, reason: '签名格式错误' }
  }

  // 时间校验
  if (toleranceSec > 0) {
    const ts = Number(timestamp)
    if (isNaN(ts)) return { valid: false, reason: '时间戳无效' }
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - ts) > toleranceSec) {
      return { valid: false, reason: '时间戳超出容忍范围' }
    }
  }

  const expected = computeSignature(secret, body, timestamp)
  const expectedBuffer = Buffer.from(expected.slice(SIGNATURE_PREFIX.length), 'hex')
  const actualBuffer = Buffer.from(signature.slice(SIGNATURE_PREFIX.length), 'hex')

  // 长度不同直接失败
  if (expectedBuffer.length !== actualBuffer.length) {
    return { valid: false, reason: '签名长度不匹配' }
  }

  if (!crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    return { valid: false, reason: '签名不匹配' }
  }

  return { valid: true }
}
