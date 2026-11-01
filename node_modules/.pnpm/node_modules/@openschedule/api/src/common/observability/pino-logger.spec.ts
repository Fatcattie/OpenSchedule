/**
 * R9 结构化日志：JSON 形态、base 字段、敏感字段脱敏、Nest LoggerService 适配、单例行为。
 * 全部写入内存 sink（不落 stdout），末尾逐行 JSON.parse 断言。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { AppLogger, createPinoLogger, obsLogger, REDACT_PATHS, setObsLogger } from './pino-logger';

/** 内存 sink：pino 自定义目标只需实现 write(msg) */
function createSink(): { lines: string[]; write: (msg: string) => void } {
  const lines: string[] = [];
  return { lines, write: (msg: string) => void lines.push(msg) };
}

function parseLines(lines: string[]): Record<string, unknown>[] {
  return lines.map(line => JSON.parse(line) as Record<string, unknown>);
}

afterEach(() => {
  setObsLogger(undefined);
});

describe('createPinoLogger', () => {
  it('输出逐行 JSON，含 base 字段与级别标签', () => {
    const sink = createSink();
    const logger = createPinoLogger({ LOG_LEVEL: 'debug', APP_ENV: 'test' }, sink);
    logger.info({ event: 'unit' }, 'hello');

    const [entry] = parseLines(sink.lines);
    expect(entry.level).toBe('info');
    expect(entry.service).toBe('openschedule-api');
    expect(entry.env).toBe('test');
    expect(entry.event).toBe('unit');
    expect(entry.msg).toBe('hello');
    expect(typeof entry.time).toBe('string');
  });

  it('LOG_LEVEL 生效（低于级别的日志被丢弃）', () => {
    const sink = createSink();
    const logger = createPinoLogger({ LOG_LEVEL: 'warn' }, sink);
    logger.info('dropped');
    logger.warn('kept');
    expect(sink.lines).toHaveLength(1);
    expect(parseLines(sink.lines)[0].msg).toBe('kept');
  });

  it('脱敏：password/token/Authorization 头一律 [REDACTED]', () => {
    const sink = createSink();
    const logger = createPinoLogger({}, sink);
    logger.info(
      {
        password: 'p@ss',
        accessToken: 'tok',
        nested: { token: 'nested-tok', secret: 's' },
        headers: { authorization: 'Bearer abc', cookie: 'sid=1' },
      },
      'redact',
    );

    const [entry] = parseLines(sink.lines);
    expect(entry.password).toBe('[REDACTED]');
    expect(entry.accessToken).toBe('[REDACTED]');
    expect((entry.nested as Record<string, unknown>).token).toBe('[REDACTED]');
    expect((entry.nested as Record<string, unknown>).secret).toBe('[REDACTED]');
    expect((entry.headers as Record<string, unknown>).authorization).toBe('[REDACTED]');
    expect((entry.headers as Record<string, unknown>).cookie).toBe('[REDACTED]');
  });

  it('脱敏路径清单覆盖凭据字段（防止后续被误删）', () => {
    for (const path of ['password', 'newPassword', 'refreshToken', 'req.headers.authorization', 'req.headers.cookie']) {
      expect(REDACT_PATHS).toContain(path);
    }
  });
});

describe('obsLogger 单例', () => {
  it('惰性创建并复用同一实例；setObsLogger 可替换/清空', () => {
    setObsLogger(undefined);
    const first = obsLogger();
    expect(obsLogger()).toBe(first);

    const sink = createSink();
    const custom = createPinoLogger({}, sink);
    setObsLogger(custom);
    expect(obsLogger()).toBe(custom);

    setObsLogger(undefined);
    expect(obsLogger()).not.toBe(custom);
  });
});

describe('AppLogger（Nest LoggerService 适配）', () => {
  it('把 Nest 级别映射为 pino 级别（verbose→trace）并把末位字符串当 context', () => {
    const sink = createSink();
    const logger = createPinoLogger({ LOG_LEVEL: 'trace' }, sink);
    const appLogger = new AppLogger(logger);

    appLogger.log('boot ok', 'Bootstrap');
    appLogger.warn('careful');
    appLogger.verbose('v', 'Ctx');
    appLogger.debug('d');
    appLogger.fatal('f');

    const entries = parseLines(sink.lines);
    expect(entries.map(e => e.level)).toEqual(['info', 'warn', 'trace', 'debug', 'fatal']);
    expect(entries[0].context).toBe('Bootstrap');
    expect(entries[2].context).toBe('Ctx');
    expect(entries[1].context).toBeUndefined();
    expect(entries[0].event).toBe('nest_log');
  });

  it('error(Error, stack, context)：message 取 Error.message，stack 入 meta', () => {
    const sink = createSink();
    const appLogger = new AppLogger(createPinoLogger({}, sink));
    appLogger.error(new Error('boom'), 'STACKTRACE', 'Svc');

    const [entry] = parseLines(sink.lines);
    expect(entry.msg).toBe('boom');
    expect(entry.params).toEqual(['STACKTRACE']);
    expect(entry.context).toBe('Svc');
    expect(String(entry.stack)).toContain('boom');
  });

  it('setLogLevels 为无操作（级别由 LOG_LEVEL 决定）', () => {
    const appLogger = new AppLogger(createPinoLogger({}, createSink()));
    expect(() => appLogger.setLogLevels()).not.toThrow();
  });
});
