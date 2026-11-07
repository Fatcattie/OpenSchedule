/**
 * 安全响应头中间件（§3.3 安全基线 / R4）：为 API 响应装配基础安全头。
 * - X-Content-Type-Options: nosniff（防 MIME 嗅探）
 * - X-Frame-Options: DENY（防点击劫持）
 * - Referrer-Policy: no-referrer
 * - Strict-Transport-Security（仅生产，强制 HTTPS）
 * - Cache-Control: no-store（API 响应默认不缓存）
 * - Content-Security-Policy：API 只返回 JSON/文件，不加载任何子资源 → 全部禁止（安全问题 L-3）
 * CORS 收敛由 startup-guard（生产白名单）+ main.ts enableCors 完成，本中间件不重复。
 */
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  use(_req: Request, res: Response, next: NextFunction): void {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    if (process.env.APP_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  }
}