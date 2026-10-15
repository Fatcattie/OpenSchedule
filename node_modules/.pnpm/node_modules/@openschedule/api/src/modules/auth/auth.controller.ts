/**
 * AuthController：认证端点（§3.5.1）。
 * register/login/refresh/logout 为 @Public()（跳过全局 JwtAuthGuard）；me 需登录（默认受保护）。
 * 响应统一信封 {data, meta}（§3.5）。
 */
import { Body, Controller, Get, Post } from '@nestjs/common';
import { Public } from '../../common/auth/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/auth/auth-user.interface';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** 注册（创建账号 + 创建租户，创建者 = 租户 Admin） */
  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto): Promise<{ data: unknown }> {
    return this.authService.register(dto);
  }

  /** 登录：返回 access + refresh */
  @Public()
  @Post('login')
  login(@Body() dto: LoginDto): Promise<{ data: unknown }> {
    return this.authService.login(dto);
  }

  /** 刷新令牌（轮换式：旧 refresh 吊销，发新双 token） */
  @Public()
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
}