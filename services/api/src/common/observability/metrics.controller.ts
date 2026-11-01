/**
 * R9 /metrics 抓取端点（Prometheus text/OpenMetrics）。
 * - `@Public()`：部署侧抓取器不带 JWT（§3.4 探针/指标端点属于基础设施面）。
 * - `setGlobalPrefix` 的 exclude 中显式排除 'metrics'，故实际路径为 `/metrics`（不带 /api/v1）。
 * - `METRICS_ENABLED=false`（或 '0'/'off'）时返回 404（统一错误信封），不暴露进程细节。
 */
import { Controller, Get, NotFoundException, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { resolveMetricsEnabled } from './observability-config';
import { renderMetrics } from './metrics';

@Public()
@Controller('metrics')
export class MetricsController {
  /** 抓取全部已注册指标；首次抓取时惰性注册 Node 运行时默认指标 */
  @Get()
  async scrape(@Res() res: Response): Promise<void> {
    if (!resolveMetricsEnabled()) {
      throw new NotFoundException('指标端点已关闭（METRICS_ENABLED=false）');
    }
    const { contentType, body } = await renderMetrics(true);
    res.setHeader('Content-Type', contentType);
    // 抓取响应不缓存（避免 Prometheus 读到陈旧快照）
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(body);
  }
}
