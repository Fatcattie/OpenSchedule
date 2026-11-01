/**
 * notification.failed 事件监听（§2.5 订阅表 / R3 事件零消费治理）：
 * 外发失败（routeOutbound 内 emit）→ 快速触发一次到期重试（retryDueDeliveries 自带 nextRetryAt 谓词与退避，
 * 未到退避期的 delivery 不会被重放；周期兜底由 NotificationsRetryWorker 的 BullMQ/setInterval 双保险覆盖）。
 */
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NOTIFICATION_EVENTS } from './events/notification.events';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationFailedListener {
  private readonly logger = new Logger(NotificationFailedListener.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(NOTIFICATION_EVENTS.FAILED)
  async onNotificationFailed(payload: {
    notificationId?: string;
    deliveryId?: string;
    channel?: string;
    attempts?: number;
    nextRetryAt?: string | Date | null;
  }): Promise<void> {
    this.logger.log(
      `notification.failed 收到（notification=${payload.notificationId ?? '?'} delivery=${payload.deliveryId ?? '?'} channel=${payload.channel ?? '?'} 第 ${payload.attempts ?? 1} 次失败），触发到期重试扫描`,
    );
    const retried = await this.notifications.retryDueDeliveries().catch((err: unknown) => {
      this.logger.warn(`notification.failed 快速重试扫描失败（由周期 worker 兜底）: ${(err as Error).message}`);
      return 0;
    });
    this.logger.debug(`notification.failed 快速重试扫描完成，处理 ${retried} 条`);
  }
}
