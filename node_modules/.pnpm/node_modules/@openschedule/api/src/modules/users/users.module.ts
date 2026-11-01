/**
 * 人员管理模块装配（users.yaml / roles.yaml 契约切片的 Nest 侧）：
 * - 薄控制器（users.controller.ts）→ UsersService（生命周期 + 审计 + 事务）→ Prisma（数据）
 * - 守卫链由全局 APP_GUARD 提供 JwtAuthGuard（Bearer），控制器级 @UseGuards 仅保留 PersonnelAuthzGuard
 *
 * R7-6 双鉴权收敛：原 cookie 会话 + CSRF + PersonnelAuthService 共享实例等机制已删除（详见
 * docs/contracts/personnel-permission-matrix.md）。AuthService/AuthModule 仅提供 Bearer 域服务，
 * 本模块不再注册第二份认证实例。
 *
 * PrismaService/AuditService/Reflector 由 @Global CommonModule 与 Nest 内核提供。
 */
import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PersonnelAuthzGuard } from '../../middleware/authz';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PersonnelMeController, UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController, PersonnelMeController],
  providers: [
    UsersService,
    // 对象级授权守卫：Reflector（Nest 内核全局）+ PrismaService（Global）
    {
      provide: PersonnelAuthzGuard,
      useFactory: (reflector: Reflector, prisma: PrismaService) => new PersonnelAuthzGuard(reflector, prisma),
      inject: [Reflector, PrismaService],
    },
  ],
  exports: [UsersService],
})
export class UsersModule {}
