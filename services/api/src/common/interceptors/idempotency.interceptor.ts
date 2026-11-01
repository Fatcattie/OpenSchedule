/**
 * 幂等拦截器：写操作（POST/PUT/PATCH/DELETE）携带 Idempotency-Key 请求头时，24h 内重复请求直接重放首次响应
 * （§3.1 幂等约定 + §3.3/R3 多实例：Redis 实现，key={prefix}idempotency:{tenant}:{user}:{method}:{url}:{key}，TTL 24h）。
 * Redis 不可用时降级进程内 Map（单实例有效，降级即告警；双实例部署必须配 REDIS_URL 才满足验收「重复提交只落一次」）。
 */
import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor, Optional } from '@nestjs/common';
import { Observable, from, of, switchMap, tap } from 'rxjs';
import { Request, Response } from 'express';
import { RedisService } from '../redis/redis.service';

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24h 去重窗口（§3.1）
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const MAX_CACHE_ENTRIES = 10_000; // 内存保护（降级路径）：超过后惰性清理过期项

interface CachedResponse {
  expiresAt: number;
  statusCode: number;
  headers: Record<string, string | number | string[] | undefined>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);
  private readonly store = new Map<string, CachedResponse>(); // 降级路径（Redis 不可用时，单实例有效）

  constructor(@Optional() private readonly redis?: RedisService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request & { user?: { userId?: string; tenantId?: string } }>();
    const res = ctx.getResponse<Response>();
    const key = req.headers['idempotency-key'];

    if (!key || typeof key !== 'string' || !WRITE_METHODS.has(req.method)) {
      return next.handle();
    }

    // 多实例安全：tenant+user+Idempotency-Key 组 key（§3.3 验收：双实例重复提交只落一次）
    const storageKey = `${req.method}:${req.originalUrl}:${key}`;
    const redisKey = [
      req.user?.tenantId ?? 'anon',
      req.user?.userId ?? 'anon',
      req.method,
      req.originalUrl,
      key,
    ].join(':');

    // 命中缓存 → 重放首次响应（幂等，§3.1）；未命中 → 执行写操作并缓存成功响应
    return from(this.readCached(storageKey, redisKey)).pipe(
      switchMap((cached) => {
        if (cached && cached.expiresAt > Date.now()) {
          res.status(cached.statusCode);
          for (const [name, value] of Object.entries(cached.headers)) {
            if (value !== undefined) res.setHeader(name, value);
          }
          this.logger.debug(`Idempotency-Key 命中重放: ${storageKey}`);
          return of(cached.body);
        }
        return next.handle().pipe(
          tap((body) => {
            const statusCode = res.statusCode;
            if (statusCode >= 200 && statusCode < 400) {
              // 仅缓存成功响应；X-Total-Count 等 controller 设置的头一并缓存
              const headers: Record<string, string | number | string[] | undefined> = {};
              for (const [name, value] of Object.entries(res.getHeaders())) {
                if (['set-cookie', 'connection', 'keep-alive'].includes(name.toLowerCase())) continue;
                headers[name] = value;
              }
              const fresh: CachedResponse = { expiresAt: Date.now() + IDEMPOTENCY_TTL_MS, statusCode, headers, body };
              this.store.set(storageKey, fresh);
              this.sweepIfNeeded();
              void this.writeCached(redisKey, fresh).catch((err) =>
                this.logger.warn(`幂等结果写入 Redis 失败（本地 Map 已兜底）: ${(err as Error).message}`),
              );
            }
          }),
        );
      }),
    );
  }

  /** 读缓存：Redis 优先（跨实例），未命中回查本地 Map（兼容双写期/降级期） */
  private async readCached(storageKey: string, redisKey: string): Promise<CachedResponse | null> {
    if (this.redis) {
      try {
        const client = await this.redis.getClient();
        const raw = await client.get(this.redis.key(`idempotency:${redisKey}`));
        if (raw) return JSON.parse(raw) as CachedResponse;
      } catch {
        // Redis 不可达 → 回退本地 Map（降级语义与 RefreshTokenStore 一致）
      }
    }
    return this.store.get(storageKey) ?? null;
  }

  /** 写缓存：Redis TTL 24h（多实例共享窗口）；本地 Map 始终同步写（降级兜底） */
  private async writeCached(redisKey: string, cached: CachedResponse): Promise<void> {
    if (!this.redis) return;
    const client = await this.redis.getClient();
    await client.set(
      this.redis.key(`idempotency:${redisKey}`),
      JSON.stringify(cached),
      { EX: IDEMPOTENCY_TTL_MS / 1000 },
    );
  }

  private sweepIfNeeded(): void {
    if (this.store.size < MAX_CACHE_ENTRIES) return;
    const now = Date.now();
    for (const [k, v] of this.store) {
      if (v.expiresAt <= now) this.store.delete(k);
    }
    this.logger.warn(`幂等缓存已达上限，已惰性清理过期项（当前 ${this.store.size} 条）`);
  }
}
