/**
 * 协作工作台控制器（D-07 一期：/workspace/:collection）—— 原前端 localStorage 体系的服务端存储。
 * 全部走 Bearer 鉴权（全局 JwtAuthGuard）；租户/属主由 service 强制。
 */
import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ReviewWorkspaceTaskDto } from './dto/review-workspace-task.dto';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { WorkspaceService } from './workspace.service';
import { ApplyWorkspaceBatchDto } from './dto/apply-workspace-batch.dto';

@Controller('workspace')
export class WorkspaceController {
  constructor(private readonly workspace: WorkspaceService) {}

  /** GET /api/v1/workspace/directory 通讯录（全员可读：id/显示名/头像/角色；须在 :collection 之前声明） */
  @Get('directory')
  directory(@CurrentUser() user: AuthUser) {
    return this.workspace.directory(user);
  }

  /** POST /api/v1/workspace/tasks/:taskId/review 审核命令（通过/驳回仅管理；撤回限提报人或管理） */
  @Post('tasks/:taskId/review')
  review(@CurrentUser() user: AuthUser, @Param('taskId') taskId: string, @Body() dto: ReviewWorkspaceTaskDto) {
    return this.workspace.reviewTask(user, taskId, dto);
  }

  /** GET /api/v1/workspace/:collection 读整个集合 */
  @Get(':collection')
  list(@CurrentUser() user: AuthUser, @Param('collection') collection: string) {
    return this.workspace.list(user, collection);
  }

  /** PUT /api/v1/workspace/:collection 批量写（单事务 + 条目级乐观锁） */
  @Put(':collection')
  applyBatch(@CurrentUser() user: AuthUser, @Param('collection') collection: string, @Body() dto: ApplyWorkspaceBatchDto) {
    return this.workspace.applyBatch(user, collection, dto);
  }
}
