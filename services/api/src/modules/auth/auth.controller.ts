/**
 * AuthController：认证端点（§3.5.1）。
 * register/login/refresh/logout 为 @Public()（跳过全局 JwtAuthGuard）；me 需登录（默认受保护）。
 * 响应统一信封 {data, meta}（§3.5）。
 */
import { Body, Controller, Get, Post } from '@nestjs/common';
import { Public } from '../../common/auth/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import type { AuthUser } from '../../common/auth/auth-user.interface';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateMemberDto } from './dto/create-member.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** 注册（创建账号 + 创建租户，创建者 = 租户 Admin）；登录爆破防线：5 次/分钟/IP（§3.3 限流） */
  @Public()
  @RateLimit({ limit: 5, windowMs: 60_000, keyBy: 'ip' })
  @Post('register')
  register(@Body() dto: RegisterDto): Promise<{ data: unknown }> {
    return this.authService.register(dto);
  }

  /** 登录：返回 access + refresh；登录爆破防线：5 次/分钟/IP */
  @Public()
  @RateLimit({ limit: 5, windowMs: 60_000, keyBy: 'ip' })
  @Post('login')
  login(@Body() dto: LoginDto): Promise<{ data: unknown }> {
    return this.authService.login(dto);
  }

  /** 刷新令牌（轮换式：旧 refresh 吊销，发新双 token） */
  @Public()
  @RateLimit({ limit: 5, windowMs: 60_000, keyBy: 'ip' })
  @Post('refresh')
  refresh(@Body() dto: RefreshDto): Promise<{ data: unknown }> {
    return this.authService.refresh(dto);
  }

  /** 注销（吊销 refresh jti） */
  @Public()
  @Post('logout')
  logout(@Body() dto: LogoutDto): Promise<{ data: { ok: true } }> {
    return this.authService.logout(dto);
  }

  /** 当前用户 + 所属租户/角色 */
  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<{ data: unknown }> {
    return this.authService.me(user);
  }

  /** 管理员代建成员（R6-1 / D-05 B）：创建账号（临时密码）+ 首次登录强制改密；需租户 Admin/Owner */
  @Post('members')
  adminCreateMember(@CurrentUser() user: AuthUser, @Body() dto: CreateMemberDto): Promise<{ data: unknown }> {
    return this.authService.adminCreateMember(user, dto);
  }

  /** 改密（首次登录强制改密 / 常规改密）：校验当前密码 → 写新密 → 清除强制改密标记 */
  @Post('change-password')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto): Promise<{ data: { ok: true } }> {
    return this.authService.changePassword(user, dto);
  }
}