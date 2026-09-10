/**
 * 邮件通道适配器（TODO 占位：SMTP 供应商未定（Resend/AWS SES/阿里云，§2 技术选型 ⚠️），当前仅保留接入骨架）。
 */
import { Injectable, Logger } from '@nestjs/common';
import { DeliveryRecord, NotificationAdapter, OutboundNotification } from './notification-adapter.interface';

@Injectable()
export class EmailAdapter implements NotificationAdapter {
  readonly channel = 'email' as const;
  private readonly logger = new Logger(EmailAdapter.name);

  async send(notification: OutboundNotification, delivery: DeliveryRecord): Promise<void> {
    // TODO(Phase 1 末)：SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/MAIL_FROM 就绪后实现真实发送（Nodemailer 或供应商 SDK）
    this.logger.warn(`[TODO] 邮件通道未实现：notification=${notification.id} delivery=${delivery.id}`);
    throw new Error('EMAIL_ADAPTER_NOT_IMPLEMENTED');
  }
}
