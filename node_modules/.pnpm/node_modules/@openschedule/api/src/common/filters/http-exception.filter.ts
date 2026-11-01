/**
 * 全局异常过滤器：统一错误信封 {code, message, details, traceId, requestId}（§3.1）。
 * 兼容两种抛出方式：① ApiException / Nest 内置异常携带 {code,message,details} 对象响应体（业务同事现有写法）；
 * ② 未显式带 code 的异常 → 按 HTTP 状态码推导分段码（400→40001 ... 409→40901、429→42901、502/503 原样）。
 * R9：5xx 额外上报 Sentry（SENTRY_DSN 未配置时 no-op），只带 requestId/traceId/路由标签，不带请求体/请求头。
 */
import { randomUUID } from 'node:crypto';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Response } from 'express';
import { API_ERROR_CODES, deriveCodeFromStatus } from '../constants/error-codes';
import { captureException } from '../observability/sentry';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<{
      id?: string;
      method?: string;
      route?: { path?: string };
      headers: Record<string, string | string[] | undefined>;
    }>();

    const requestId = req.id ?? randomUUID();
    const traceId = (typeof req.headers['x-trace-id'] === 'string' ? req.headers['x-trace-id'] : undefined) ?? randomUUID();

    let status = 500;
    let code: number = API_ERROR_CODES.INTERNAL;
    let message = '内部服务器错误';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let details: any = [];

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        // 业务代码显式携带 code（如 {code: 40902, message, details}）→ 原样透传
        if (typeof b.code === 'number') {
          code = b.code;
        } else {
          code = deriveCodeFromStatus(status);
        }
        message =
          typeof b.message === 'string'
            ? b.message
            : Array.isArray(b.message)
              ? b.message.join('; ')
              : status >= 500
                ? '内部服务器错误'
                : `请求失败（HTTP ${status}）`;
        details = b.details ?? (Array.isArray(b.message) ? b.message : []);
      } else if (typeof body === 'string') {
        message = body;
        code = deriveCodeFromStatus(status);
      }
      if (status >= 500) {
        this.logger.error(`[${requestId}] ${message}\n${exception.stack ?? String(exception)}`);
        captureException(exception, {
          requestId,
          traceId,
          status,
          method: req.method,
          route: req.route?.path,
          logger: 'ExceptionFilter',
        });
      }
    } else {
      // 未捕获异常：不向客户端泄露内部细节，仅记录日志
      this.logger.error(
        `[${requestId}] 未捕获异常: ${exception instanceof Error ? exception.stack ?? exception.message : String(exception)}`,
      );
      code = API_ERROR_CODES.INTERNAL;
      status = 500;
      captureException(exception, {
        requestId,
        traceId,
        status,
        method: req.method,
        route: req.route?.path,
        logger: 'ExceptionFilter',
      });
    }

    res.status(status).json({ code, message, details, traceId, requestId });
  }
}
