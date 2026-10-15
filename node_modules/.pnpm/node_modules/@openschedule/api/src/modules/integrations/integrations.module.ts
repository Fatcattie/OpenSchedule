/**
 * 集成模块装配：钉钉 / 飞书 统一出口（适配器可切换 MCP / OpenAPI / Mock）。
 */
import { Module } from '@nestjs/common'
import { IntegrationsController } from './integrations.controller'
import { IntegrationsService } from './integrations.service'

@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationsService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
