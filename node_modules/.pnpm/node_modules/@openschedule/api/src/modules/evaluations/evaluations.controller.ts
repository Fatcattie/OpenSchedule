/**
 * 智能评估控制器（B17）。
 * 端点（统一 /api/v1 前缀 + {data} 信封）：
 * - GET  /evaluations/me/profile
 * - PUT  /evaluations/me/profile
 * - GET  /evaluations/projects/:projectId/members/stats
 * - POST /evaluations/tasks/:taskId/recommend
 * - GET  /evaluations/me/stats
 */
import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { StatsQueryDto } from './dto/stats-query.dto';
import { EvaluationsService } from './evaluations.service';

@Controller('evaluations')
export class EvaluationsController {
  constructor(private readonly evaluationsService: EvaluationsService) {}

  /** GET /api/v1/evaluations/me/profile */
  @Get('me/profile')
  async getMyProfile(@CurrentUser() user: AuthUser) {
    return this.evaluationsService.getMyProfile(user);
  }

  /** PUT /api/v1/evaluations/me/profile */
  @Put('me/profile')
  async updateMyProfile(@CurrentUser() user: AuthUser, @Body() body: UpdateProfileDto) {
    return this.evaluationsService.updateMyProfile(user, body);
  }

  /** GET /api/v1/evaluations/projects/:projectId/members/stats?days=30 */
  @Get('projects/:projectId/members/stats')
  async getMembersStats(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Query() query: StatsQueryDto,
  ) {
    return this.evaluationsService.getMembersStats(projectId, user, query.days ?? 30);
  }

  /** POST /api/v1/evaluations/tasks/:taskId/recommend（无 body） */
  @Post('tasks/:taskId/recommend')
  async recommend(@CurrentUser() user: AuthUser, @Param('taskId') taskId: string) {
    return this.evaluationsService.recommendForTask(taskId, user);
  }

  /** GET /api/v1/evaluations/me/stats?days=30 */
  @Get('me/stats')
  async getMyStats(@CurrentUser() user: AuthUser, @Query() query: StatsQueryDto) {
    return this.evaluationsService.getMyStats(user, query.days ?? 30);
  }
}
