/**
 * R9 指标注册表：RED 指标 + 慢查询计数 + 在途 gauge + 运行时默认指标注册（幂等）。
 * 直接读注册表渲染结果断言（避免依赖全局 register 的测试串扰）。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  decInFlight,
  incInFlight,
  initDefaultMetrics,
  metricsRegistry,
  observeHttpRequest,
  recordSlowQuery,
  recordSystemEvent,
  renderMetrics,
  resetMetrics,
} from './metrics';

beforeEach(() => {
  resetMetrics();
});

describe('metrics', () => {
  it('observeHttpRequest：计数 + 耗时直方图（含 method/route/status 标签与服务默认标签）', async () => {
    observeHttpRequest('GET', '/api/v1/tasks/:id', 200, 12.5);
    observeHttpRequest('GET', '/api/v1/tasks/:id', 200, 30);
    observeHttpRequest('POST', '/api/v1/tasks', 201, 5);

    const { contentType, body } = await renderMetrics();
    expect(contentType).toContain('text/plain');
    expect(body).toMatch(
      /openschedule_http_requests_total\{[^}]*method="GET"[^}]*route="\/api\/v1\/tasks\/:id"[^}]*status="200"[^}]*\} 2/,
    );
    expect(body).toContain('openschedule_http_request_duration_seconds_bucket');
    expect(body).toContain('service="openschedule-api"');
    // 秒制：12.5ms + 30ms → sum ≈ 0.0425s
    expect(body).toMatch(/openschedule_http_request_duration_seconds_sum\{[^}]*\} 0\.042/);
  });

  it('负耗时被夹到 0（不产生负样本）', async () => {
    observeHttpRequest('GET', '/x', 200, -5);
    const { body } = await renderMetrics();
    expect(body).not.toMatch(/openschedule_http_request_duration_seconds_sum\{[^}]*\} -/);
  });

  it('在途 gauge 增减配对', async () => {
    incInFlight();
    incInFlight();
    let { body } = await renderMetrics();
    expect(body).toMatch(/openschedule_http_requests_in_flight\{[^}]*\} 2/);
    decInFlight();
    decInFlight();
    ({ body } = await renderMetrics());
    expect(body).toMatch(/openschedule_http_requests_in_flight\{[^}]*\} 0/);
  });

  it('recordSlowQuery / recordSystemEvent：按标签累计', async () => {
    recordSlowQuery('Task', 'findMany');
    recordSlowQuery('Task', 'findMany');
    recordSlowQuery('Project', 'create');
    recordSystemEvent('redis_degraded');

    const { body } = await renderMetrics();
    expect(body).toMatch(/openschedule_db_slow_queries_total\{[^}]*model="Task"[^}]*\} 2/);
    expect(body).toMatch(/openschedule_db_slow_queries_total\{[^}]*model="Project"[^}]*\} 1/);
    expect(body).toMatch(/openschedule_system_events_total\{[^}]*event="redis_degraded"[^}]*\} 1/);
  });

  it('initDefaultMetrics：注册运行时默认指标且幂等（不重复注册抛错）', async () => {
    initDefaultMetrics();
    initDefaultMetrics();
    const { body } = await renderMetrics();
    expect(body).toMatch(/openschedule_(nodejs|process)_/);
  });

  it('renderMetrics(true) 惰性注册默认指标', async () => {
    const { body } = await renderMetrics(true);
    expect(body).toMatch(/openschedule_(nodejs|process)_/);
  });

  it('注册表暴露已知指标（getSingleMetric）', () => {
    expect(metricsRegistry.getSingleMetric('openschedule_http_requests_total')).toBeDefined();
    expect(metricsRegistry.getSingleMetric('openschedule_db_slow_queries_total')).toBeDefined();
  });
});
