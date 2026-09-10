/**
 * AuthModule：认证模块（register/login/refresh/logout/me，JWT access 15m + refresh 7d + bcrypt）。
 * 依赖：CommonModule（@Global：PrismaService/AuthUserLoader/JwtService）、RbacModule（角色克隆）、AuditModule（登录审计）。
 * 全局 JwtAuthGuard 由 CommonModule 以 APP_GUARD 提供，本模块无需重复装配。
 */
import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshTokenStore } from './refresh-token.store';

@Module({
  imports: [RbacModule],
  controllers: [AuthController],
  providers: [AuthService, RefreshTokenStore],
  exports: [AuthService],
})
export class AuthModule {}