/**
 * health.controller.ts —— 项目健康度 & 临期保障控制器
 */
import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common'
import { HealthService } from './health.service'
import { JwtAuthGuard } from '../../common/auth/auth.guard'
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator'
import { EmergencyGenerateDto, HealthListQueryDto } from './dto/health.dto'

@Controller('health')
@UseGuards(JwtAuthGuard)
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  // 项目健康度
  @Get('projects/:projectId/score')
  getProjectHealth(@Param('projectId') projectId: string, @CurrentUser() user: AuthUser) {
    return this.healthService.getProjectHealth(projectId, user)
  }

  // 项目风险清单
  @Get('projects/:projectId/risks')
  getProjectRisks(@Param('projectId') projectId: string, @CurrentUser() user: AuthUser) {
    return this.healthService.getProjectRisks(projectId, user)
  }

  // 项目组合健康度
  @Get('portfolio')
  getPortfolioHealth(@CurrentUser() user: AuthUser, @Query() _query: HealthListQueryDto) {
    return this.healthService.getPortfolioHealth(user)
  }

  // 生成应急建议
  @Post('projects/:projectId/emergency/generate')
  generateEmergency(
    @Param('projectId') projectId: string,
    @Body() body: EmergencyGenerateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.healthService.generateEmergency(projectId, user, body.focusAreas)
  }
}