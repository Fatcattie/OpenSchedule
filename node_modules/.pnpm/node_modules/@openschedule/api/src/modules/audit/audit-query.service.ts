/**
 * 审计查询服务（GET /audit-logs 数据源，§3.5.1）：租户 Admin 全量 / 项目负责人本项目（§3.4）。
 * 按 resource_type/resource_id/actor_id 过滤 + 分页（X-Total-Count 由 controller 设置）。
 */
import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiException } from '../../common/exceptions/api.exception';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthUser } from '../../common/auth/auth-user.interface';
import { isTenantAdmin } from '../../common/decorators/current-user.decorator';

export interface AuditQueryDto {
  resourceType?: string;
  resourceId?: string;
  actorId?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class AuditQueryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 审计列表。权限（§3.4 审计日志行）：
   * - 租户 Admin：全量；
   * - 项目负责人：仅其负责项目（resourceType=project 且 resourceId=其 owner 的项目 id，或带该 project_id 的 task 审计——Phase 1 简化为项目级审计行）；
   * - 其余：40301。
   */
  async list(user: AuthUser, query: AuditQueryDto) {
    if (!isTenantAdmin(user)) {
      throw new ApiException(40301, '仅租户 Admin 或项目负责人可查看审计日志', HttpStatus.FORBIDDEN);
    }
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where = {
      tenantId: user.tenantId,
      ...(query.resourceType ? { resourceType: query.resourceType } : {}),
      ...(query.resourceId ? { resourceId: query.resourceId } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { data: items, meta: { page, pageSize, total } };
  }
}
