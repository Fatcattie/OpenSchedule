/**
 * 全局 JWT 认证守卫（APP_GUARD）：解析 Bearer access token → AuthUserLoader 加载角色 →
 * 挂载 req.user 并绑定租户上下文（Prisma 租户过滤自此生效）。@Public() 路由跳过。
 */
import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ApiException } from '../exceptions/api.exception';
import { AuthUserLoader } from './auth-user.loader';
import { AccessTokenPayload, AuthUser } from './auth-user.interface';
import { PUBLIC_KEY } from './public.decorator';
import { TenantContextService } from '../tenant/tenant-context.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly loader: AuthUserLoader,
    private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = this.extractBearer(req);
    if (!token) {
      throw new ApiException(40101, '缺少访问令牌（Authorization: Bearer <jwt>）', HttpStatus.UNAUTHORIZED);
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      // 40101=access 过期/无效，客户端用 refresh token 换新（§3.1 错误码表）
      throw new ApiException(40101, '访问令牌无效或已过期', HttpStatus.UNAUTHORIZED);
    }
    if (payload.type !== 'access' || !payload.sub || !payload.tenantId) {
      throw new ApiException(40101, '访问令牌格式错误', HttpStatus.UNAUTHORIZED);
    }

    // 实时加载用户 + 角色声明（含用户/租户状态校验）
    const user = await this.loader.load(payload.sub, payload.tenantId);
    req.user = user;
    // 绑定租户上下文：后续 Prisma 查询自动注入 tenant_id（工程决策 1）
    this.tenantContext.attach(user.tenantId, user.userId);
    return true;
  }

  private extractBearer(req: Request): string | null {
    const header = req.headers.authorization;
    if (!header) return null;
    const [scheme, token] = header.split(' ');
    return scheme === 'Bearer' && token ? token : null;
  }
}
