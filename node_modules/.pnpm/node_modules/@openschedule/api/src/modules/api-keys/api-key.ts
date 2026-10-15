/**
 * api-key.ts —— API Key 生成与验证（纯函数）
 */
import * as crypto from 'crypto'

const PREFIX = 'os_sk_'
const KEY_BYTES = 24 // 24 字节 = 48 个十六进制字符

/** 生成一个新的 API Key（仅返回明文，调用方负责保存 hash） */
export function generateApiKey(): string {
  const random = crypto.randomBytes(KEY_BYTES).toString('hex')
  return `${PREFIX}${random}`
}

/** 计算 API Key 的 SHA-256 hash（存数据库用） */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}

/** 验证 API Key 是否匹配 hash */
export function verifyApiKey(key: string, hash: string): boolean {
  const keyHash = hashApiKey(key)
  return crypto.timingSafeEqual(
    Buffer.from(keyHash, 'hex'),
    Buffer.from(hash, 'hex'),
  )
}

/** 从完整 Key 提取用于展示的前缀 */
export function getKeyPrefix(key: string): string {
  if (key.length <= PREFIX.length + 6) return key
  return key.substring(0, PREFIX.length + 4) + '...'
}
