/**
 * 当前登录用户契约（AuthGuard 挂载到 req.user 的形状；业务同事的 current-user.decorator.ts 本地副本与此形状一致，可直接兼容）。
 * 来源：JWT 载荷（userId/tenantId）+ user_roles × roles 展开（§3.4 权限矩阵）。
 */
export interface AuthUserRole {
  key: string; // 角色 key：tenant.owner/admin/member/viewer、project.owner/member/viewer...
  scope: string; // system/tenant/project/task
  scopeResourceId: string | null; // 项目级/任务级资源 id（空=租户级）
  /** 权限点数组（user_roles × roles 展开时带出；'*' = 全部）。业务同事本地 AuthUser 副本无此字段，向后兼容 */
  permissions?: string[];
}

export interface AuthUser {
  userId: string;
  tenantId: string;
  roles: AuthUserRole[];
}

/** JWT access token 载荷（type='access'；角色不塞进 token，每次请求实时加载保证权限即时生效） */
export interface AccessTokenPayload {
  sub: string; // userId
  tenantId: string;
  type: 'access';
}

/** JWT refresh token 载荷（type='refresh'；jti 用于吊销，决策见 auth/refresh-token.store.ts） */
export interface RefreshTokenPayload {
  sub: string; // userId
  tenantId: string;
  type: 'refresh';
  jti: string;
}
