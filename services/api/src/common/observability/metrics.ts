/**
 * R9 指标（Prometheus / OpenMetrics）：进程指标 + HTTP RED + DB 慢查询计数。
 *
 * 使用官方客户端 `@prometheus-io/client`（prom-client 已更名为该包，见 GH 提示）。
 * 指标经 `GET /metrics` 暴露（main.ts 中排除 /api/v1 前缀；METRICS_ENABLED=false 时 404）。
 *
 * 指标清单：
 * - openschedule_nodejs_* / openschedule_process_*：Node 运行时默认指标（collectDefaultMetrics）
 * - openschedule_http_requests_total{method,route,status}：请求计数（RED 的 Rate/Errors）
 * - openschedule_http_request_duration_seconds{method,route,status}：请求耗时直方图（RED 的 Duration）
 * - openschedule_http_requests_in_flight：在途请求数
 * - openschedule_db_slow_queries_total{model,operation}：慢查询计数（与慢查询日志同源）
 *
 * `route` 使用归一化后的路由模板（/api/v1/tasks/:id），避免高基数标签。
 */
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from '@prometheus-io/client';

/** 独立注册表（不用全局 register，避免测试间串扰） */
export const metricsRegistry = new Registry();
metricsRegistry.setDefaultLabels({ service: 'openschedule-api' });

const httpRequestTotal = new Counter({
  name: 'openschedule_http_requests_total',
  help: 'HTTP 请求总数（按方法/路由/状态码）',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [metricsRegistry],
});

const httpRequestDuration = new Histogram({
  name: 'openschedule_http_request_duration_seconds',
  help: 'HTTP 请求耗时（秒，按方法/路由/状态码）',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

const httpRequestsInFlight = new Gauge({
  name: 'openschedule_http_requests_in_flight',
  help: '当前在途 HTTP 请求数',
  registers: [metricsRegistry],
});

const dbSlowQueries = new Counter({
  name: 'openschedule_db_slow_queries_total',
  help: '超过 SLOW_QUERY_MS 的数据库查询数（按模型/操作）',
  labelNames: ['model', 'operation'] as const,
  registers: [metricsRegistry],
});

/** 无标签系统级事件计数（队列降级/Redis 降级等，供后续扩展） */
const systemEvents = new Counter({
  name: 'openschedule_system_events_total',
  help: '系统级事件计数（如 redis_degraded）',
  labelNames: ['event'] as const,
  registers: [metricsRegistry],
});

/** 请求开始（在途 +1） */
export function incInFlight(): void {
  httpRequestsInFlight.inc();
}

/** 请求结束（在途 -1）；与 incInFlight 配对，异常路径也必须归还 */
export function decInFlight(): void {
  httpRequestsInFlight.dec();
}

/** 记录一次 HTTP 请求：计数 + 耗时直方图 */
export function observeHttpRequest(method: string, route: string, status: number, durationMs: number): void {
  const labels = { method, route, status: String(status) };
  httpRequestTotal.inc(labels);
  httpRequestDuration.observe(labels, Math.max(durationMs, 0) / 1000);
}

/** 记录一次慢查询（与慢查询日志同源） */
export function recordSlowQuery(model: string, operation: string): void {
  dbSlowQueries.inc({ model, operation });
}

/** 记录系统级事件（如 Redis 降级） */
export function recordSystemEvent(event: string): void {
  systemEvents.inc({ event });
}

let defaultMetricsInited = false;

/** 注册 Node 运行时默认指标（幂等；只在进程启动时调用一次） */
export function initDefaultMetrics(): void {
  if (defaultMetricsInited) return;
  defaultMetricsInited = true;
  collectDefaultMetrics({ register: metricsRegistry, prefix: 'openschedule_' });
}

/**
 * 渲染 Prometheus 文本格式。
 * @param withDefaultMetrics 是否惰性注册运行时默认指标（/metrics 首次抓取时为 true）
 */
export async function renderMetrics(withDefaultMetrics = false): Promise<{ contentType: string; body: string }> {
  if (withDefaultMetrics) initDefaultMetrics();
  return { contentType: metricsRegistry.contentType, body: await metricsRegistry.metrics() };
}

/** 测试用：清空指标值 */
export function resetMetrics(): void {
  metricsRegistry.resetMetrics();
}
