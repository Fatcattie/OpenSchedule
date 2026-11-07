/**
 * AuthController：认证端点（§3.5.1）。
 * register/login/refresh/logout 为 @Public()（跳过全局 JwtAuthGuard）；me 需登录（默认受保护）。
 * 响应统一信封 {data, meta}（§3.5）。
 */
import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
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
import { applyRefreshTransport, clearRefreshCookie, readRefreshCookie, wantsCookieTransport } from './refresh-cookie';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** 注册（创建账号 + 创建租户，创建者 = 租户 Admin）；登录爆破防线：5 次/分钟/IP（§3.3 限流） */
  @Public()
  @RateLimit({ limit: 5, windowMs: 60_000, keyBy: 'ip' })
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: unknown }> {
    return applyRefreshTransport(req, res, await this.authService.register(dto));
  }

  /** 登录：返回 access + refresh；登录爆破防线：5 次/分钟/IP */
  @Public()
  @RateLimit({ limit: 5, windowMs: 60_000, keyBy: 'ip' })
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: unknown }> {
    return applyRefreshTransport(req, res, await this.authService.login(dto));
  }

  /**
   * 刷新令牌（轮换式：旧 refresh 吊销，发新双 token）。
   * refresh token 来源：请求体；Web Cookie 模式（X-Auth-Transport: cookie）下回落 HttpOnly Cookie（M-5）。
   */
  @Public()
  @RateLimit({ limit: 5, windowMs: 60_000, keyBy: 'ip' })
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: unknown }> {
    const refreshToken = this.resolveRefreshToken(dto.refreshToken, req);
    try {
      return applyRefreshTransport(req, res, await this.authService.refresh({ refreshToken }));
    } catch (err) {
      if (wantsCookieTransport(req)) clearRefreshCookie(res); // 失效的 Cookie 一并清掉
      throw err;
    }
  }

  /** 注销（吊销 refresh jti） */
  @Public()
  @Post('logout')
  async logout(
    @Body() dto: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: { ok: true } }> {
    const refreshToken = this.resolveRefreshToken(dto.refreshToken, req);
    if (wantsCookieTransport(req)) clearRefreshCookie(res);
    return this.authService.logout({ refreshToken });
  }

  /** 请求体优先；仅 Cookie 模式才读 Cookie（防 CSRF：跨站无法附带自定义头） */
  private resolveRefreshToken(fromBody: string | undefined, req: Request): string {
    return fromBody || (wantsCookieTransport(req) ? readRefreshCookie(req) : undefined) || '';
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