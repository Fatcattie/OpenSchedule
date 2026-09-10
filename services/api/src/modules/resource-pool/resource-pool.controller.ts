/**
 * resource-pool.controller.ts —— 资源池控制器（5 端点）
 */
import { Controller, Get, Post, Query, Param } from '@nestjs/common'
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator'
import { ResourcePoolService } from './resource-pool.service'

@Controller('resource-pool')
export class ResourcePoolController {
  constructor(private readonly service: ResourcePoolService) {}

  @Get('overview')
  async getOverview(
    @CurrentUser() user: AuthUser,
    @Query('projectIds') projectIds?: string,
  ) {
    const ids = projectIds ? projectIds.split(',').filter(Boolean) : undefined
    return this.service.getOverview(user, ids)
  }

  @Get('member/:assigneeId')
  async getMember(
    @CurrentUser() user: AuthUser,
    @Param('assigneeId') assigneeId: string,
  ) {
    const data = await this.service.getMember(user, assigneeId)
    return { data }
  }

  @Get('conflicts')
  async getConflicts(
    @CurrentUser() user: AuthUser,
    @Query('projectIds') projectIds?: string,
  ) {
    const ids = projectIds ? projectIds.split(',').filter(Boolean) : undefined
    const data = await this.service.getConflicts(user, ids)
    return { data }
  }

  @Get('matrix')
  async getMatrix(
    @CurrentUser() user: AuthUser,
    @Query('projectIds') projectIds?: string,
  ) {
    const ids = projectIds ? projectIds.split(',').filter(Boolean) : undefined
    return this.service.getMatrix(user, ids)
  }

  @Post('rebalance')
  async generateRebalance(
    @CurrentUser() user: AuthUser,
    @Query('projectIds') projectIds?: string,
  ) {
    const ids = projectIds ? projectIds.split(',').filter(Boolean) : undefined
    return this.service.generateRebalance(user, ids)
  }
}