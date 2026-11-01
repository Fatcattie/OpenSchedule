/**
 * 限流装饰器（§3.3 / R4）：@RateLimit({ limit, windowMs, keyBy }) 覆盖全局默认档。
 * keyBy='ip' 用于登录/注册/刷新（未认证无 tenant），'tenant_ip' 用于普通接口。
 */
import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitOptions {
  /** 窗口内最大请求数 */
  limit: number;
  /** 固定窗口毫秒数 */
  windowMs: number;
  /** key 组成：ip（默认）或 tenant_ip（已认证接口按租户+IP 分档） */
  keyBy?: 'ip' | 'tenant_ip';
}

export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);

/** 全局限流默认档（普通接口按 tenant+IP；未认证按 IP） */
export const RATE_LIMIT_DEFAULT: RateLimitOptions = { limit: 300, windowMs: 60_000, keyBy: 'tenant_ip' };