/**
 * WebPush 通道适配器（TODO 占位：VAPID 可用性待实测（国产浏览器/企业内网 ⚠️），web-push 库就绪后实现）。
 */
import { Injectable, Logger } from '@nestjs/common';
import { DeliveryRecord, NotificationAdapter, OutboundNotification } from './notification-adapter.interface';

@Injectable()
export class PushAdapter implements NotificationAdapter {
  readonly channel = 'push' as const;
  private readonly logger = new Logger(PushAdapter.name);

  async send(notification: OutboundNotification, delivery: DeliveryRecord): Promise<void> {
    // TODO(Phase 1 末)：VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT + 用户订阅端点存储就绪后实现
    this.logger.warn(`[TODO] WebPush 通道未实现：notification=${notification.id} delivery=${delivery.id}`);
    throw new Error('PUSH_ADAPTER_NOT_IMPLEMENTED');
  }
}
