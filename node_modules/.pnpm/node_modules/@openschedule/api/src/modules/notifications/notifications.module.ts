/**
 * 通知模块装配（§2 §3：notifications ★Phase 1；导出 NotificationsService 供 tasks/assignments/comments/reminders 经 service 层交互）。
 * TODO(Phase 1 末)：注册 notification.failed 事件监听 → 重试 worker（退避重试）。
 */
import { Module } from '@nestjs/common';
import { EmailAdapter } from './adapters/email.adapter';
import { ImAdapter } from './adapters/im.adapter';
import { PushAdapter } from './adapters/push.adapter';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsRetryWorker } from './notifications-retry.worker';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsRetryWorker, EmailAdapter, PushAdapter, ImAdapter],
  exports: [NotificationsService],
})
export class NotificationsModule {}
