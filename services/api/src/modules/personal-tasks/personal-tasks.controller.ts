/**
 * 个人任务控制器（R6-2 / BC-04：/me/tasks）—— 与团队任务隔离的自用 CRUD。
 * 全部走 Bearer 鉴权（全局 JwtAuthGuard）；属主 = 当前用户（service 强制，请求体不可指定）。
 */
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { PersonalTasksService } from './personal-tasks.service';
import { CreatePersonalTaskDto } from './dto/create-personal-task.dto';
import { UpdatePersonalTaskDto } from './dto/update-personal-task.dto';
import { CompletePersonalTaskDto } from './dto/complete-personal-task.dto';
import { ReopenPersonalTaskDto } from './dto/reopen-personal-task.dto';
import { PersonalTaskQueryDto } from './dto/personal-task-query.dto';

@Controller('me/tasks')
export class PersonalTasksController {
  constructor(private readonly tasks: PersonalTasksService) {}

  /** GET /api/v1/me/tasks 本人个人任务列表 */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: PersonalTaskQueryDto) {
    return this.tasks.list(user, query);
  }

  /** POST /api/v1/me/tasks 创建个人任务 */
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePersonalTaskDto) {
    return this.tasks.create(user, dto);
  }

  /** GET /api/v1/me/tasks/:id 详情 */
  @Get(':id')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.getOne(user, id);
  }

  /** PATCH /api/v1/me/tasks/:id 更新（含状态迁移） */
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdatePersonalTaskDto) {
    return this.tasks.update(user, id, dto);
  }

  /** POST /api/v1/me/tasks/:id/complete 完成（actual_hours ★D3） */
  @Post(':id/complete')
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CompletePersonalTaskDto) {
    return this.tasks.complete(user, id, dto);
  }

  /** POST /api/v1/me/tasks/:id/reopen 重开（T9） */
  @Post(':id/reopen')
  reopen(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReopenPersonalTaskDto) {
    return this.tasks.reopen(user, id, dto);
  }

  /** DELETE /api/v1/me/tasks/:id 软删 */
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.softDelete(user, id);
  }
}