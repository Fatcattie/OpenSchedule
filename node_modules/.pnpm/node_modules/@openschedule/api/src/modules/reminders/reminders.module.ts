/**
 * 提醒模块装配（§2 §3：reminders ★Phase 1；依赖 tasks 可见性 + notifications 触发通知；worker 随模块启动）。
 * 注意：RedisService 由基建员提供（src/common/redis/redis.service），未注册时 worker 自动降级为纯 DB 兜底扫描。
 */
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TasksModule } from '../tasks/tasks.module';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';
import { RemindersWorker } from './reminders.worker';

@Module({
  imports: [TasksModule, NotificationsModule],
  controllers: [RemindersController],
  providers: [RemindersService, RemindersWorker],
  exports: [RemindersService],
})
export class RemindersModule {}
