/**
 * 总结模块装配（A6：summaries ★Phase 1 收尾模块）。
 * 依赖 PrismaService/AuditService（CommonModule @Global 提供）; 草稿持久化复用 ai_proposals 表（type='weekly_report'）。
 */
import { Module } from '@nestjs/common';
import { SummariesController } from './summaries.controller';
import { SummariesService } from './summaries.service';

@Module({
  controllers: [SummariesController],
  providers: [SummariesService],
})
export class SummariesModule {}