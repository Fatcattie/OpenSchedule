import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../../common/prisma/prisma.service'
import { NotificationsService } from './notifications.service'

@Injectable()
export class NotificationsRetryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsRetryWorker.name)
  private timer?: NodeJS.Timeout
  private readonly intervalMs = Number(process.env.NOTIFICATION_RETRY_INTERVAL_MS ?? 30000)

  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick().catch(err => this.logger.warn(`通知重试扫描失败: ${err.message}`)), this.intervalMs)
    this.timer.unref?.()
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
  }

  private async tick(): Promise<void> {
    await this.notifications.retryDueDeliveries()
  }
}
