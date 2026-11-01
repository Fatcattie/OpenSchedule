/**
 * IM 通道适配器（R5-2）：委托 integrations 模块的 im-adapters（feishu/dingtalk，
 * MCP 网关模式真实出站 / mock 模式本地演示，切换见 INTEGRATION_*_MODE）。
 */
import { Injectable } from '@nestjs/common';
import { IntegrationsService } from '../../integrations/integrations.service';
import { buildImMessage, expectsRealImDelivery, resolveImProvider } from './im-message';
import { DeliveryRecord, NotificationAdapter, OutboundNotification } from './notification-adapter.interface';

@Injectable()
export class ImAdapter implements NotificationAdapter {
  readonly channel = 'im' as const;

  constructor(private readonly integrations: IntegrationsService) {}

  async send(notification: OutboundNotification, _delivery: DeliveryRecord): Promise<void> {
    if (!notification.recipientEmail) throw new Error('IM_RECIPIENT_MISSING');
    const provider = resolveImProvider(process.env);
    const payload = buildImMessage(notification, notification.recipientEmail);
    const result = await this.integrations.sendMessage(provider, payload);
    if (!result.ok) throw new Error(`IM_DELIVERY_FAILED: ${result.error ?? 'unknown'}`);
    if (result.channel === 'mock' && expectsRealImDelivery(process.env, provider)) {
      throw new Error('IM_GATEWAY_UNREACHABLE');
    }
  }
}
