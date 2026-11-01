/**
 * 邮件通道适配器（D-04 定案：SMTP 中继抽象，nodemailer 实发；本地开发配合 mailpit）。
 * 连接复用单例 transporter；10s 连接/握手/套接字超时（R4 出站超时纪律）。
 */
import { Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { buildEmailMessage, parseSmtpConfig, SmtpConfig } from './email-message';
import { DeliveryRecord, NotificationAdapter, OutboundNotification } from './notification-adapter.interface';

const SMTP_TIMEOUT_MS = 10_000;

@Injectable()
export class EmailAdapter implements NotificationAdapter {
  readonly channel = 'email' as const;
  private readonly logger = new Logger(EmailAdapter.name);
  private transporter: Transporter | null = null;
  private config: SmtpConfig | null | undefined;

  async send(notification: OutboundNotification, _delivery: DeliveryRecord): Promise<void> {
    if (!notification.recipientEmail) throw new Error('EMAIL_RECIPIENT_MISSING');
    const config = this.getConfig();
    if (!config) throw new Error('EMAIL_ADAPTER_NOT_CONFIGURED');
    const message = buildEmailMessage(notification, notification.recipientEmail, config.from);
    await this.getTransporter(config).sendMail(message);
  }

  private getConfig(): SmtpConfig | null {
    if (this.config === undefined) {
      this.config = parseSmtpConfig(process.env);
      if (this.config) this.logger.log(`邮件通道已配置：${this.config.host}:${this.config.port}`);
      else this.logger.warn('SMTP_HOST 未配置，邮件通道投递将失败（EMAIL_ADAPTER_NOT_CONFIGURED）');
    }
    return this.config;
  }

  private getTransporter(config: SmtpConfig): Transporter {
    if (!this.transporter) {
      this.transporter = createTransport({
        host: config.host,
        port: config.port,
        secure: config.port === 465,
        auth: config.user ? { user: config.user, pass: config.pass } : undefined,
        connectionTimeout: SMTP_TIMEOUT_MS,
        greetingTimeout: SMTP_TIMEOUT_MS,
        socketTimeout: SMTP_TIMEOUT_MS,
      });
    }
    return this.transporter;
  }
}
