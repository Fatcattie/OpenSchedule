/**
 * webhook-signer.spec.ts —— Webhook 签名单测
 */
import {
  generateSigningSecret,
  computeSignature,
  verifySignature,
} from './webhook-signer'

describe('Webhook 签名', () => {
  const secret = 'test-secret-key-12345678901234567890'
  const body = JSON.stringify({ event: 'task.created', data: { id: 't1' } })
  const timestamp = 1724563200

  describe('generateSigningSecret', () => {
    it('生成 64 字符十六进制密钥（32 字节）', () => {
      const s = generateSigningSecret()
      expect(s.length).toBe(64)
      expect(/^[0-9a-f]+$/.test(s)).toBe(true)
    })

    it('每次生成不同', () => {
      const s1 = generateSigningSecret()
      const s2 = generateSigningSecret()
      expect(s1).not.toBe(s2)
    })
  })

  describe('computeSignature', () => {
    it('返回正确格式（sha256= 前缀）', () => {
      const sig = computeSignature(secret, body, timestamp)
      expect(sig.startsWith('sha256=')).toBe(true)
      expect(sig.length).toBe(7 + 64) // sha256= + 64 hex
    })

    it('相同输入产生相同签名', () => {
      const s1 = computeSignature(secret, body, timestamp)
      const s2 = computeSignature(secret, body, timestamp)
      expect(s1).toBe(s2)
    })

    it('不同 body 产生不同签名', () => {
      const body2 = JSON.stringify({ event: 'task.deleted', data: { id: 't1' } })
      const s1 = computeSignature(secret, body, timestamp)
      const s2 = computeSignature(secret, body2, timestamp)
      expect(s1).not.toBe(s2)
    })

    it('不同时间戳产生不同签名', () => {
      const s1 = computeSignature(secret, body, 1000)
      const s2 = computeSignature(secret, body, 1001)
      expect(s1).not.toBe(s2)
    })
  })

  describe('verifySignature', () => {
    it('正确签名验证通过', () => {
      const sig = computeSignature(secret, body, timestamp)
      const result = verifySignature(secret, body, timestamp, sig, 0)
      expect(result.valid).toBe(true)
    })

    it('错误签名验证失败', () => {
      const result = verifySignature(secret, body, timestamp, 'sha256=deadbeef', 0)
      expect(result.valid).toBe(false)
      expect(result.reason).toBeDefined()
    })

    it('格式错误的签名验证失败', () => {
      const result = verifySignature(secret, body, timestamp, 'not-a-signature', 0)
      expect(result.valid).toBe(false)
      expect(result.reason).toContain('格式错误')
    })

    it('时间戳超出容忍范围失败', () => {
      const sig = computeSignature(secret, body, 1000000) // 很久以前
      const result = verifySignature(secret, body, 1000000, sig, 300)
      expect(result.valid).toBe(false)
      expect(result.reason).toContain('时间戳')
    })

    it('toleranceSec=0 时不检查时间', () => {
      const sig = computeSignature(secret, body, 1000000)
      const result = verifySignature(secret, body, 1000000, sig, 0)
      expect(result.valid).toBe(true)
    })
  })
})
