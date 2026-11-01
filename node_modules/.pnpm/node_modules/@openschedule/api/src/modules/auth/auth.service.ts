/**
 * AuthService：register/login/refresh/logout/me（§3.5.1 认证与团队（10）中的认证端点）。
 * - JWT：access 15m（JWT_ACCESS_TTL）/ refresh 7d（JWT_REFRESH_TTL），bcrypt 哈希（§3.7 安全组）；
 * - 注册流程：创建账号 → 创建租户（可选，默认 true）→ 克隆租户角色 → 赋予创建者 tenant.owner →
 *   建 MemberProfile（★D2 画像表 Phase 1 就位）→ 签发双 token；
 * - 登录/注册/刷新/注销均落审计（user.login / user.register / user.refresh / user.logout）。
 */
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { hash, compare } from 'bcryptjs';
import type { AuthUser, AccessTokenPayload, RefreshTokenPayload } from '../../common/auth/auth-user.interface';
import { AuthUserLoader } from '../../common/auth/auth-user.loader';
import { TENANT_ROLE_KEYS } from '../../common/constants/tenant-roles';
import { AuditService } from '../../common/audit/audit.service';
import { ApiException } from '../../common/exceptions/api.exception';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { AutomationService } from '../automation/automation.service';
import { RefreshTokenStore } from './refresh-token.store';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateMemberDto } from './dto/create-member.dto';
import { resolveMemberRoleKey } from './onboarding';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly rbac: RbacService,
    private readonly loader: AuthUserLoader,
    private readonly audit: AuditService,
    private readonly tokenStore: RefreshTokenStore,
    private readonly automation: AutomationService,
  ) {}

  /** 注册（§3.5.1：创建账号 + 创建租户，创建者自动成为租户 Admin） */
  async register(dto: RegisterDto): Promise<{ data: unknown }> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ApiException(40001, '该邮箱已注册', HttpStatus.CONFLICT);
    }

    const passwordHash = await hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { email, passwordHash, displayName: dto.displayName },
    });

    // Phase 1：注册即建租户（createTenant 默认 true）；邀请加入 Phase 2 TODO（teams/:id/members 邀请端点就绪后接入）
    if (!(dto.createTenant ?? true)) {
      throw new ApiException(40001, 'Phase 1 仅支持注册时创建租户（邀请加入 Phase 2）');
    }

    const tenant = await this.prisma.tenant.create({
      data: { name: dto.tenantName ?? `${dto.displayName} 的团队` },
    });
    // 克隆系统角色模板 → 租户级角色，并赋予创建者 tenant.owner（§3.4：Owner=创建者；Admin 可由 Owner 再分配）
    const roleMap = await this.rbac.ensureTenantRoles(tenant.id);
    const ownerRoleId = roleMap.get(TENANT_ROLE_KEYS.OWNER);
    if (!ownerRoleId) {
      throw new ApiException(50000, '租户角色种子失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    await this.prisma.userRole.create({
      data: { tenantId: tenant.id, userId: user.id, roleId: ownerRoleId },
    });
    // ★D2 成员画像（Phase 1 迁移必须就位；冷启动自评兜底，unlocked_at 完成任务数≥N 后置位，N ⚠️ 待确认）
    await this.prisma.memberProfile.create({
      data: { tenantId: tenant.id, userId: user.id },
    });
    // R6-3：为新租户播种内置系统自动化规则（done 自动标记 + done 通知创建者，幂等）
    await this.automation.seedTenantRules(tenant.id);

    const tokens = await this.issueTokens(user.id, tenant.id);

    // 审计（注册+首登；register 为公开路由无请求上下文，显式传 tenantId/actorId）
    await this.audit.record({ action: 'user.register', resourceType: 'user', resourceId: user.id, tenantId: tenant.id, actorId: user.id });
    await this.audit.record({ action: 'user.login', resourceType: 'user', resourceId: user.id, tenantId: tenant.id, actorId: user.id });

    return {
      data: {
        ...tokens,
        user: this.publicUser(user),
        tenant: { id: tenant.id, name: tenant.name, plan: tenant.plan },
      },
    };
  }

  /** 登录（统一 40101，防账号枚举探测） */
  async login(dto: LoginDto): Promise<{ data: unknown }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash || !(await compare(dto.password, user.passwordHash))) {
      throw new ApiException(40101, '邮箱或密码错误', HttpStatus.UNAUTHORIZED);
    }
    if (user.status !== 'active') {
      throw new ApiException(40301, '账号已被禁用', HttpStatus.FORBIDDEN);
    }

    // 主租户 = 最早加入的租户（Phase 1 单租户语义；多租户切换 Phase 2 TODO）
    const primary = await this.prisma.userRole.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
      select: { tenantId: true },
    });
    if (!primary) {
      throw new ApiException(40301, '用户未加入任何租户', HttpStatus.FORBIDDEN);
    }

    const tokens = await this.issueTokens(user.id, primary.tenantId);
    await this.audit.record({ action: 'user.login', resourceType: 'user', resourceId: user.id, tenantId: primary.tenantId, actorId: user.id });

    return {
      data: {
        ...tokens,
        user: this.publicUser(user),
        tenantId: primary.tenantId,
        // R6-1（D-05 B）：管理员代建账号首次登录标记，客户端据此强制改密流程
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  /** 刷新（§3.1：40101=access 过期，客户端用 refresh 换新；轮换式：旧 refresh 即刻吊销） */
  async refresh(dto: RefreshDto): Promise<{ data: unknown }> {
    const payload = await this.verifyRefresh(dto.refreshToken);

    // 轮换：吊销旧 jti，签发新双 token（防重放）
    await this.tokenStore.revoke(payload.jti);
    const tokens = await this.issueTokens(payload.sub, payload.tenantId);
    await this.audit.record({ action: 'user.refresh', resourceType: 'user', resourceId: payload.sub, tenantId: payload.tenantId, actorId: payload.sub });

    return { data: tokens };
  }

  /** 注销：吊销 refresh jti（幂等：token 已失效/已吊销也返回成功） */
  async logout(dto: LogoutDto): Promise<{ data: { ok: true } }> {
    try {
      const payload = await this.verifyRefresh(dto.refreshToken);
      await this.tokenStore.revoke(payload.jti);
      await this.audit.record({ action: 'user.logout', resourceType: 'user', resourceId: payload.sub, tenantId: payload.tenantId, actorId: payload.sub });
    } catch {
      // 已过期/已吊销的 refresh 无需再吊销（幂等注销）
    }
    return { data: { ok: true } };
  }

  /** 当前用户 + 所属租户/角色（§3.5.1：GET /auth/me；AuthUser 由全局守卫实时加载） */
  async me(user: AuthUser): Promise<{ data: unknown }> {
    const userRow = await this.prisma.user.findUnique({ where: { id: user.userId } });
    const tenant = await this.prisma.tenant.findUnique({ where: { id: user.tenantId } });
    return {
      data: {
        user: userRow ? this.publicUser(userRow) : null,
        tenant: tenant ? { id: tenant.id, name: tenant.name, plan: tenant.plan, status: tenant.status } : null,
        roles: user.roles,
      },
    };
  }

  /**
   * 管理员代建成员（R6-1 / D-05 B：管理员代建账号 + 首次登录改密）。
   * - 仅租户 Admin/Owner 可调用（40301）；
   * - 目标租户 = 操作者租户；创建 User（临时密码 + mustChangePassword=true）、MemberProfile、UserRole（默认 member）；
   * - 不触发 owner 代建（owner = 租户创建者，§3.4 派生语义）。
   */
  async adminCreateMember(actor: AuthUser, dto: CreateMemberDto): Promise<{ data: unknown }> {
    if (!this.rbac.isTenantAdmin(actor)) {
      throw new ApiException(40301, '仅租户管理员可代建成员', HttpStatus.FORBIDDEN);
    }
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ApiException(40001, '该邮箱已注册', HttpStatus.CONFLICT);
    }

    const roleKey = resolveMemberRoleKey(dto.role);
    const passwordHash = await hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { email, passwordHash, displayName: dto.displayName, mustChangePassword: true },
    });
    await this.prisma.memberProfile.create({
      data: { tenantId: actor.tenantId, userId: user.id },
    });
    const roleMap = await this.rbac.ensureTenantRoles(actor.tenantId);
    const roleId = roleMap.get(roleKey);
    if (!roleId) {
      throw new ApiException(50000, `租户角色种子缺失：${roleKey}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    await this.prisma.userRole.create({
      data: { tenantId: actor.tenantId, userId: user.id, roleId },
    });

    await this.audit.record({
      action: 'member.create',
      resourceType: 'user',
      resourceId: user.id,
      tenantId: actor.tenantId,
      actorId: actor.userId,
      after: { email: user.email, role: roleKey },
    });

    return { data: { ...this.publicUser(user), role: roleKey } };
  }

  /** 首次登录强制改密 / 常规改密（R6-1）：校验当前密码 → 写新密 → 清除 must_change_password */
  async changePassword(user: AuthUser, dto: ChangePasswordDto): Promise<{ data: { ok: true } }> {
    const row = await this.prisma.user.findUnique({ where: { id: user.userId } });
    if (!row || !row.passwordHash || !(await compare(dto.currentPassword, row.passwordHash))) {
      throw new ApiException(40101, '当前密码错误', HttpStatus.UNAUTHORIZED);
    }
    const passwordHash = await hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.userId },
      data: { passwordHash, mustChangePassword: false },
    });
    await this.audit.record({
      action: 'user.password_change',
      resourceType: 'user',
      resourceId: user.userId,
      tenantId: user.tenantId,
      actorId: user.userId,
    });
    return { data: { ok: true } };
  }

  // ------------------------------------------------------------------
  // 私有工具
  // ------------------------------------------------------------------

  /** 签发 access + refresh 双 token（access 15m / refresh 7d，§3.7） */
  private async issueTokens(userId: string, tenantId: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: string }> {
    const accessSecret = this.config.get<string>('JWT_ACCESS_SECRET');
    const refreshSecret = this.config.get<string>('JWT_REFRESH_SECRET');
    if (!accessSecret || !refreshSecret) {
      throw new ApiException(50000, 'JWT 密钥未配置（JWT_ACCESS_SECRET / JWT_REFRESH_SECRET）', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    const accessTtl = (this.config.get<string>('JWT_ACCESS_TTL') ?? '15m') as `${number}${'s' | 'm' | 'h' | 'd' | 'w' | 'y'}`;
    const refreshTtl = (this.config.get<string>('JWT_REFRESH_TTL') ?? '7d') as `${number}${'s' | 'm' | 'h' | 'd' | 'w' | 'y'}`;

    const accessPayload: AccessTokenPayload = { sub: userId, tenantId, type: 'access' };
    const refreshPayload: RefreshTokenPayload = { sub: userId, tenantId, type: 'refresh', jti: randomUUID() };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, { secret: accessSecret, expiresIn: accessTtl }),
      this.jwt.signAsync(refreshPayload, { secret: refreshSecret, expiresIn: refreshTtl }),
    ]);
    return { accessToken, refreshToken, expiresIn: accessTtl };
  }

  /** 校验 refresh token（格式 + 签名 + 吊销状态），失败统一 40101 */
  private async verifyRefresh(token: string): Promise<RefreshTokenPayload> {
    const secret = this.config.get<string>('JWT_REFRESH_SECRET');
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(token, { secret });
    } catch {
      throw new ApiException(40101, 'refresh token 无效或已过期', HttpStatus.UNAUTHORIZED);
    }
    if (payload.type !== 'refresh' || !payload.sub || !payload.jti) {
      throw new ApiException(40101, 'refresh token 格式错误', HttpStatus.UNAUTHORIZED);
    }
    if (await this.tokenStore.isRevoked(payload.jti)) {
      throw new ApiException(40101, 'refresh token 已吊销，请重新登录', HttpStatus.UNAUTHORIZED);
    }
    return payload;
  }

  /** 用户公开视图（不含 passwordHash） */
  private publicUser(user: { id: string; email: string; displayName: string; avatarUrl: string | null; locale: string; timezone: string }): Record<string, unknown> {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      locale: user.locale,
      timezone: user.timezone,
    };
  }
}