/**
 * 幂等拦截器：写操作（POST/PUT/PATCH/DELETE）携带 Idempotency-Key 请求头时，24h 内重复请求直接重放首次响应
 * （§3.1 幂等约定：批量导入/前端重复提交依赖此约定）。
 * Phase 1 实现为进程内 Map（单实例有效）；生产多实例需换 Redis 实现（infra/redis 同事接入后替换，TODO 见下）。
 */
import { CallHandler, ExecutionContext, HttpStatus, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, of, tap } from 'rxjs';

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24h 去重窗口（§3.1）
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const MAX_CACHE_ENTRIES = 10_000; // 内存保护：超过后惰性清理过期项

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
  private readonly store = new Map<string, CachedResponse>();

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const key = req.headers['idempotency-key'];

    if (!key || typeof key !== 'string' || !WRITE_METHODS.has(req.method)) {
      return next.handle();
    }

    const cacheKey = `${req.method}:${req.originalUrl}:${key}`;

    // 命中缓存 → 重放首次响应（幂等，§3.1）
    const cached = this.store.get(cacheKey);
    if (cached) {
      if (cached.expiresAt > Date.now()) {
        res.status(cached.statusCode);
        for (const [name, value] of Object.entries(cached.headers)) {
          if (value !== undefined) res.setHeader(name, value);
        }
        this.logger.debug(`Idempotency-Key 命中重放: ${cacheKey}`);
        return of(cached.body);
      }
      this.store.delete(cacheKey);
    }

    return next.handle().pipe(
      tap(body => {
        const statusCode = res.statusCode;
        if (statusCode >= 200 && statusCode < 400) {
          // 仅缓存成功响应；X-Total-Count 等 controller 设置的头一并缓存
          const headers: Record<string, string | number | string[] | undefined> = {};
          for (const [name, value] of Object.entries(res.getHeaders())) {
            if (['set-cookie', 'connection', 'keep-alive'].includes(name.toLowerCase())) continue;
            headers[name] = value;
          }
          this.store.set(cacheKey, { expiresAt: Date.now() + IDEMPOTENCY_TTL_MS, statusCode, headers, body });
          this.sweepIfNeeded();
        }
      }),
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
