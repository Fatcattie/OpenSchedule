/**
 * OutboxDispatcher（§3.4 事件零消费治理 / R3）：
 * - 主路径：BullMQ repeatable job（配置了 REDIS_URL 且队列可用时）；
 * - DB 兜底：setInterval 周期调用 OutboxService.dispatchDue（Redis 宕机/队列不可用时提醒不丢，工程决策 4 同思路）。
 * - dispatchDue 内置原子认领（lockedUntil）保证多实例不重复分发；单实例双路径（队列+扫描）由认领去重。
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { QueueService } from '../queue/queue.service';

const OUTBOX_INTERVAL_MS = Number(process.env.OUTBOX_DISPATCH_INTERVAL_MS ?? 30_000); // 兜底扫描间隔

@Injectable()
export class OutboxDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcher.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly outbox: OutboxService,
    @Optional() private readonly queue?: QueueService,
  ) {}

  onModuleInit(): void {
    // 主路径：BullMQ repeatable job（Redis 可用时）；startWorker 使 repeatable job 有消费者（否则只入队不消费）
    void this.queue
      ?.addRepeatable('outbox', 'outbox.dispatch', { intervalMs: OUTBOX_INTERVAL_MS }, OUTBOX_INTERVAL_MS)
      .then((ok) => ok && this.logger.log('Outbox BullMQ repeatable job 已注册'));
    void this.queue
      ?.startWorker('outbox', () => this.handleQueueJob())
      .then((started) => started && this.logger.log('Outbox BullMQ worker 已启动'));
    // DB 兜底扫描（队列/Redis 挂了事件仍可由扫描补偿，§2.5 可靠性要求）
    this.timer = setInterval(() => {
      void this.outbox.dispatchDue().catch((err) => this.logger.warn(`Outbox 兜底扫描失败: ${(err as Error).message}`));
    }, OUTBOX_INTERVAL_MS);
    this.timer.unref?.();
    this.logger.log(`Outbox dispatcher 启动（兜底扫描间隔 ${OUTBOX_INTERVAL_MS}ms${this.queue?.enabled ? '；BullMQ 主路径已启用' : ''}）`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** BullMQ worker 的 job 处理入口（worker 注册时由 QueueService 回调到本方法） */
  async handleQueueJob(): Promise<void> {
    await this.outbox.dispatchDue();
  }
}
