/**
 * proposals.module.ts —— AI 建议模块（拆解/评估/应急的草稿载体）
 */
import { Module } from '@nestjs/common'
import { CommonModule } from '../../common/common.module'
import { ProposalsService } from './proposals.service'
import { ProposalsController } from './proposals.controller'

@Module({
  imports: [CommonModule],
  controllers: [ProposalsController],
  providers: [ProposalsService],
  exports: [ProposalsService],
})
export class ProposalsModule {}