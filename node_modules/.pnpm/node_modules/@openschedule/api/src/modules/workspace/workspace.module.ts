/**
 * workspace.module.ts —— 协作工作台文档存储模块（D-07 一期）。
 * 依赖 PrismaService/AuditService（@Global CommonModule）。
 */
import { Module } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { WorkspaceController } from './workspace.controller';

@Module({
  controllers: [WorkspaceController],
  providers: [WorkspaceService],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}
