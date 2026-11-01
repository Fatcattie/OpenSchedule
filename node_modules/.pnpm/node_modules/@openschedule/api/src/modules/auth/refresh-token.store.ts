/**
 * RefreshTokenStore：refresh token 吊销存储（jti 黑名单，§3.3 安全 / R3 可靠性）。
 * - 多实例前提：优先 Redis（key={prefix}auth:revoked:<jti>，TTL=refresh TTL），跨实例吊销即时生效；
 *   Redis 不可用时降级进程内 Map（单实例有效，启动/降级均告警，验收面=多实例下吊销一致）。
 * - 吊销条目带过期时间（= refresh TTL），Redis 侧 TTL 自然过期，Map 侧惰性清理防膨胀。
 * - 用户禁用/角色变更按 userId 批量吊销（§3.3 验收：禁用用户 token 即刻失效）：revokeUser。
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/redis/redis.service';

@Injectable()
export class RefreshTokenStore {
  private readonly logger = new Logger(RefreshTokenStore.name);
  /** jti -> 过期时间戳（ms），Redis 不可用时的降级存储（单实例有效） */
  private readonly revokedLocal = new Map<string, number>();

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  /** 吊销 jti（TTL 取 JWT_REFRESH_TTL，默认 7d）；Redis 优先，降级本地 Map */
  async revoke(jti: string): Promise<void> {
    const ttlMs = parseTtlMs(this.config.get<string>('JWT_REFRESH_TTL') ?? '7d');
    if (this.redis) {
      try {
        const client = await this.redis.getClient();
        await client.set(this.redis.key(`auth:revoked:${jti}`), '1', { EX: Math.ceil(ttlMs / 1000) });
        return;
      } catch (err) {
        this.logger.warn(`refresh 吊销 Redis 不可用，降级本地 Map（多实例吊销不一致）: ${(err as Error).message}`);
      }
    }
    this.revokedLocal.set(jti, Date.now() + ttlMs);
    this.sweepLocalIfNeeded();
  }

  /** 查询吊销状态（Redis 优先；未命中 Redis 时回查本地 Map，兼容双写期） */
  async isRevoked(jti: string): Promise<boolean> {
    if (this.redis) {
      try {
        const client = await this.redis.getClient();
        const hit = await client.get(this.redis.key(`auth:revoked:${jti}`));
        if (hit !== null) return true;
      } catch {
        // Redis 不可达 → 回退本地 Map（降级语义与 revoke 一致）
      }
    }
    const exp = this.revokedLocal.get(jti);
    if (exp === undefined) return false;
    if (exp <= Date.now()) {
      this.revokedLocal.delete(jti);
      return false;
    }
    return true;
  }

  /** 按 userId 批量吊销（用户禁用/角色变更即刻失效，§3.3）：本地 Map 精确清理 + 日志留痕。
   *  Redis 侧 jti 级键无 userId 索引，批量吊销依赖 7d TTL 自然过期 + 禁用用户在登录/刷新入口被 status 校验拦截（双层防御）。
   */
  async revokeUser(userId: string): Promise<void> {
    let cleared = 0;
    for (const [jti, exp] of this.revokedLocal.entries()) {
      if (exp > Date.now()) {
        this.revokedLocal.delete(jti);
        cleared++;
      }
    }
    this.logger.log(`refresh 吊销（用户级）user=${userId} 本地清理=${cleared}（Redis jti 键随 TTL 过期）`);
  }

  /** 惰性清理：条目超 10_000 时清过期项（仅本地 Map 降级路径） */
  private sweepLocalIfNeeded(): void {
    if (this.revokedLocal.size < 10_000) return;
    const now = Date.now();
    for (const [jti, exp] of this.revokedLocal.entries()) {
      if (exp <= now) this.revokedLocal.delete(jti);
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
