/**
 * llm.module.ts —— 租户 AI 模型配置（D-14：管理员统一配置 key，去 LiteLLM，AI 服务直连厂商）
 */
import { Module } from '@nestjs/common'
import { LlmController } from './llm.controller'
import { LlmConfigService } from './llm-config.service'

@Module({
  controllers: [LlmController],
  providers: [LlmConfigService],
  exports: [LlmConfigService],
})
export class LlmModule {}
