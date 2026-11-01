/**
 * proposals.module.ts —— AI 建议模块（拆解/评估/应急的草稿载体）
 * R3：proposals-expiry.worker 周期扫描 pending 且过期提议 → expired + 通知提议人（ai.proposal.expired，§2.5 订阅表）
 */
import { Module } from '@nestjs/common'
import { CommonModule } from '../../common/common.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { LlmModule } from '../llm/llm.module'
import { ProposalsService } from './proposals.service'
import { ProposalsController } from './proposals.controller'
import { ProposalsExpiryWorker } from './proposals-expiry.worker'

@Module({
  imports: [CommonModule, NotificationsModule, LlmModule],
  controllers: [ProposalsController],
  providers: [ProposalsService, ProposalsExpiryWorker],
  exports: [ProposalsService],
})
export class ProposalsModule {}