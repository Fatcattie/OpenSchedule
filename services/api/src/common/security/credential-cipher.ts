/**
 * 凭据列内字段加密（§3.3 / R4）：AES-256-GCM，ENCRYPTION_KEY 派生 32 字节密钥。
 * 用于 Webhook.secret / CalendarAccount.accessToken·refreshToken 密文落库（schema 注释既有「AES-256 密文」契约）。
 * 密文自描述格式：`v1.<base64 iv>.<base64 ciphertext>.<base64 authTag>`（version 是密钥轮换/算法升级的机动位）。
 * 派生：key = SHA-256(ENCRYPTION_KEY)。密钥轮换依赖各表的 *_key_version 列（本模块不落 keyVersion，字段语义由调用方表维护）。
 * 纪律：边界内绝不打印明文（§3.3 凭据治理）。
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const IV_BYTES = 12; // GCM 推荐 96-bit IV

/** 纯加密（供单测/无 DI 场景）：AES-256-GCM，key 须 32 字节 */
export function aesGcmEncrypt(key: Buffer, plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), ciphertext.toString('base64'), authTag.toString('base64')].join('.');
}

/** 纯解密：解析自描述密文，验 authTag（GCM 内置完整性校验，篡改抛错） */
export function aesGcmDecrypt(key: Buffer, encoded: string): string {
  const [version, ivB64, dataB64, tagB64] = encoded.split('.');
  if (version !== VERSION || !ivB64 || !dataB64 || !tagB64) {
    throw new Error('凭据密文格式非法');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

/** 由 ENCRYPTION_KEY 派生 32 字节 AES-256-GCM 密钥（SHA-256；如需更强 KDF 可升级 scrypt，版本位已预留） */
export function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

@Injectable()
export class CredentialCipher {
  /** 延迟解析密钥：构造不抛（@Global provider 在 dev/未配 ENCRYPTION_KEY 时仍可启动），使用时才校验。 */
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.secret = config.get<string>('ENCRYPTION_KEY') ?? '';
  }

  private key(): Buffer {
    if (!this.secret) throw new Error('ENCRYPTION_KEY 未配置，无法加解密凭据（生产由 startup-guard fail-fast）');
    return deriveKey(this.secret);
  }

  encrypt(plaintext: string): string {
    return aesGcmEncrypt(this.key(), plaintext);
  }

  decrypt(ciphertext: string): string {
    return aesGcmDecrypt(this.key(), ciphertext);
  }
}