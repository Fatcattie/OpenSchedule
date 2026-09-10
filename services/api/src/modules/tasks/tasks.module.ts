/**
 * 任务模块装配（§2 §3：tasks ★Phase 1 核心模块）。
 * 依赖 notifications 模块（站内通知落库）；导出 TasksService 供 assignments/reminders 模块经 service 层交互。
 */
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [NotificationsModule],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
