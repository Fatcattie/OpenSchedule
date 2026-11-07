/**
 * Web 端 refresh token 的 HttpOnly Cookie 承载（安全问题 M-5）。
 *
 * - 客户端以请求头 `X-Auth-Transport: cookie` 声明使用 Cookie 模式（Web）：
 *   refresh token 只写入 HttpOnly + SameSite=Strict Cookie（Path 限定 /api/v1/auth），响应体不再返回，
 *   页面脚本（含 XSS 注入的脚本）读不到 refresh token；access token 由前端只存内存。
 * - 不带该头的客户端（移动端原生，SecureStore 存储）保持原行为：refresh token 走响应体/请求体。
 * - CSRF：refresh/logout 只有在带自定义头时才读 Cookie。跨站请求带自定义头必须过 CORS 预检（白名单拒绝），
 *   且 SameSite=Strict 下跨站请求不携带 Cookie，双重防护。
 */
import type { Request, Response } from 'express';

export const AUTH_TRANSPORT_HEADER = 'x-auth-transport';
export const REFRESH_COOKIE_NAME = 'os_rt';
/** Cookie 仅随认证端点发送（REST 全局前缀 /api/v1，见 main.ts） */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

/** 请求是否声明 Cookie 模式 */
export function wantsCookieTransport(req: Request): boolean {
  const v = req.headers[AUTH_TRANSPORT_HEADER];
  return (Array.isArray(v) ? v[0] : v)?.trim().toLowerCase() === 'cookie';
}

/** 从 Cookie 头读取 refresh token（零依赖解析，不引入 cookie-parser） */
export function readRefreshCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === REFRESH_COOKIE_NAME) {
      const value = part.slice(idx + 1).trim();
      try {
        return decodeURIComponent(value) || undefined;
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** 是否加 Secure 标志：生产默认开启；COOKIE_SECURE=true/false 可显式覆盖（本地 http 开发默认关闭） */
function isSecure(): boolean {
  const explicit = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  return process.env.APP_ENV === 'production';
}

/** 从 JWT 的 exp 推导 Cookie 有效期（与 refresh token 同寿命）；解析失败回退 7 天 */
function maxAgeMs(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp?: number };
    if (typeof payload.exp === 'number') return Math.max(0, payload.exp * 1000 - Date.now());
  } catch {
    // 回退默认值
  }
  return 7 * 24 * 60 * 60 * 1000;
}

export function setRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: isSecure(),
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    maxAge: maxAgeMs(refreshToken),
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, { httpOnly: true, secure: isSecure(), sameSite: 'strict', path: REFRESH_COOKIE_PATH });
}

/**
 * Cookie 模式下把响应体中的 refreshToken 移入 Cookie（响应体不再含 refresh token）。
 * 非 Cookie 模式原样返回。
 */
export function applyRefreshTransport<T extends { data: unknown }>(req: Request, res: Response, result: T): T {
  if (!wantsCookieTransport(req)) return result;
  const data = result.data as { refreshToken?: unknown } | null;
  if (data && typeof data === 'object' && typeof data.refreshToken === 'string') {
    setRefreshCookie(res, data.refreshToken);
    const { refreshToken: _omit, ...rest } = data;
    return { ...result, data: rest };
  }
  return result;
}
