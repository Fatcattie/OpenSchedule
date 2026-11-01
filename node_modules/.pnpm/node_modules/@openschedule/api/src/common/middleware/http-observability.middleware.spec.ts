/**
 * R9 HTTP 可观测性中间件：路由标签归一化（防标签基数爆炸）+ 访问日志 + RED 指标，
 * finish/close 双事件去重，在途 gauge 借还平衡，日志级别随状态码分级。
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { createPinoLogger, setObsLogger } from '../observability/pino-logger';
import { renderMetrics, resetMetrics } from '../observability/metrics';
import { HttpObservabilityMiddleware, normalizeRouteLabel } from './http-observability.middleware';

function createSink(): { lines: string[]; write: (msg: string) => void } {
  const lines: string[] = [];
  return { lines, write: (msg: string) => void lines.push(msg) };
}

class FakeResponse extends EventEmitter {
  statusCode = 200;
}

interface FakeRequestInit {
  method?: string;
  path?: string;
  originalUrl?: string;
  routePath?: string;
  id?: string;
  user?: { userId?: string; tenantId?: string };
  ip?: string;
}

function createReq(init: FakeRequestInit = {}): Request {
  const req: Record<string, unknown> = {
    method: init.method ?? 'GET',
    path: init.path ?? '/api/v1/tasks/:taskId',
    originalUrl: init.originalUrl ?? '/api/v1/tasks/123?foo=bar',
    id: init.id ?? 'req-1',
    user: init.user,
    ip: init.ip ?? '127.0.0.1',
  };
  if (init.routePath) req.route = { path: init.routePath };
  return req as unknown as Request;
}

let sink: ReturnType<typeof createSink>;

beforeEach(() => {
  resetMetrics();
  sink = createSink();
  setObsLogger(createPinoLogger({ LOG_LEVEL: 'debug' }, sink));
});

afterEach(() => {
  setObsLogger(undefined);
});

describe('normalizeRouteLabel', () => {
  it('数字/UUID/复合 id 段归一化为 :id', () => {
    expect(normalizeRouteLabel('/api/v1/tasks/123')).toBe('/api/v1/tasks/:id');
    expect(normalizeRouteLabel('/api/v1/tasks/0f8fad5b-d9cb-469f-a165-70867728950e')).toBe('/api/v1/tasks/:id');
    expect(normalizeRouteLabel('/api/v1/workspace/tasks/task-0f8fad5b-d9cb-469f-a165-70867728950e')).toBe(
      '/api/v1/workspace/tasks/:id',
    );
  });

  it('已含参数占位与静态路径保持不变；查询串被剔除', () => {
    expect(normalizeRouteLabel('/api/v1/tasks/:taskId?x=1')).toBe('/api/v1/tasks/:taskId');
    expect(normalizeRouteLabel('/api/v1/workspace/directory')).toBe('/api/v1/workspace/directory');
  });

  it('空字符串回落 /', () => {
    expect(normalizeRouteLabel('')).toBe('/');
  });
});

describe('HttpObservabilityMiddleware', () => {
  function run(init: FakeRequestInit, status: number, events: Array<'finish' | 'close'> = ['finish', 'close']) {
    const res = new FakeResponse();
    res.statusCode = status;
    const next: NextFunction = () => undefined;
    new HttpObservabilityMiddleware().use(createReq(init), res as unknown as Response, next);
    for (const ev of events) res.emit(ev);
    return res;
  }

  it('产出访问日志（含 requestId/租户/用户）并对 finish+close 去重', async () => {
    run(
      {
        routePath: '/api/v1/tasks/:taskId',
        id: 'rid-9',
        user: { userId: 'u-1', tenantId: 't-1' },
      },
      200,
    );

    expect(sink.lines).toHaveLength(1);
    const entry = JSON.parse(sink.lines[0]) as Record<string, unknown>;
    expect(entry.event).toBe('http_request');
    expect(entry.level).toBe('info');
    expect(entry.route).toBe('/api/v1/tasks/:taskId');
    expect(entry.path).toBe('/api/v1/tasks/123');
    expect(entry.requestId).toBe('rid-9');
    expect(entry.tenantId).toBe('t-1');
    expect(entry.userId).toBe('u-1');
    expect(entry.status).toBe(200);

    // finish 与 close 都触发也只记一次；在途 gauge 归零
    const { body } = await renderMetrics();
    expect(body).toMatch(/openschedule_http_requests_total\{[^}]*\} 1/);
    expect(body).toMatch(/openschedule_http_requests_in_flight\{[^}]*\} 0/);
  });

  it('客户端中断（仅 close）也收口（不泄漏在途计数）', async () => {
    run({ routePath: '/api/v1/tasks' }, 200, ['close']);
    expect(sink.lines).toHaveLength(1);
    const { body } = await renderMetrics();
    expect(body).toMatch(/openschedule_http_requests_in_flight\{[^}]*\} 0/);
  });

  it('4xx → warn，5xx → error', () => {
    run({ routePath: '/api/v1/tasks' }, 404);
    run({ routePath: '/api/v1/tasks' }, 500);
    const levels = sink.lines.map(line => (JSON.parse(line) as Record<string, unknown>).level);
    expect(levels).toEqual(['warn', 'error']);
  });

  it('未匹配路由（404/扫描器）用真实路径归一化，避免高基数', async () => {
    run({ path: '/api/v1/does-not-exist/12345', originalUrl: '/api/v1/does-not-exist/12345' }, 404);
    const entry = JSON.parse(sink.lines[0]) as Record<string, unknown>;
    expect(entry.route).toBe('/api/v1/does-not-exist/:id');
  });
});
