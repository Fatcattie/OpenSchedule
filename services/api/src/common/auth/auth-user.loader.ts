/**
 * AuthUserLoader：按 userId(+tenantId) 实时加载用户与角色声明（user_roles × roles 展开），
 * 供 JwtAuthGuard 与 /auth/me 共用；校验用户/租户状态（disabled/suspended 一律拒绝）。
 */
import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiException } from '../exceptions/api.exception';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from './auth-user.interface';

@Injectable()
export class AuthUserLoader {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 加载 AuthUser。tenantId 缺省时取该用户最早加入的租户（多租户切换 Phase 2 TODO）。
   */
  async load(userId: string, tenantId?: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ApiException(40101, '用户不存在', HttpStatus.UNAUTHORIZED);
    }
    if (user.status !== 'active') {
      throw new ApiException(40301, '账号已被禁用', HttpStatus.FORBIDDEN);
    }

    const tid = tenantId ?? (await this.getPrimaryTenantId(userId));
    if (!tid) {
      throw new ApiException(40301, '用户未加入任何租户', HttpStatus.FORBIDDEN);
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tid } });
    if (!tenant || tenant.status !== 'active') {
      throw new ApiException(40301, '租户不存在或已停用', HttpStatus.FORBIDDEN);
    }

    // user_roles × roles 展开（角色声明实时加载：权限变更即刻生效，无需等 token 过期）
    const rows = await this.prisma.userRole.findMany({
      where: { userId, tenantId: tid },
      include: { role: true },
    });

    return {
      userId,
      tenantId: tid,
      roles: rows.map(r => ({
        key: r.role.key,
        scope: r.role.scope,
        scopeResourceId: r.scopeResourceId,
        // roles.permissions 为 Json 列：展开为 string[] 供 RbacService.can 判定（'*' 通配）
        permissions: (r.role.permissions as unknown as string[] | undefined) ?? [],
      })),
    };
  }

  /** 主租户 = 最早加入的租户（Phase 1 单租户语义；多租户切换 Phase 2） */
  private async getPrimaryTenantId(userId: string): Promise<string | null> {
    const row = await this.prisma.userRole.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { tenantId: true },
    });
    return row?.tenantId ?? null;
  }
}
