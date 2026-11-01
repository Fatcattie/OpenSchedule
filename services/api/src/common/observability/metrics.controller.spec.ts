/**
 * R9 /metrics 控制器：默认渲染 Prometheus 文本（200 + Content-Type），
 * METRICS_ENABLED=false 时抛 404（统一错误信封由全局过滤器产出）。
 */
import { NotFoundException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MetricsController } from './metrics.controller';

function createRes(): { setHeader: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> } {
  const res = { setHeader: vi.fn(), status: vi.fn(), send: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

const original = process.env.METRICS_ENABLED;
afterEach(() => {
  if (original === undefined) delete process.env.METRICS_ENABLED;
  else process.env.METRICS_ENABLED = original;
});

describe('MetricsController', () => {
  it('默认启用：返回 Prometheus 文本 + no-store', async () => {
    delete process.env.METRICS_ENABLED;
    const res = createRes();
    await new MetricsController().scrape(res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', expect.stringContaining('text/plain'));
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    const body = res.send.mock.calls[0][0] as string;
    expect(body).toContain('openschedule_http_requests_total');
  });

  it('METRICS_ENABLED=false：抛 404 且不渲染', async () => {
    process.env.METRICS_ENABLED = 'false';
    const res = createRes();
    await expect(new MetricsController().scrape(res as never)).rejects.toBeInstanceOf(NotFoundException);
    expect(res.send).not.toHaveBeenCalled();
  });
});
