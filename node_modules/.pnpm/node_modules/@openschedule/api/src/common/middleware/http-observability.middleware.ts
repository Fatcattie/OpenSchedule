/**
 * R9 HTTP 可观测性中间件：为每个请求产出
 * 1) 结构化访问日志（JSON，含 requestId/租户/用户/耗时/状态；4xx→warn、5xx→error）；以及
 * 2) Prometheus RED 指标（请求数 / 耗时直方图 / 在途数，见 observability/metrics.ts）。
 *
 * 路由标签使用「归一化模板」而非真实路径（/workspace/tasks/:id），避免 id/数字段造成标签基数爆炸。
 * 归一化对未匹配路由（404/静态资源）同样生效，故扫描器路径不会打爆指标。
 */
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { decInFlight, incInFlight, observeHttpRequest } from '../observability/metrics';
import { obsLogger } from '../observability/pino-logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_RE = /^\d+$/;
/** 业务复合 id（如 `task-<uuid>` / `proj-uuid`）：字母前缀 + 长十六进制体 */
const OPAQUE_ID_RE = /^[a-z]{1,12}-[0-9a-f-]{16,}$/i;

/** 把真实路径中的 id/数字段归一化为 `:id`（纯函数，便于单测） */
export function normalizeRouteLabel(raw: string): string {
  const pathOnly = (raw ?? '').split('?')[0];
  const segments = pathOnly.split('/').map(seg => {
    if (!seg) return seg;
    if (UUID_RE.test(seg) || NUMERIC_RE.test(seg) || OPAQUE_ID_RE.test(seg)) return ':id';
    return seg;
  });
  const label = segments.join('/');
  return label.length > 0 ? label : '/';
}

/** JwtAuthGuard 写入的用户上下文（仅取日志所需字段） */
interface RequestUser {
  userId?: string;
  tenantId?: string;
}

@Injectable()
export class HttpObservabilityMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const start = process.hrtime.bigint();
    incInFlight();
    // finish 与 close 都会触发（正常 finish→close，客户端中断只有 close），用标志去重
    let finalized = false;

    const finalize = (): void => {
      if (finalized) return;
      finalized = true;
      decInFlight();

      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      const status = res.statusCode;
      const method = req.method;
      // req.route?.path 为路由模板（含全局前缀）；未匹配（404/静态）回落到真实路径后归一化
      const route = normalizeRouteLabel((req.route?.path as string | undefined) ?? req.path);
      const user = (req as Request & { user?: RequestUser }).user;
      const requestId = (req as Request & { id?: string }).id;

      observeHttpRequest(method, route, status, durationMs);

      const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
      obsLogger()[level](
        {
          event: 'http_request',
          method,
          route,
          // 只记路径，剔除查询串（查询串可能携带回调 token 等凭据）
          path: req.originalUrl.split('?')[0],
          status,
          durationMs: Math.round(durationMs * 100) / 100,
          requestId,
          tenantId: user?.tenantId,
          userId: user?.userId,
          ip: req.ip,
        },
        `${method} ${route} ${status} ${Math.round(durationMs)}ms`,
      );
    };

    res.on('finish', finalize);
    res.on('close', finalize);
    next();
  }
}
