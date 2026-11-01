/**
 * personal-tasks.module.ts —— 个人任务模块（BC-04 / R6-2）。
 * 依赖 PrismaService/AuditService（@Global CommonModule）与统一状态机常量（common/constants）。
 */
import { Module } from '@nestjs/common';
import { PersonalTasksService } from './personal-tasks.service';
import { PersonalTasksController } from './personal-tasks.controller';

@Module({
  controllers: [PersonalTasksController],
  providers: [PersonalTasksService],
  exports: [PersonalTasksService],
})
export class PersonalTasksModule {}