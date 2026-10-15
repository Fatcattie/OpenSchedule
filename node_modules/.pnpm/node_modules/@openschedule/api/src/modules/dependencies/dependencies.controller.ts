/**
 * 依赖控制器（B15）。
 * 端点：
 * - GET /projects/:projectId/dependencies
 * - POST /projects/:projectId/dependencies
 * - DELETE /dependencies/:id
 * - GET /projects/:projectId/plan（CPM）
 */
import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../tasks/current-user.decorator';
import { DependenciesService } from './dependencies.service';
import { CreateDependencyDto } from './dto/create-dependency.dto';

@Controller()
export class DependenciesController {
  constructor(private readonly dependenciesService: DependenciesService) {}

  /** GET /api/v1/projects/:projectId/dependencies */
  @Get('projects/:projectId/dependencies')
  async list(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string) {
    return this.dependenciesService.listByProject(projectId, user);
  }

  /** POST /api/v1/projects/:projectId/dependencies */
  @Post('projects/:projectId/dependencies')
  async create(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Body() body: CreateDependencyDto,
  ) {
    return this.dependenciesService.create(projectId, user, body);
  }

  /** DELETE /api/v1/dependencies/:id */
  @Delete('dependencies/:id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.dependenciesService.remove(id, user);
  }

  /** GET /api/v1/projects/:projectId/plan */
  @Get('projects/:projectId/plan')
  async getPlan(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string) {
    return this.dependenciesService.getPlan(projectId, user);
  }
}
