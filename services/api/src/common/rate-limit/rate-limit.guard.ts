/**
 * 限流守卫（§3.3 / R4）：全局默认档 + @RateLimit 覆盖。
 * - @Public 路由（登录/注册/刷新）用 keyBy='ip'（未认证无 tenant）。
 * - 已认证路由默认 tenant_ip 分档（req.user 由先于本守卫的 JwtAuthGuard 挂载）。
 * 超限抛 ApiException.rateLimited()（42901）。守卫须在 JwtAuthGuard 之后注册（见 common.module providers 顺序）。
 */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ApiException } from '../exceptions/api.exception';
import { RateLimitService } from './rate-limit.service';
import { RATE_LIMIT_KEY, RATE_LIMIT_DEFAULT, type RateLimitOptions } from './rate-limit.decorator';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimit: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? RATE_LIMIT_DEFAULT;
    const req = context.switchToHttp().getRequest<Request & { user?: { tenantId?: string; userId?: string } }>();
    const ip = this.resolveIp(req);
    const keyBy = options.keyBy ?? 'tenant_ip';
    const tenant = req.user?.tenantId ?? 'anon';
    const identity = keyBy === 'ip' ? 'anon' : `${tenant}:${req.user?.userId ?? 'anon'}`;
    const key = `${req.method}:${req.originalUrl}:${identity}:${ip}`;
    const result = await this.rateLimit.check(key, options.limit, options.windowMs);
    if (!result.allowed) {
      throw ApiException.rateLimited();
    }
    return true;
  }

  /** 客户端 IP：优先 X-Forwarded-For（反向代理），回退 socket 地址 */
  private resolveIp(req: Request): string {
    const xf = req.headers['x-forwarded-for'];
    if (Array.isArray(xf)) return xf[0]?.trim() || 'unknown';
    if (typeof xf === 'string') return xf.split(',')[0]?.trim() || 'unknown';
    return req.ip || 'unknown';
  }
}