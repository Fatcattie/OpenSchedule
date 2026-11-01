/**
 * 限流服务（§3.3 安全 / R4）：固定窗口计数，Redis 优先 + 进程内 Map 降级（与 IdempotencyInterceptor 同一降级语义）。
 * 多实例语义：Redis 下跨实例共享窗口；降级 Map 仅单实例有效并告警。
 * key 由调用方（RateLimitGuard）组装（ip 或 tenant+ip），本服务只负责计数与 TTL。
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/** 单键判定结果 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/** 进程内降级存储条目 */
interface LocalWindow {
  count: number;
  resetAt: number;
}

const MAX_LOCAL_ENTRIES = 10_000;

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly local = new Map<string, LocalWindow>();

  constructor(@Optional() private readonly redis?: RedisService) {}

  /**
   * 原子计数并判定。Redis 不可用时降级本进程 Map（单实例有效，降级即告警）。
   * 固定窗口语义由调用方传入 windowMs；窗口边界以首次请求时间为准（resetAt = now + windowMs）。
   */
  async check(key: string, limit: number, windowMs: number, now = Date.now()): Promise<RateLimitResult> {
    if (this.redis) {
      try {
        return await this.checkRedis(key, limit, windowMs, now);
      } catch (err) {
        this.logger.warn(`限流 Redis 不可用，降级进程内 Map（多实例不一致）: ${(err as Error).message}`);
      }
    }
    return this.checkLocal(key, limit, windowMs, now);
  }

  /** Redis 固定窗口：INCR + 首次 PEXPIRE（windowMs 毫秒） */
  private async checkRedis(key: string, limit: number, windowMs: number, now: number): Promise<RateLimitResult> {
    const client = await this.redis!.getClient();
    const redisKey = this.redis!.key(`rate:${key}`);
    const count = await client.incr(redisKey);
    if (count === 1) await client.pExpire(redisKey, windowMs);
    const ttl = await client.pTTL(redisKey);
    const resetAt = now + (ttl > 0 ? ttl : windowMs);
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAt };
  }

  /** 本地降级：固定窗口计数 + 滥用清理（单实例有效） */
  private checkLocal(key: string, limit: number, windowMs: number, now: number): RateLimitResult {
    this.sweepIfNeeded();
    const entry = this.local.get(key);
    if (!entry || entry.resetAt <= now) {
      const fresh: LocalWindow = { count: 1, resetAt: now + windowMs };
      this.local.set(key, fresh);
      return { allowed: 1 <= limit, remaining: Math.max(0, limit - 1), resetAt: fresh.resetAt };
    }
    entry.count += 1;
    return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count), resetAt: entry.resetAt };
  }

  private sweepIfNeeded(): void {
    if (this.local.size < MAX_LOCAL_ENTRIES) return;
    const now = Date.now();
    for (const [k, v] of this.local) {
      if (v.resetAt <= now) this.local.delete(k);
    }
  }
}