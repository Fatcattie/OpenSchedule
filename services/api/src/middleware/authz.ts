/**
 * 人员管理授权策略 + 服务端强制守卫（contract slice B permissions-matrix.yaml 的服务端落点）。
 *
 * R7-6 双鉴权收敛：人员域鉴权已统一到全局 JwtAuthGuard，本文件不再读 cookie session，
 * 仅依赖 NestJS `req.user: AuthUser`（由 `common/auth/auth-user.interface.ts` 实时加载）。
 * CSRF/X-CSRF-Token 防护随 cookie session 一并删除 —— Bearer token 不会被浏览器自动附加，
 * 同源策略天然阻断 CSRF（参考 OWASP Cheat Sheet § Session Management）。
 *
 * 固化边界（防横向越权）：admin 仅能管理 member；super_admin 可管理 admin 与 member；
 * 其余默认拒绝。不变量：最后一名活跃 super_admin 不可被禁用/删除/降权；
 * 隐藏路由/菜单/按钮不构成授权。
 */
import { CanActivate, ExecutionContext, HttpStatus, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ApiException } from '../common/exceptions/api.exception';
import { PrismaService } from '../common/prisma/prisma.service';
import type { AuthUser, AuthUserRole } from '../common/auth/auth-user.interface';

export type PersonnelRole = 'super_admin' | 'admin' | 'member';
export type PersonnelAction = 'list' | 'read' | 'create' | 'update' | 'set_status' | 'delete' | 'assign_role';

const PERSONNEL_ACTIONS: readonly PersonnelAction[] = ['list', 'read', 'create', 'update', 'set_status', 'delete', 'assign_role'];

/**
 * 最后一名活跃 super_admin 保护 —— 矩阵本身对 super_admin 目标的 set_status/delete/assign_role
 * 默认拒绝（403），此处 40903 是兜底：若未来矩阵放行超管对超管，countActiveSuperAdmins===0 触发拒绝。
 * 码值与 production-progress.md / PersonnelPage 文案一致。
 */
const LAST_SUPER_ADMIN_CONFLICT = 40903;

// 与 x-permission-matrix（permissions-matrix.yaml，矩阵 v1.0）逐格一致：
// super_admin → admin/member 全动作允许；admin → member 除 assign_role 外允许
// （锁定边界决策：admin 不可管理 admin，assign_role 为 super_admin 独占）；
// 其余组合默认拒绝（不落表即拒绝，FR-001/FR-002）。
const GRANTS: ReadonlySet<string> = new Set(
  PERSONNEL_ACTIONS.flatMap((action) => {
    const grants = [`${action}:super_admin:admin`, `${action}:super_admin:member`];
    if (action !== 'assign_role') grants.push(`${action}:admin:member`);
    return grants;
  }),
);

/** 纯策略判定：(动作, 操作者角色, 目标角色) → 是否放行（默认拒绝）。 */
export function canPersonnel(action: PersonnelAction, actor: PersonnelRole, target: PersonnelRole): boolean {
  return GRANTS.has(`${action}:${actor}:${target}`);
}

/** 操作者可管理的目标角色集合（create 的可选角色与列表可见范围同源）。 */
export function manageableRoles(actor: PersonnelRole): readonly PersonnelRole[] {
  if (actor === 'super_admin') return ['admin', 'member'];
  if (actor === 'admin') return ['member'];
  return [];
}

const TENANT_KEY_OWNER = 'tenant.owner';
const TENANT_KEY_ADMIN = 'tenant.admin';

/** 租户角色声明 → 固定三角色（取最高等级；非租户级角色不参与人员管理授权）。 */
export function toPersonnelRole(roles: readonly AuthUserRole[]): PersonnelRole {
  let rank = 0;
  let result: PersonnelRole = 'member';
  for (const role of roles) {
    if (role.scope !== 'tenant') continue;
    if (role.key === TENANT_KEY_OWNER) {
      result = 'super_admin';
      rank = 3;
    } else if (role.key === TENANT_KEY_ADMIN && rank < 2) {
      result = 'admin';
      rank = 2;
    }
  }
  return result;
}

/** 从持久化 user_roles × roles 实时解析角色（权限变更即刻生效，不读 token 声明）。 */
export async function resolvePersonnelRole(prisma: PrismaService, userId: string, tenantId: string): Promise<PersonnelRole> {
  const rows = await prisma.userRole.findMany({
    where: { userId, tenantId, scopeResourceId: null },
    include: { role: true },
  });
  return toPersonnelRole(
    rows.map((r) => ({ key: r.role.key, scope: r.role.scope, scopeResourceId: r.scopeResourceId })),
  );
}

export interface PersonnelAuthzMetadata {
  action: PersonnelAction;
  /** 对象级动作的路径参数名（默认 userId）。 */
  targetParam?: string;
}

const PERSONNEL_AUTHZ_KEY = 'personnelAuthz';

/** 在控制器处理器上声明人员管理动作；Guard 据此执行对象级授权。 */
export const RequirePersonnelAction = (meta: PersonnelAuthzMetadata) => SetMetadata(PERSONNEL_AUTHZ_KEY, meta);

@Injectable()
export class PersonnelAuthzGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<PersonnelAuthzMetadata>(PERSONNEL_AUTHZ_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!meta) return true;

    // R7-6：仅依赖全局 JwtAuthGuard 注入的 req.user；不再读 cookie session/personnelSession。
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    if (!user?.userId || !user?.tenantId || !user.roles) {
      throw ApiException.unauthorized();
    }
    const actor = toPersonnelRole(user.roles);
    const actorUserId = user.userId;
    const actorTenantId = user.tenantId;

    // 集合动作：仅看操作者角色，不触碰目标。
    if (meta.action === 'list') {
      if (actor === 'member') throw ApiException.forbidden('无权访问人员管理');
      return true;
    }
    if (meta.action === 'create') {
      const bodyRole = (req.body as { role?: unknown } | undefined)?.role;
      const allowed = manageableRoles(actor) as readonly string[];
      if (typeof bodyRole !== 'string' || !allowed.includes(bodyRole)) {
        throw ApiException.forbidden('无权创建该角色用户');
      }
      return true;
    }

    // 对象动作：加载目标快照，矩阵判定；拒绝时统一 403，不泄露目标角色或存在性。
    const paramName = meta.targetParam ?? 'userId';
    const targetId = (req.params as Record<string, unknown>)[paramName];
    if (typeof targetId !== 'string' || targetId.length === 0 || targetId.length > 128) {
      throw ApiException.badRequest('目标用户 id 缺失或非法');
    }
    const targetRole = await this.resolveTargetRole(targetId, actorTenantId);
    if (!canPersonnel(meta.action, actor, targetRole)) {
      throw ApiException.forbidden('无权对该目标执行此操作');
    }

    // 最后超级管理员保护（set_status / delete / assign_role 作用于 super_admin 目标时）。
    if (
      targetRole === 'super_admin' &&
      (meta.action === 'set_status' || meta.action === 'delete' || meta.action === 'assign_role')
    ) {
      if (targetId === actorUserId) {
        throw new ApiException(LAST_SUPER_ADMIN_CONFLICT, '不能对自己的超级管理员账号执行该操作', HttpStatus.CONFLICT);
      }
      const remaining = await this.countActiveSuperAdmins(actorTenantId, targetId);
      if (remaining === 0) {
        throw new ApiException(LAST_SUPER_ADMIN_CONFLICT, '系统至少保留一名活跃超级管理员', HttpStatus.CONFLICT);
      }
    }
    return true;
  }

  private async resolveTargetRole(targetId: string, tenantId: string): Promise<PersonnelRole> {
    // R4 租户隔离：目标必须属于操作者租户（member_profile 或该租户下任一 user_role 存在），
    // 否则跨租户一律 40401 防存在性探测。系统级 User 表无 tenant 谓词，若仅 findUnique 会把跨租户
    // 用户解析为 member，导致 admin(A) 可写仅属于 tenant B 的用户（IDOR）。
    const exists = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!exists) throw ApiException.notFound('目标用户不存在或不可见');
    const membership = await this.prisma.userRole.findFirst({
      where: { userId: targetId, tenantId },
      select: { id: true },
    });
    if (!membership) throw ApiException.notFound('目标用户不存在或不可见'); // 跨租户 → 统一 40401
    return resolvePersonnelRole(this.prisma, targetId, tenantId);
  }

  /** 排除指定用户后，租户内仍活跃的超级管理员数量。 */
  private async countActiveSuperAdmins(tenantId: string, excludeUserId: string): Promise<number> {
    const rows = await this.prisma.userRole.findMany({
      where: { tenantId, scopeResourceId: null, role: { key: TENANT_KEY_OWNER } },
      select: { userId: true },
    });
    const candidates = rows.map((r) => r.userId).filter((id) => id !== excludeUserId);
    if (candidates.length === 0) return 0;
    return this.prisma.user.count({ where: { id: { in: candidates }, status: 'active' } });
  }
}
