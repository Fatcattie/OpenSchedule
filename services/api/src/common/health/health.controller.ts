/**
 * 健康检查端点：GET /health（docker-compose HEALTHCHECK 探活依赖，见 deploy/docker-compose.yml）。
 * 路由在 setGlobalPrefix 中显式 exclude('health')，避免被 /api/v1 前缀覆盖；@Public() 免认证。
 */
import { Controller, Get, Logger } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Public()
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  private readonly startTime = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<{
    status: string;
    service: string;
    timestamp: string;
    uptimeSeconds: number;
    db: 'up' | 'down';
  }> {
    let dbStatus: 'up' | 'down' = 'up';
    try {
      await this.prisma.$queryRawUnsafe<unknown[]>('SELECT 1');
    } catch (err) {
      dbStatus = 'down';
      this.logger.warn(`DB 健康检查失败：${err instanceof Error ? err.message : String(err)}`);
    }

    return {
      status: dbStatus === 'up' ? 'ok' : 'degraded',
      service: 'openschedule-api',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round((Date.now() - this.startTime) / 1000),
      db: dbStatus,
    };
  }
}