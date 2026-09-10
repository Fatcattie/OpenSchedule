/**
 * IM 通道适配器（TODO 占位：企微/飞书/钉钉群机器人 webhook 各自签名实现；租户级地址存 DB，全局 base 走 env，§3.7）。
 */
import { Injectable, Logger } from '@nestjs/common';
import { DeliveryRecord, NotificationAdapter, OutboundNotification } from './notification-adapter.interface';

@Injectable()
export class ImAdapter implements NotificationAdapter {
  readonly channel = 'im' as const;
  private readonly logger = new Logger(ImAdapter.name);

  async send(notification: OutboundNotification, delivery: DeliveryRecord): Promise<void> {
    // TODO(Phase 1 末)：企微/飞书/钉钉 webhook 签名（HMAC/SHA 时间戳校验）与租户级配置读取
    this.logger.warn(`[TODO] IM 通道未实现：notification=${notification.id} delivery=${delivery.id}`);
    throw new Error('IM_ADAPTER_NOT_IMPLEMENTED');
  }
}
