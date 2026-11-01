/**
 * 通知外发重试 worker（§3.4 BullMQ 队列化 + DB 兜底双保险）：
 * ① BullMQ repeatable（REDIS_URL 可用时）承担周期主路径；② setInterval 保留为兜底（Redis 宕机时重试不丢）。
 * 重试目标 = notification_delivery(status=failed, next_retry_at <= now)，退避策略见 retry-policy 纯函数。
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common'
import { QueueService } from '../../common/queue/queue.service'
import { NotificationsService } from './notifications.service'

@Injectable()
export class NotificationsRetryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsRetryWorker.name)
  private timer?: NodeJS.Timeout
  private readonly intervalMs = Number(process.env.NOTIFICATION_RETRY_INTERVAL_MS ?? 30000)

  constructor(
    private readonly notifications: NotificationsService,
    @Optional() private readonly queue?: QueueService,
  ) {}

  onModuleInit(): void {
    // 主路径：BullMQ repeatable job（retryDueDeliveries 自带 nextRetryAt 谓词，双路径天然去重）
    void this.queue
      ?.addRepeatable('notifications', 'notifications.retry', { intervalMs: this.intervalMs }, this.intervalMs)
      .then((ok) => ok && this.logger.log('通知重试 BullMQ repeatable job 已注册'))
    void this.queue?.startWorker('notifications', () => this.tick()).then((started) =>
      started && this.logger.log('通知重试 BullMQ worker 已启动'),
    )
    // 兜底：setInterval（Redis/队列不可用时退避重试仍覆盖）
    this.timer = setInterval(() => void this.tick().catch(err => this.logger.warn(`通知重试扫描失败: ${err.message}`)), this.intervalMs)
    this.timer.unref?.()
    this.logger.log(`通知重试 worker 启动（间隔 ${this.intervalMs}ms）`)
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
  }

  private async tick(): Promise<void> {
    await this.notifications.retryDueDeliveries()
  }
}
