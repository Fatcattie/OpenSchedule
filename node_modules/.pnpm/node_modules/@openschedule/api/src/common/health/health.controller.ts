/**
 * 健康检查端点（§3.4 分层：liveness 与 readiness 分离）。
 * - GET /health（liveness，轻：DB only；docker-compose HEALTHCHECK 探活依赖，见 deploy/docker-compose.yml）
 * - GET /health/ready（readiness：DB + Redis + 队列语义；部署探针使用，Redis 不可用不计入 503 阻断（降级语义），仅标记）
 * 路由在 setGlobalPrefix 中显式 exclude('health', 'health/ready')，避免被 /api/v1 前缀覆盖；@Public() 免认证。
 */
import { Controller, Get, Logger } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { RedisService } from '../redis/redis.service';

@Public()
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  private readonly startTime = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly queue: QueueService,
  ) {}

  /** liveness（轻）：仅探 DB（§3.4.4：重启探针用 liveness，接流量用 readiness） */
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

  /** readiness（探 DB+Redis+队列语义）：DB down → degraded（503 由部署探针判定）；Redis down 降级不阻断（zset/队列走 DB 兜底，工程决策 4） */
  @Get('ready')
  async ready(): Promise<{
    status: 'ok' | 'degraded';
    service: string;
    timestamp: string;
    db: 'up' | 'down';
    redis: 'up' | 'down' | 'disabled';
    queue: 'enabled' | 'disabled';
  }> {
    let dbStatus: 'up' | 'down' = 'up';
    try {
      await this.prisma.$queryRawUnsafe<unknown[]>('SELECT 1');
    } catch (err) {
      dbStatus = 'down';
      this.logger.warn(`readiness DB 探测失败：${err instanceof Error ? err.message : String(err)}`);
    }

    let redisStatus: 'up' | 'down' | 'disabled' = 'disabled';
    try {
      const client = await this.redis.getClient();
      await client.ping();
      redisStatus = 'up';
    } catch {
      redisStatus = 'down';
    }

    return {
      status: dbStatus === 'up' ? 'ok' : 'degraded',
      service: 'openschedule-api',
      timestamp: new Date().toISOString(),
      db: dbStatus,
      redis: redisStatus,
      queue: this.queue.enabled ? 'enabled' : 'disabled',
    };
  }
}