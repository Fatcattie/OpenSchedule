/**
 * R9 慢查询扩展：超过阈值才记日志 + 指标；查询异常同样计时但不吞错；未超阈值安静。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderMetrics, resetMetrics } from '../observability/metrics';
import { createPinoLogger, setObsLogger } from '../observability/pino-logger';
import { runWithSlowQueryLogging } from './slow-query.extension';

function createSink(): { lines: string[]; write: (msg: string) => void } {
  const lines: string[] = [];
  return { lines, write: (msg: string) => void lines.push(msg) };
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const original = process.env.SLOW_QUERY_MS;
let sink: ReturnType<typeof createSink>;

beforeEach(() => {
  resetMetrics();
  sink = createSink();
  setObsLogger(createPinoLogger({ LOG_LEVEL: 'debug' }, sink));
});

afterEach(() => {
  setObsLogger(undefined);
  if (original === undefined) delete process.env.SLOW_QUERY_MS;
  else process.env.SLOW_QUERY_MS = original;
});

describe('runWithSlowQueryLogging', () => {
  it('未超阈值：不记日志、不增指标，结果原样返回', async () => {
    process.env.SLOW_QUERY_MS = '1000';
    const result = await runWithSlowQueryLogging({
      model: 'Task',
      operation: 'findMany',
      args: { where: {} },
      query: async () => ['row'],
    });

    expect(result).toEqual(['row']);
    expect(sink.lines).toHaveLength(0);
    const { body } = await renderMetrics();
    expect(body).not.toMatch(/openschedule_db_slow_queries_total\{[^}]*model="Task"[^}]*\} [1-9]/);
  });

  it('超阈值：记 db_slow_query 日志 + 增计数指标（含 model/operation/阈值）', async () => {
    process.env.SLOW_QUERY_MS = '1';
    await runWithSlowQueryLogging({
      model: 'Task',
      operation: 'findMany',
      args: {},
      query: async () => {
        await sleep(5);
        return 1;
      },
    });

    expect(sink.lines).toHaveLength(1);
    const entry = JSON.parse(sink.lines[0]) as Record<string, unknown>;
    expect(entry.event).toBe('db_slow_query');
    expect(entry.model).toBe('Task');
    expect(entry.operation).toBe('findMany');
    expect(entry.thresholdMs).toBe(1);
    expect(Number(entry.durationMs)).toBeGreaterThanOrEqual(1);

    const { body } = await renderMetrics();
    expect(body).toMatch(/openschedule_db_slow_queries_total\{[^}]*model="Task"[^}]*operation="findMany"[^}]*\} 1/);
  });

  it('查询抛错：异常原样抛出，但仍记录耗时（慢且失败可观测）', async () => {
    process.env.SLOW_QUERY_MS = '1';
    await expect(
      runWithSlowQueryLogging({
        model: 'Task',
        operation: 'update',
        args: {},
        query: async () => {
          await sleep(5);
          throw new Error('db down');
        },
      }),
    ).rejects.toThrow('db down');

    expect(sink.lines).toHaveLength(1);
    expect((JSON.parse(sink.lines[0]) as Record<string, unknown>).event).toBe('db_slow_query');
  });
});
