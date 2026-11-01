/**
 * R9 可观测性配置解析（纯函数，便于单测与 `tests/qa/observability-gates.test.ts` 断言）。
 *
 * 变量（见 services/api/.env.example「可观测性」段）：
 * - LOG_LEVEL：日志级别，默认 info（production 亦默认 info，异常时回落 info 而非静默）
 * - SLOW_QUERY_MS：慢查询阈值（毫秒），默认 200
 * - METRICS_ENABLED：是否暴露 /metrics，默认 true（'false'/'0' 关闭）
 */

export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** 默认日志级别 */
export const DEFAULT_LOG_LEVEL: LogLevel = 'info';
/** 默认慢查询阈值（毫秒） */
export const DEFAULT_SLOW_QUERY_MS = 200;

/** 解析正整数，非法/缺失回落 fallback，且不小于 min */
export function parsePositiveInt(raw: string | undefined, fallback: number, min = 1): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min) return fallback;
  return parsed;
}

/** 解析日志级别：大小写不敏感，未知值回落 info */
export function resolveLogLevel(env: NodeJS.ProcessEnv = process.env): LogLevel {
  const raw = env.LOG_LEVEL?.trim().toLowerCase();
  return (LOG_LEVELS as readonly string[]).includes(raw ?? '') ? (raw as LogLevel) : DEFAULT_LOG_LEVEL;
}

/** 解析慢查询阈值（毫秒） */
export function resolveSlowQueryMs(env: NodeJS.ProcessEnv = process.env): number {
  return parsePositiveInt(env.SLOW_QUERY_MS, DEFAULT_SLOW_QUERY_MS);
}

/** 解析 /metrics 开关：仅显式 'false'/'0'/'off' 关闭 */
export function resolveMetricsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.METRICS_ENABLED?.trim().toLowerCase();
  return !(raw === 'false' || raw === '0' || raw === 'off');
}

/** 生产环境标识（日志 base 字段） */
export function resolveAppEnv(env: NodeJS.ProcessEnv = process.env): string {
  return env.APP_ENV?.trim() || 'development';
}
