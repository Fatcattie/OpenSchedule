/**
 * R9 错误上报（Sentry Envelope 零依赖实现）：DSN 解析 / 脱敏 / V8 栈解析 / 事件与信封构造 / 上报与限流。
 * 全部为纯函数 + 注入传输，测试不发起真实网络请求。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_EVENTS_PER_MINUTE,
  buildEnvelope,
  buildSentryEvent,
  captureException,
  initSentry,
  isSentryEnabled,
  parseSentryDsn,
  parseStackFrames,
  resetSentryForTest,
  resolveSentryOptions,
  scrubMessage,
} from './sentry';

const DSN = 'https://abc123def456@o4507000000000000.ingest.sentry.io/4507111111111111';

beforeEach(() => {
  resetSentryForTest();
});

describe('parseSentryDsn', () => {
  it('解析标准 DSN（公钥 + 项目号 + envelope 地址）', () => {
    expect(parseSentryDsn(DSN)).toEqual({
      publicKey: 'abc123def456',
      envelopeUrl: 'https://o4507000000000000.ingest.sentry.io/api/4507111111111111/envelope/',
    });
  });

  it('保留自建/带端口与路径前缀的 DSN', () => {
    expect(parseSentryDsn('http://key1@sentry.internal:9000/sentry/42')).toEqual({
      publicKey: 'key1',
      envelopeUrl: 'http://sentry.internal:9000/sentry/api/42/envelope/',
    });
  });

  it('非法 DSN 一律返回 null（空 / 缺公钥 / 缺项目号 / 项目号非数字 / 非 URL）', () => {
    expect(parseSentryDsn(undefined)).toBeNull();
    expect(parseSentryDsn('')).toBeNull();
    expect(parseSentryDsn('   ')).toBeNull();
    expect(parseSentryDsn('https://o0.ingest.sentry.io/123')).toBeNull(); // 缺公钥
    expect(parseSentryDsn('https://key@o0.ingest.sentry.io')).toBeNull(); // 缺项目号
    expect(parseSentryDsn('https://key@o0.ingest.sentry.io/abc')).toBeNull(); // 项目号非数字
    expect(parseSentryDsn('not-a-url')).toBeNull();
  });
});

describe('resolveSentryOptions', () => {
  it('无 DSN → null（no-op）', () => {
    expect(resolveSentryOptions({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it('有 DSN → 带 environment（APP_ENV 回落 development）与可选 release', () => {
    expect(resolveSentryOptions({ SENTRY_DSN: DSN } as NodeJS.ProcessEnv)).toEqual({
      dsn: parseSentryDsn(DSN),
      environment: 'development',
    });
    expect(
      resolveSentryOptions({ SENTRY_DSN: DSN, APP_ENV: 'production', SENTRY_RELEASE: 'v1.2.3' } as NodeJS.ProcessEnv),
    ).toEqual({ dsn: parseSentryDsn(DSN), environment: 'production', release: 'v1.2.3' });
  });
});

describe('scrubMessage', () => {
  it('遮蔽 Bearer / JWT / password= / token: / api_key= / 长十六进制串', () => {
    expect(scrubMessage('请求失败：Bearer eyJhbGciOi.abc.def')).toContain('Bearer [REDACTED]');
    expect(scrubMessage('token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSM')).toContain('JWT REDACTED');
    expect(scrubMessage('连接串 postgres://u:password=hunter2@db/x')).toContain('password=[REDACTED]');
    expect(scrubMessage('api_key="abc123"')).toContain('api_key=[REDACTED]');
    expect(scrubMessage(`key=${'a'.repeat(32)} 失败`)).toContain('[REDACTED_HEX]');
    // Authorization 头：值整体遮蔽（含其后的 Bearer 令牌）
    const auth = scrubMessage('调用失败 Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefgh');
    expect(auth).toContain('Authorization=[REDACTED]');
    expect(auth).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('不含凭据的普通文案原样保留', () => {
    expect(scrubMessage('数据库连接超时')).toBe('数据库连接超时');
  });
});

describe('parseStackFrames', () => {
  it('解析 V8 栈并反转为「最早调用在前」，内部/依赖帧标 in_app:false', () => {
    const stack = [
      'Error: 爆炸',
      '    at TaskService.fail (E:\\app\\src\\task.service.ts:42:11)',
      '    at PrismaClient.query (/app/node_modules/@prisma/client/runtime.js:1:2)',
      '    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)',
    ].join('\n');
    const frames = parseStackFrames(stack);
    expect(frames).toHaveLength(3);
    // 反转后：最早调用在最前（node 内部 → node_modules → 业务代码）
    expect(frames[0].in_app).toBe(false);
    expect(frames[1].in_app).toBe(false);
    expect(frames[2]).toMatchObject({
      filename: 'E:\\app\\src\\task.service.ts',
      function: 'TaskService.fail',
      lineno: 42,
      colno: 11,
      in_app: true,
    });
  });

  it('无栈 / 空栈 → 空数组；无函数名的帧也可解析', () => {
    expect(parseStackFrames(undefined)).toEqual([]);
    expect(parseStackFrames('Error: x')).toEqual([]);
    expect(parseStackFrames('    at /app/dist/main.js:1:1')).toEqual([
      { filename: '/app/dist/main.js', lineno: 1, colno: 1, in_app: true },
    ]);
  });

  it('栈帧数封顶（避免超大事件）', () => {
    const stack = ['Error: deep', ...Array.from({ length: 100 }, (_, i) => `    at f${i} (/app/a.ts:${i + 1}:1)`)].join('\n');
    expect(parseStackFrames(stack)).toHaveLength(30);
  });
});

describe('buildSentryEvent / buildEnvelope', () => {
  it('事件含类型/消息/栈/白名单标签与 sdk 声明，且不含请求体/请求头', () => {
    const err = new Error('内部错误 password=topsecret');
    const event = buildSentryEvent(
      err,
      { requestId: 'req-1', traceId: 'trace-1', status: 500, method: 'POST', route: '/api/v1/tasks/:id' },
      { dsn: parseSentryDsn(DSN)!, environment: 'production', release: 'v9' },
      new Date('2026-10-18T00:00:00.000Z'),
    );
    expect(event.level).toBe('error');
    expect(event.environment).toBe('production');
    expect(event.release).toBe('v9');
    expect(event.platform).toBe('node');
    expect(event.sdk).toMatchObject({ name: 'openschedule.api.envelope' });
    expect(event.tags).toEqual({
      request_id: 'req-1',
      trace_id: 'trace-1',
      http_method: 'POST',
      route: '/api/v1/tasks/:id',
      http_status: '500',
    });
    const ex = event.exception as { values: Array<{ type: string; value: string; stacktrace?: unknown }> };
    expect(ex.values[0].type).toBe('Error');
    expect(ex.values[0].value).toContain('password=[REDACTED]');
    expect(ex.values[0].value).not.toContain('topsecret');
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain('topsecret');
    expect(serialized).not.toMatch(/"headers"|"body"/);
    expect(serialized).toContain('"stacktrace"');
    expect(serialized).toContain('"frames"');
  });

  it('非 Error 抛出也能构造事件', () => {
    const event = buildSentryEvent('字符串抛出', {}, { dsn: parseSentryDsn(DSN)!, environment: 'development' });
    const ex = event.exception as { values: Array<{ value: string }> };
    expect(ex.values[0].value).toBe('字符串抛出');
    const fromObject = buildSentryEvent({ weird: true }, {}, { dsn: parseSentryDsn(DSN)!, environment: 'development' });
    expect((fromObject.exception as { values: Array<{ value: string }> }).values[0].value).toContain('未知错误');
  });

  it('Envelope 为「信封头 + item 头 + 事件体」三行，事件体可解析', () => {
    const event = buildSentryEvent(new Error('x'), {}, { dsn: parseSentryDsn(DSN)!, environment: 'development' });
    const envelope = buildEnvelope(event, new Date('2026-10-18T00:00:00.000Z'));
    const lines = envelope.split('\n').filter(Boolean);
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0])).toMatchObject({ event_id: event.event_id, sent_at: '2026-10-18T00:00:00.000Z' });
    expect(JSON.parse(lines[1])).toEqual({ type: 'event', content_type: 'application/json' });
    expect(JSON.parse(lines[2]).event_id).toBe(event.event_id);
  });
});

describe('initSentry / captureException', () => {
  it('未配置 DSN：isSentryEnabled=false 且不发起请求', () => {
    const fetchMock = vi.fn();
    expect(initSentry({} as NodeJS.ProcessEnv, { fetch: fetchMock as unknown as typeof fetch })).toBe(false);
    expect(isSentryEnabled()).toBe(false);
    captureException(new Error('x'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('配置 DSN：POST envelope 地址 + X-Sentry-Auth，事件含 requestId 标签', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const enabled = initSentry(
      { SENTRY_DSN: DSN, APP_ENV: 'production' } as NodeJS.ProcessEnv,
      { fetch: fetchMock as unknown as typeof fetch, now: () => 0 },
    );
    expect(enabled).toBe(true);
    expect(isSentryEnabled()).toBe(true);

    captureException(new Error('boom'), { requestId: 'req-42', status: 500, method: 'GET', route: '/api/v1/x' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; headers: Record<string, string>; body: string }];
    expect(url).toBe('https://o4507000000000000.ingest.sentry.io/api/4507111111111111/envelope/');
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/x-sentry-envelope');
    expect(init.headers['x-sentry-auth']).toContain('sentry_key=abc123def456');
    expect(init.headers['x-sentry-auth']).toContain('sentry_version=7');
    const eventLine = JSON.parse(init.body.split('\n').filter(Boolean)[2]);
    expect(eventLine.tags.request_id).toBe('req-42');
    expect(eventLine.environment).toBe('production');
  });

  it('传输失败 / 抛错均静默（不影响请求处理）', () => {
    const rejecting = vi.fn().mockRejectedValue(new Error('network down'));
    initSentry({ SENTRY_DSN: DSN } as NodeJS.ProcessEnv, { fetch: rejecting as unknown as typeof fetch, now: () => 0 });
    expect(() => captureException(new Error('boom'))).not.toThrow();

    const throwing = vi.fn(() => {
      throw new Error('sync throw');
    });
    initSentry({ SENTRY_DSN: DSN } as NodeJS.ProcessEnv, { fetch: throwing as unknown as typeof fetch, now: () => 0 });
    expect(() => captureException(new Error('boom'))).not.toThrow();
  });

  it('令牌桶限流：每 60s 窗口最多 MAX_EVENTS_PER_MINUTE 条', () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    let now = 1_000_000;
    initSentry({ SENTRY_DSN: DSN } as NodeJS.ProcessEnv, {
      fetch: fetchMock as unknown as typeof fetch,
      now: () => now,
    });
    for (let i = 0; i < MAX_EVENTS_PER_MINUTE + 5; i += 1) captureException(new Error(`e${i}`));
    expect(fetchMock).toHaveBeenCalledTimes(MAX_EVENTS_PER_MINUTE);
    // 进入下一窗口后恢复
    now += 60_001;
    captureException(new Error('next window'));
    expect(fetchMock).toHaveBeenCalledTimes(MAX_EVENTS_PER_MINUTE + 1);
  });

  it('resetSentryForTest 恢复 no-op', () => {
    initSentry({ SENTRY_DSN: DSN } as NodeJS.ProcessEnv, { fetch: vi.fn() as unknown as typeof fetch });
    expect(isSentryEnabled()).toBe(true);
    resetSentryForTest();
    expect(isSentryEnabled()).toBe(false);
  });
});
