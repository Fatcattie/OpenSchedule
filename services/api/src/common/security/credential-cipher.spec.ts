/**
 * credential-cipher（§3.3 / R4）：AES-256-GCM 加密往返 + 完整性篡改检测 + 纯函数 API。 * 无 DI（用 aesGcmEncrypt/aesGcmDecrypt + deriveKey 纯函数），无 DB。 */
import { describe, expect, it } from 'vitest'
import { deriveKey, aesGcmEncrypt, aesGcmDecrypt } from './credential-cipher';

const KEY = deriveKey('test-encryption-key-for-r4');

describe('credential-cipher 纯函数', () => {
  it('deriveKey 产出 32 字节 AES-256 密钥（确定性）', () => {
    expect(deriveKey('abc').length).toBe(32);
    expect(deriveKey('abc').equals(deriveKey('abc'))).toBe(true);
  });

  it('加密→解密 往返还原明文', () => {
    const secret = 'webhook-signing-secret-' + Math.random().toString(36);
    const encoded = aesGcmEncrypt(KEY, secret);
    expect(aesGcmDecrypt(KEY, encoded)).toBe(secret);
  });

  it('密文格式 v1.iv.ct.tag（四段，密文非明文）', () => {
    const encoded = aesGcmEncrypt(KEY, 'shh');
    const parts = encoded.split('.');
    expect(parts[0]).toBe('v1');
    expect(parts).toHaveLength(4);
    expect(encoded).not.toContain('shh'); // 密文不含明文
  });

  it('同一明文两次加密不同（随机 IV，不重放）', () => {
    const a = aesGcmEncrypt(KEY, 'shh');
    const b = aesGcmEncrypt(KEY, 'shh');
    expect(a).not.toBe(b);
  });

  it('篡改密文/ tag 抛错（GCM 完整性校验）', () => {
    const encoded = aesGcmEncrypt(KEY, 'shh');
    const [v, iv, ct, tag] = encoded.split('.');
    const tampered = [v, iv, ct, Buffer.from(Buffer.from(tag, 'base64').fill(0xff)).toString('base64')].join('.');
    expect(() => aesGcmDecrypt(KEY, tampered)).toThrow();
  });

  it('非法格式抛错', () => {
    expect(() => aesGcmDecrypt(KEY, 'garbage')).toThrow('格式非法');
  });
});
