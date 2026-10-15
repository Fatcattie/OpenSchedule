/**
 * RefreshTokenStore：refresh token 吊销存储（jti 黑名单）。
 * Phase 1 进程内 Map 实现（单实例有效）；生产多实例需换 Redis（§3.7 REDIS_URL 就绪后替换，TODO 见下）。
 * 吊销条目带过期时间（= refresh TTL），惰性清理防内存膨胀。
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RefreshTokenStore {
  /** jti -> 过期时间戳（ms） */
  private readonly revoked = new Map<string, number>();

  constructor(private readonly config: ConfigService) {}

  /** 吊销 jti（TTL 取 JWT_REFRESH_TTL，默认 7d） */
  revoke(jti: string): void {
    const ttlMs = parseTtlMs(this.config.get<string>('JWT_REFRESH_TTL') ?? '7d');
    this.revoked.set(jti, Date.now() + ttlMs);
    this.sweepIfNeeded();
  }

  isRevoked(jti: string): boolean {
    const exp = this.revoked.get(jti);
    if (exp === undefined) return false;
    if (exp <= Date.now()) {
      this.revoked.delete(jti);
      return false;
    }
    return true;
  }

  /** 惰性清理：条目超 10_000 时清过期项 */
  private sweepIfNeeded(): void {
    if (this.revoked.size < 10_000) return;
    const now = Date.now();
    for (const [jti, exp] of this.revoked) {
      if (exp <= now) this.revoked.delete(jti);
    }
  }
}

/** '15m'/'7d'/'2h' → ms（仅支持 s/m/h/d 单位，配置错误按默认兜底） */
function parseTtlMs(ttl: string): number {
  const m = /^(\d+)([smhd])$/.exec(ttl);
  if (!m) return 7 * 24 * 60 * 60 * 1000;
  const n = Number(m[1]);
  const unit = m[2];
  const factor = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] ?? 0; // 正则已限定 [smhd]，兜底 0 仅满足类型
  return n * factor;
}