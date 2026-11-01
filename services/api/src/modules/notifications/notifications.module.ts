/**
 * 通知模块装配（§2 §3：notifications ★Phase 1；导出 NotificationsService 供 tasks/assignments/comments/reminders 经 service 层交互）。
 * R3：notification.failed 监听（NotificationFailedListener，§2.5 订阅表）→ 快速到期重试；
 * 周期重试由 NotificationsRetryWorker（BullMQ repeatable + setInterval 双保险）兜底。
 * R5：IM 通道经 integrations 模块出口（feishu/dingtalk，MCP 网关真实出站）。
 */
import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { EmailAdapter } from './adapters/email.adapter';
import { ImAdapter } from './adapters/im.adapter';
import { PushAdapter } from './adapters/push.adapter';
import { NotificationFailedListener } from './notification-failed.listener';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsRetryWorker } from './notifications-retry.worker';

@Module({
  imports: [IntegrationsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsRetryWorker, NotificationFailedListener, EmailAdapter, PushAdapter, ImAdapter],
  exports: [NotificationsService],
})
export class NotificationsModule {}
