/**
 * 提醒调度 worker（双保险，工程决策 4 + §3.4 BullMQ 队列化）：
 * ① Redis zset 延迟队列（score=trigger_at）为主；② DB 兜底扫描（reminders(trigger_at,status) 索引）防 Redis 宕机丢消息；
 * ③ BullMQ repeatable（REDIS_URL 可用时）承担周期主路径，setInterval DB 扫描保留为兜底。
 * 触发统一走 RemindersService.fire()（原子认领，防双路径重复触发）；汇总类提醒（每日/周报）留待后续。
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QueueService } from '../../common/queue/queue.service';
import { RedisService } from '../../common/redis/redis.service';
import { reminderZsetKey, RemindersService } from './reminders.service';

@Injectable()
export class RemindersWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RemindersWorker.name);
  /** 轮询间隔（毫秒）；TODO：收敛到共享配置（REMINDER_POLL_INTERVAL_MS，可配置默认值先行） */
  private readonly pollIntervalMs = Number(process.env.REMINDER_POLL_INTERVAL_MS ?? 5000);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly reminders: RemindersService,
    @Optional() private readonly redis?: RedisService,
    @Optional() private readonly queue?: QueueService,
  ) {}

  onModuleInit(): void {
    // 主路径：BullMQ repeatable（Redis 可用时）；worker 消费同一 tick（fire() 原子认领去重）
    void this.queue
      ?.addRepeatable('reminders', 'reminders.tick', { intervalMs: this.pollIntervalMs }, this.pollIntervalMs)
      .then((ok) => ok && this.logger.log('Reminders BullMQ repeatable job 已注册'));
    void this.queue?.startWorker('reminders', () => this.tick()).then((started) =>
      started && this.logger.log('Reminders BullMQ worker 已启动'),
    );
    // 兜底：setInterval DB 扫描（Redis/队列宕机时提醒不丢，工程决策 4）
    this.timer = setInterval(() => {
      void this.tick().catch(err => this.logger.error(`提醒调度 tick 失败: ${(err as Error).message}`));
    }, this.pollIntervalMs);
    this.timer.unref?.();
    this.logger.log(`提醒调度 worker 启动（间隔 ${this.pollIntervalMs}ms；zset key=${reminderZsetKey()}）`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** 每个 tick：zset 主队列 + DB 兜底扫描（fire 内原子认领保证不重复触发） */
  private async tick(): Promise<void> {
    await this.fireFromRedis().catch(err => this.logger.warn(`Redis zset 队列不可用，降级 DB 扫描: ${(err as Error).message}`));
    await this.fireFromDbScan().catch(err => this.logger.error(`DB 兜底扫描失败: ${(err as Error).message}`));
  }

  /** ① zset 主队列：取 score ≤ now 的到期成员 → 触发 → ZREM */
  private async fireFromRedis(): Promise<void> {
    if (!this.redis) return;
    const client = await this.redis.getClient();
    // TODO: node-redis v4.6+ zRangeByScore 已废弃，换 zRange(key, min, max, { BY: 'SCORE' })
    const dueIds = await client.zRangeByScore(reminderZsetKey(), 0, Date.now());
    for (const id of dueIds) {
      await this.reminders.fire(id);
      await client.zRem(reminderZsetKey(), id).catch(() => undefined);
    }
  }

  /** ② DB 兜底扫描：scheduled 且 trigger_at ≤ now（索引 (trigger_at, status)）；fire() 内原子认领防与 zset 路径重复 */
  private async fireFromDbScan(): Promise<void> {
    const due = await this.prisma.reminder.findMany({
      where: { status: 'scheduled', triggerAt: { lte: new Date() } },
      take: 100, // 每 tick 上限，防积压打满（TODO：积压分批处理）
      select: { id: true },
    });
    for (const r of due) await this.reminders.fire(r.id);
  }
}
