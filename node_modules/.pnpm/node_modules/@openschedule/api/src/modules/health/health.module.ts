/**
 * health.module.ts —— 项目健康度 & 临期保障模块
 */
import { Module } from '@nestjs/common'
import { HealthController } from './health.controller'
import { HealthService } from './health.service'

@Module({
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}