/**
 * 任务模块装配（§2 §3：tasks ★Phase 1 核心模块）。
 * 依赖 notifications 模块（站内通知落库）；导出 TasksService 供 assignments/reminders 模块经 service 层交互。
 * R3：task-escalation.worker（阻塞>72h 升级扫描，BullMQ repeatable + DB 兜底双保险）随模块启动。
 */
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TaskEscalationWorker } from './task-escalation.worker';

@Module({
  imports: [NotificationsModule],
  controllers: [TasksController],
  providers: [TasksService, TaskEscalationWorker],
  exports: [TasksService],
})
export class TasksModule {}
