/**
 * RbacModule：权限模块（§3.4 权限矩阵）。
 * - RoleSeedService：启动时种子系统级角色模板（tenant_id NULL；定义见 common/constants/tenant-roles.ts）；
 * - RbacService：租户角色克隆（ensureTenantRoles）+ 权限点判定（can/assertCan）+ 项目负责人派生判定（isProjectOwner）。
 * 依赖 PrismaService（CommonModule @Global 提供）。
 */
import { Module } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { RoleSeedService } from './role-seed.service';

@Module({
  providers: [RoleSeedService, RbacService],
  exports: [RoleSeedService, RbacService],
})
export class RbacModule {}