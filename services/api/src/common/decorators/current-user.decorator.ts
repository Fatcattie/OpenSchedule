/**
 * 当前用户/当前租户参数装饰器（common 层规范版本；从 req.user 取 AuthUser）。
 * 注：业务同事在各自模块内已有本地副本（形状一致），可继续使用或改 import 本文件。
 */
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthUser } from '../auth/auth-user.interface';

export type { AuthUser }; // 业务同事 import { AuthUser } from 'common/decorators/current-user.decorator' 的统一出口

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
  return req.user as AuthUser;
});

/** 当前租户 id（等价 CurrentUser().tenantId，语义更直观） */
export const CurrentTenant = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
  return (req.user as AuthUser).tenantId;
});

/** 租户 Admin/Owner 判定（roles 展开后 key 为 tenant.owner / tenant.admin） */
export function isTenantAdmin(user: AuthUser): boolean {
  return user.roles.some(r => r.scope === 'tenant' && (r.key === 'tenant.owner' || r.key === 'tenant.admin'));
}
