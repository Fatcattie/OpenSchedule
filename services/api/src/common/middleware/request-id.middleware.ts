/**
 * 请求溯源中间件：生成 requestId（响应头 X-Request-Id），并把 requestId/ip/userAgent 写入租户上下文
 * 供 AuditService 落审计溯源字段（§3.2 域 10：audit_logs 含 ip/user_agent/request_id）。
 */
import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { TenantContextService } from '../tenant/tenant-context.service';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  constructor(private readonly tenantContext: TenantContextService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const typedReq = req as Request & { id?: string };
    const requestId = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
    typedReq.id = requestId;
    res.setHeader('X-Request-Id', requestId);
    this.tenantContext.setRequestInfo({
      requestId,
      ip: req.ip,
      userAgent: req.headers['user-agent']?.slice(0, 500),
    });
    next();
  }
}
