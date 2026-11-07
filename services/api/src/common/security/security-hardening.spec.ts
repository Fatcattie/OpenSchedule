/**
 * 安全加固回归测试（docs/code-analysis-report.md：H-1 / M-1 / M-3 / M-4 / M-5）。
 * 全部离线：不联网、不连库。
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { checkProductionStartup, isPlaceholderSecret } from '../startup/startup-guard';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import type { RateLimitService } from '../rate-limit/rate-limit.service';
import { parseTrustProxy } from './trust-proxy';
import { isPrivateIp, safeFetch, safeLookup } from './url-guard';
import { neutralizeCsvFormula, parseCsv, restoreCsvFormula, toCsv } from '../../modules/import-export/csv';
import {
  applyRefreshTransport,
  readRefreshCookie,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  wantsCookieTransport,
} from '../../modules/auth/refresh-cookie';

// ───────────── H-1：占位密钥 ─────────────
describe('H-1 占位密钥识别', () => {
  it('包含 change-me 的值（无论前缀/后缀/大小写）都视为占位', () => {
    for (const v of ['change-me-ai-service-token', 'dev-ai-service-token-change-me', 'xx-CHANGE-ME-yy', 'changeme123']) {
      expect(isPlaceholderSecret(v)).toBe(true);
    }
    expect(isPlaceholderSecret('3f9a1c7e5b2d4a8f9e0c1b2a3d4e5f60')).toBe(false);
  });

  it('生产启动校验拦截以 change-me 结尾的 AI_SERVICE_TOKEN', () => {
    const env: Record<string, string> = {
      DATABASE_URL: 'postgresql://u:p@db:5432/x',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      JWT_REFRESH_SECRET: 'b'.repeat(32),
      ENCRYPTION_KEY: 'c'.repeat(32),
      AI_SERVICE_TOKEN: 'dev-ai-service-token-change-me',
      CORS_ORIGINS: 'https://app.example.com',
    };
    const config = { get: (k: string) => env[k] } as unknown as ConfigService;
    const logger = { error: vi.fn() } as unknown as Logger;
    const result = checkProductionStartup(config, logger);
    expect(result.ok).toBe(false);
    expect(result.failures).toContain('placeholder:AI_SERVICE_TOKEN');
  });
});

// ───────────── M-1：限流 IP 来源 ─────────────
describe('M-1 trust proxy 与限流 IP', () => {
  it('parseTrustProxy：默认不信任；数字=跳数；列表=网段', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('')).toBe(false);
    expect(parseTrustProxy('0')).toBe(false);
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('loopback, 10.0.0.0/8')).toEqual(['loopback', '10.0.0.0/8']);
  });

  it('限流键使用 req.ip，伪造的 X-Forwarded-For 不参与', async () => {
    const check = vi.fn().mockResolvedValue({ allowed: true });
    const guard = new RateLimitGuard(
      { getAllAndOverride: () => ({ limit: 5, windowMs: 60_000, keyBy: 'ip' }) } as unknown as Reflector,
      { check } as unknown as RateLimitService,
    );
    const req = { method: 'POST', originalUrl: '/api/v1/auth/login', ip: '203.0.113.9', headers: { 'x-forwarded-for': '1.2.3.4' } };
    const ctx = { getHandler: () => null, getClass: () => null, switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
    await guard.canActivate(ctx);
    const key = check.mock.calls[0][0] as string;
    expect(key.endsWith(':203.0.113.9')).toBe(true);
    expect(key).not.toContain('1.2.3.4');
  });
});

// ───────────── M-3：SSRF ─────────────
describe('M-3 isPrivateIp 保留网段补全', () => {
  it('CGNAT / 基准测试 / 组播 / 广播 / 保留段拒绝', () => {
    for (const ip of ['100.64.0.1', '100.127.255.255', '198.18.0.1', '198.19.255.255', '224.0.0.1', '239.255.255.250', '255.255.255.255', '240.0.0.1']) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });

  it('IPv6：十六进制 IPv4-mapped / NAT64 / 6to4 / 组播 / 带方括号写法', () => {
    for (const ip of ['::ffff:7f00:1', '::ffff:a9fe:a9fe', '64:ff9b::7f00:1', 'ff02::1', '[::1]', '2002:7f00:1::1']) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });

  it('边界外公网地址放行', () => {
    for (const ip of ['100.63.255.255', '100.128.0.1', '198.17.255.255', '198.20.0.1', '223.255.255.255', '8.8.8.8', '2001:4860:4860::8888']) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });
});

describe('M-3 连接时校验（safeLookup / safeFetch）', () => {
  let server: http.Server;
  let port: number;
  beforeAll(async () => {
    server = http.createServer((_req, res) => res.end('internal-secret'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('safeLookup：解析结果为环回地址即拒绝建连（DNS 重绑定场景）', async () => {
    const err = await new Promise<NodeJS.ErrnoException | null>((resolve) =>
      safeLookup('localhost', { all: true }, (e) => resolve(e)),
    );
    expect(err?.code).toBe('EUNSAFEADDR');
  });

  it('safeFetch：内网 IP 字面量与 localhost 直接拒绝，内网服务收不到请求', async () => {
    await expect(safeFetch(`http://127.0.0.1:${port}/`)).rejects.toThrow(/内网|环回/);
    await expect(safeFetch(`http://localhost:${port}/`)).rejects.toThrow(/内网|环回/);
    await expect(safeFetch('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(/内网|环回|元数据/);
    await expect(safeFetch('file:///etc/passwd')).rejects.toThrow(/http/);
  });
});

// ───────────── M-4：CSV 公式注入 ─────────────
describe('M-4 CSV 公式注入', () => {
  it('公式触发字符开头加单引号前缀，纯数值不加', () => {
    expect(neutralizeCsvFormula('=HYPERLINK("http://evil","x")')).toBe(`'=HYPERLINK("http://evil","x")`);
    expect(neutralizeCsvFormula('+1+cmd|calc')).toBe(`'+1+cmd|calc`);
    expect(neutralizeCsvFormula('@SUM(A1)')).toBe(`'@SUM(A1)`);
    expect(neutralizeCsvFormula('\t=1')).toBe(`'\t=1`);
    expect(neutralizeCsvFormula('-5')).toBe('-5');
    expect(neutralizeCsvFormula('12.5')).toBe('12.5');
    expect(neutralizeCsvFormula('普通标题')).toBe('普通标题');
  });

  it('toCsv 输出经过转义，导入时 restoreCsvFormula 还原（往返不变）', () => {
    const csv = toCsv([['title'], ['=cmd|"/c calc"!A1']]);
    expect(csv).toBe(`title\r\n"'=cmd|""/c calc""!A1"`);
    const cell = parseCsv(csv)[1][0];
    expect(restoreCsvFormula(cell)).toBe('=cmd|"/c calc"!A1');
    expect(restoreCsvFormula("'普通")).toBe("'普通"); // 非公式的单引号开头不动
  });
});

// ───────────── M-5：refresh token Cookie 承载 ─────────────
describe('M-5 refresh token HttpOnly Cookie', () => {
  const makeReq = (headers: Record<string, string>) => ({ headers }) as never;

  it('仅 X-Auth-Transport: cookie 才启用 Cookie 模式', () => {
    expect(wantsCookieTransport(makeReq({ 'x-auth-transport': 'cookie' }))).toBe(true);
    expect(wantsCookieTransport(makeReq({}))).toBe(false);
  });

  it('readRefreshCookie 从多个 Cookie 中取出 os_rt', () => {
    expect(readRefreshCookie(makeReq({ cookie: `a=1; ${REFRESH_COOKIE_NAME}=tok.en.x; b=2` }))).toBe('tok.en.x');
    expect(readRefreshCookie(makeReq({ cookie: 'a=1' }))).toBeUndefined();
  });

  it('Cookie 模式：refresh token 写入 HttpOnly+Strict Cookie，响应体不再含 refreshToken', () => {
    const cookie = vi.fn();
    const res = { cookie } as never;
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = `h.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.s`;
    const out = applyRefreshTransport(makeReq({ 'x-auth-transport': 'cookie' }), res, { data: { accessToken: 'a', refreshToken: token } });
    expect(out.data).toEqual({ accessToken: 'a' });
    const [name, value, opts] = cookie.mock.calls[0];
    expect(name).toBe(REFRESH_COOKIE_NAME);
    expect(value).toBe(token);
    expect(opts).toMatchObject({ httpOnly: true, sameSite: 'strict', path: REFRESH_COOKIE_PATH });
    expect(opts.maxAge).toBeGreaterThan(3_500_000);
    expect(opts.maxAge).toBeLessThanOrEqual(3_600_000);
  });

  it('非 Cookie 模式（移动端原生）：响应体保持原样，不写 Cookie', () => {
    const cookie = vi.fn();
    const body = { data: { accessToken: 'a', refreshToken: 'r' } };
    expect(applyRefreshTransport(makeReq({}), { cookie } as never, body)).toBe(body);
    expect(cookie).not.toHaveBeenCalled();
  });
});

describe('M-3 出站调用点默认启用连接时校验', () => {
  it('PushAdapter 默认 agent 为 safeHttpsAgent；LlmConfigService 默认 fetch 为 safeFetch', async () => {
    const { PushAdapter } = await import('../../modules/notifications/adapters/push.adapter');
    const { safeHttpsAgent } = await import('./url-guard');
    expect(new PushAdapter({} as never).agent).toBe(safeHttpsAgent);
    const { LlmConfigService } = await import('../../modules/llm/llm-config.service');
    const svc = new LlmConfigService({} as never, {} as never, {} as never);
    await expect(svc.fetchImpl('http://127.0.0.1:1/x')).rejects.toThrow(/内网|环回/);
  });
});
