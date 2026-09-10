/**
 * 当前登录用户参数装饰器（契约：AuthGuard 将用户挂载到 req.user；与 common AuthGuard 兼容，见回传文档）。
 */
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** 当前登录用户（JWT 载荷解析后的形状契约） */
export interface AuthUser {
  userId: string;
  tenantId: string;
  /** 角色声明（rbac user_roles × roles 展开；scope: system/tenant/project/task） */
  roles: { key: string; scope: string; scopeResourceId: string | null }[];
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest();
  return req.user as AuthUser;
});
