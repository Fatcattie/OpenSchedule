/**
 * 承接模块装配（§2 §3：assignments ★Phase 1；依赖 tasks 模块的迁移核心 + notifications 模块）。
 */
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TasksModule } from '../tasks/tasks.module';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';

@Module({
  imports: [TasksModule, NotificationsModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
