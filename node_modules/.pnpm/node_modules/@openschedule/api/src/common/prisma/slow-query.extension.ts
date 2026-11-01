/**
 * R9 慢查询扩展（独立文件，便于单测与覆盖率）：
 * 测量每次 DB 操作耗时，超过 SLOW_QUERY_MS（默认 200ms）时记一条结构化日志
 * （event=db_slow_query）+ 计数指标（openschedule_db_slow_queries_total）。
 *
 * 与租户过滤扩展链式组合（见 prisma.service.ts）：
 *   tenant-filter（外层，注入租户谓词）→ slow-query（内层，只计真实查询耗时）。
 */
import { Prisma } from '@prisma/client';
import { recordSlowQuery } from '../observability/metrics';
import { resolveSlowQueryMs } from '../observability/observability-config';
import { obsLogger } from '../observability/pino-logger';

/** $allOperations 回调入参（Prisma 扩展 ABI 的窄化类型） */
export interface SlowQueryOperationArgs {
  model: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
}

/**
 * 执行查询并测量耗时（带慢查询日志/指标）。**查询异常同样记录耗时**（finally），
 * 便于区分「慢且失败」与「慢但成功」——异常原样抛出，不吞错。
 */
export async function runWithSlowQueryLogging({
  model,
  operation,
  args,
  query,
}: SlowQueryOperationArgs): Promise<unknown> {
  const start = process.hrtime.bigint();
  try {
    return await query(args);
  } finally {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const thresholdMs = resolveSlowQueryMs();
    if (durationMs >= thresholdMs) {
      recordSlowQuery(model, operation);
      obsLogger().warn(
        {
          event: 'db_slow_query',
          model,
          operation,
          durationMs: Math.round(durationMs * 100) / 100,
          thresholdMs,
        },
        `慢查询 ${model}.${operation} ${Math.round(durationMs)}ms（阈值 ${thresholdMs}ms）`,
      );
    }
  }
}

/** Prisma 扩展：对所有模型的所有操作计时 */
export const slowQueryExtension = Prisma.defineExtension({
  name: 'slow-query-log',
  query: {
    $allModels: {
      $allOperations: runWithSlowQueryLogging,
    },
  },
});
