/**
 * 租户过滤中间件：为每个请求打开 AsyncLocalStorage 上下文（工程决策 1），
 * JwtAuthGuard 校验成功后经 TenantContextService.attach 写入 tenantId，Prisma 扩展据此自动注入租户谓词。
 * 公共路由（无 token）也会打开空 store → 不注入租户谓词（如 /auth/login）。
 */
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { TenantContextService } from '../tenant/tenant-context.service';

@Injectable()
export class TenantFilterMiddleware implements NestMiddleware {
  constructor(private readonly tenantContext: TenantContextService) {}

  use(_req: Request, _res: Response, next: NextFunction): void {
    this.tenantContext.runWithRequest(next);
  }
}
