/**
 * automation.module.ts —— 自动化规则模块（B20）
 */
import { Module } from '@nestjs/common'
import { AutomationService } from './automation.service'
import { AutomationController } from './automation.controller'

@Module({
  controllers: [AutomationController],
  providers: [AutomationService],
  exports: [AutomationService],
})
export class AutomationModule {}
