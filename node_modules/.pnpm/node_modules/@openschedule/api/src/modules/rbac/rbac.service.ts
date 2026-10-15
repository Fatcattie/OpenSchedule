/**
 * RbacService：租户角色克隆 + 权限检查（§3.4 权限矩阵）。
 * - ensureTenantRoles：租户创建时把系统级模板（tenant.owner/admin/member/viewer）克隆为租户级角色（幂等）；
 * - can(user, permission, resourceScopeId)：权限点判定（'*' 通配；project/task 级角色按 scopeResourceId 匹配，Phase 2 启用）；
 * - isProjectOwner：项目负责人 = projects.owner_id 派生（非独立角色实体）；
 * 系统模板定义与启动种子见 common/constants/tenant-roles.ts + RoleSeedService（本模块）。
 */
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ROLE_TEMPLATES } from '../../common/constants/tenant-roles';
import type { AuthUser } from '../../common/auth/auth-user.interface';
import { ApiException } from '../../common/exceptions/api.exception';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 租户创建时克隆系统模板 → 租户级角色（幂等；只克隆 tenant 级模板，project.* 模板 Phase 2 项目成员管理时按项目克隆）。
   * 返回角色映射 { roleKey: roleId }（AuthService 注册流程赋值用）。
   */
  async ensureTenantRoles(tenantId: string): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    for (const tpl of ROLE_TEMPLATES.filter(t => t.scope === 'tenant')) {
      const existing = await this.prisma.role.findFirst({
        where: { tenantId, key: tpl.key },
      });
      if (existing) {
        result.set(tpl.key, existing.id);
        continue;
      }
      const created = await this.prisma.role.create({
        data: {
          tenantId,
          key: tpl.key,
          name: tpl.name,
          scope: tpl.scope,
          permissions: tpl.permissions as unknown as Prisma.InputJsonValue,
        },
      });
      result.set(tpl.key, created.id);
    }
    return result;
  }

  /**
   * 权限点判定（§3.4）：遍历用户角色声明，任一命中即放行。
   * - scope=tenant/system 角色：permissions 含权限点或 '*' 即通过；
   * - scope=project/task 角色：仅当 role.scopeResourceId === resourceScopeId 时才参与判定（Phase 2 项目成员管理落地后启用）。
   */
  can(user: AuthUser, permission: string, resourceScopeId?: string | null): boolean {
    if (!user || !Array.isArray(user.roles)) return false;
    return user.roles.some(role => {
      if (role.scope === 'project' || role.scope === 'task') {
        // 项目/任务级角色按资源 id 限定生效
        if (!resourceScopeId || role.scopeResourceId !== resourceScopeId) return false;
      }
      const perms = role.permissions;
      if (!perms) return false;
      return perms.includes('*') || perms.includes(permission);
    });
  }

  /** 任一权限点命中即通过（多个候选动作场景） */
  canAny(user: AuthUser, permissions: string[], resourceScopeId?: string | null): boolean {
    return permissions.some(p => this.can(user, p, resourceScopeId));
  }

  /** 权限断言：不通过抛 40301（§3.1 错误码表：跨租户/跨项目默认 40301） */
  assertCan(user: AuthUser, permission: string, resourceScopeId?: string | null): void {
    if (!this.can(user, permission, resourceScopeId)) {
      throw ApiException.forbidden(`无权执行操作：${permission}`);
    }
  }

  /** 是否租户 Admin/Owner（roles 展开后 key 为 tenant.owner / tenant.admin） */
  isTenantAdmin(user: AuthUser): boolean {
    return user.roles.some(r => r.scope === 'tenant' && (r.key === 'tenant.owner' || r.key === 'tenant.admin'));
  }

  /**
   * 项目负责人判定（§3.4：= projects.owner_id 派生，非独立角色实体）。
   * tenant_id 谓词由 Prisma 租户扩展自动注入（漏租户即空结果，铁律）。
   */
  async isProjectOwner(userId: string, projectId: string): Promise<boolean> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ownerId: userId },
      select: { id: true },
    });
    return project !== null;
  }
}