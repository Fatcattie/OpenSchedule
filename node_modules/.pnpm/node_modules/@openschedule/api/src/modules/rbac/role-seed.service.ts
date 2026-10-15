/**
 * 角色模板种子（启动时落库，幂等）：3 租户角色（admin/member/viewer）+ owner（租户创建者）+ 项目级模板
 * （project.member/viewer；项目负责人由 projects.owner_id 派生判定，非独立角色实体，§3.4）。
 * 模板定义见 common/constants/tenant-roles.ts。
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ROLE_TEMPLATES } from '../../common/constants/tenant-roles';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class RoleSeedService implements OnModuleInit {
  private readonly logger = new Logger(RoleSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    let created = 0;
    for (const tpl of ROLE_TEMPLATES) {
      // 系统模板 tenant_id NULL：PostgreSQL 唯一索引对 NULL 不生效，findFirst+create 保证幂等
      const exists = await this.prisma.role.findFirst({ where: { key: tpl.key, tenantId: null } });
      if (!exists) {
        await this.prisma.role.create({
          data: {
            key: tpl.key,
            name: tpl.name,
            scope: tpl.scope,
            permissions: tpl.permissions as unknown as Prisma.InputJsonValue,
          },
        });
        created++;
      }
    }
    if (created > 0) {
      this.logger.log(`角色模板种子完成：新增 ${created} 个系统级角色（tenant_id NULL）`);
    }
  }
}
