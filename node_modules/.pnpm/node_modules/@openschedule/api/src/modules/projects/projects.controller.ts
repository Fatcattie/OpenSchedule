/**
 * 项目控制器（§3.5.1 项目域 5 条端点；/projects/:id/tasks 归 tasks 模块实现，不在此重复）。
 */
import { Body, Controller, Delete, Get, Header, NotImplementedException, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser, AuthUser } from './current-user.decorator';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectQueryDto } from './dto/project-query.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

@Controller()
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  /** GET /api/v1/projects 项目列表（X-Total-Count 分页头） */
  @Get('projects')
  async list(@CurrentUser() user: AuthUser, @Query() query: ProjectQueryDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.projects.list(user, query);
    res.setHeader('X-Total-Count', String(result.meta.total));
    return result;
  }

  /** POST /api/v1/projects 创建项目（创建者自动成为项目负责人） */
  @Post('projects')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProjectDto) {
    return this.projects.create(user, dto);
  }

  /** GET /api/v1/projects/:id 项目详情 */
  @Get('projects/:id')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projects.getOne(id, user);
  }

  /** PATCH /api/v1/projects/:id 更新（仅项目负责人/租户 Admin） */
  @Patch('projects/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(id, user, dto);
  }

  /** DELETE /api/v1/projects/:id 软删 */
  @Delete('projects/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projects.softDelete(id, user);
  }

  /** POST /api/v1/projects/:id/archive 归档（与删除语义分离） */
  @Post('projects/:id/archive')
  archive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projects.archive(id, user);
  }

  /** GET /api/v1/projects/:id/timeline 甘特/时间轴（Phase 2 占位） */
  @Get('projects/:id/timeline')
  timeline(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projects.timeline(id, user);
  }

  /** GET /api/v1/projects/:id/milestones 里程碑（Phase 2 占位） */
  @Get('projects/:id/milestones')
  listMilestones(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projects.listMilestones(id, user);
  }

  /** POST /api/v1/projects/:id/milestones 里程碑创建（Phase 2 未实现） */
  @Post('projects/:id/milestones')
  createMilestone(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    void user;
    void id;
    throw new NotImplementedException({ code: 40001, message: '里程碑为 Phase 2 功能，尚未实现' });
  }
}
