/**
 * 任务控制器（§3.5.1 任务与协作域：/projects/:id/tasks 与 /tasks/:id/*；claim/transfer 归 assignments 模块）。
 * 批量创建（数组 body）时全局 ValidationPipe 无法处理联合类型，此处手动 plainToInstance + validate。
 */
import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Response } from 'express';
import { AuthUser, CurrentUser } from './current-user.decorator';
import { CreateTaskDto } from './dto/create-task.dto';
import { CompleteTaskDto } from './dto/complete-task.dto';
import { MoveTaskDto } from './dto/move-task.dto';
import { ReopenTaskDto } from './dto/reopen-task.dto';
import { StartTimerDto } from './dto/timer.dto';
import { TaskQueryDto } from './dto/task-query.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TasksService } from './tasks.service';

@Controller()
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  /** GET /api/v1/me/today 当前用户今日聚焦 */
  @Get('me/today')
  today(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.tasks.today(user, limit ? Number(limit) : 50);
  }

  /** GET /api/v1/projects/:id/tasks 任务列表（树或平铺） */
  @Get('projects/:projectId/tasks')
  async list(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Query() query: TaskQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.tasks.listByProject(projectId, user, query);
    res.setHeader('X-Total-Count', String(result.meta.total));
    return result;
  }

  /** POST /api/v1/projects/:id/tasks 建任务（支持批量数组；幂等依赖 Idempotency-Key） */
  @Post('projects/:projectId/tasks')
  async create(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string, @Body() body: unknown) {
    const items = Array.isArray(body) ? body : [body];
    const validated = await Promise.all(
      items.map(async raw => {
        const dto = plainToInstance(CreateTaskDto, raw);
        const errors = await validate(dto);
        if (errors.length > 0) {
          throw new BadRequestException({
            code: 40001,
            message: '参数校验失败',
            details: errors.map(e => ({ property: e.property, constraints: e.constraints })),
          });
        }
        return dto;
      }),
    );
    return this.tasks.create(projectId, user, Array.isArray(body) ? validated : validated[0]);
  }

  /** GET /api/v1/tasks/:id 任务详情 */
  @Get('tasks/:id')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.getOne(id, user);
  }

  /** PATCH /api/v1/tasks/:id 更新（含状态流转；状态变更必带 version） */
  @Patch('tasks/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasks.update(id, user, dto);
  }

  /** DELETE /api/v1/tasks/:id 软删（T13 归档语义，递归子树） */
  @Delete('tasks/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.softDelete(id, user);
  }

  /** POST /api/v1/tasks/:id/complete 完成（T4/T7；落 actual_hours/completed_at ★D3） */
  @Post('tasks/:id/complete')
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CompleteTaskDto) {
    return this.tasks.complete(id, user, dto);
  }

  /** POST /api/v1/tasks/:id/reopen 重开（T9） */
  @Post('tasks/:id/reopen')
  reopen(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReopenTaskDto) {
    return this.tasks.reopen(id, user, dto);
  }

  /** POST /api/v1/tasks/:id/move 看板拖拽（乐观锁 40901；状态变更 40902） */
  @Post('tasks/:id/move')
  move(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MoveTaskDto) {
    return this.tasks.move(id, user, dto);
  }

  /** GET /api/v1/tasks/:id/history 变更历史（审计数据） */
  @Get('tasks/:id/history')
  async history(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: { page?: number; pageSize?: number }, @Res({ passthrough: true }) res: Response) {
    const result = await this.tasks.history(id, user, query);
    res.setHeader('X-Total-Count', String(result.meta.total));
    return result;
  }

  /** POST /api/v1/tasks/:id/start-timer 开始计时 */
  @Post('tasks/:id/start-timer')
  startTimer(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: StartTimerDto) {
    return this.tasks.startTimer(id, user, dto);
  }

  /** POST /api/v1/tasks/:id/stop-timer 停止计时（写 time_entries + 累计 actual_hours） */
  @Post('tasks/:id/stop-timer')
  stopTimer(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.stopTimer(id, user);
  }

  /** GET /api/v1/tasks/:id/time-entries 计时明细 */
  @Get('tasks/:id/time-entries')
  async timeEntries(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: { page?: number; pageSize?: number }, @Res({ passthrough: true }) res: Response) {
    const result = await this.tasks.listTimeEntries(id, user, query);
    res.setHeader('X-Total-Count', String(result.meta.total));
    return result;
  }
}
