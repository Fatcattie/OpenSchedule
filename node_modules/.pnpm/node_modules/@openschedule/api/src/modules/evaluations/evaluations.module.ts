/**
 * 智能评估模块装配（B17：工时统计 + 智能评估 v1 规则引擎）。
 * 纯模块，无业务依赖；评分引擎为纯函数（scoring/），不注入服务。
 */
import { Module } from '@nestjs/common';
import { EvaluationsController } from './evaluations.controller';
import { EvaluationsService } from './evaluations.service';

@Module({
  controllers: [EvaluationsController],
  providers: [EvaluationsService],
  exports: [EvaluationsService],
})
export class EvaluationsModule {}
