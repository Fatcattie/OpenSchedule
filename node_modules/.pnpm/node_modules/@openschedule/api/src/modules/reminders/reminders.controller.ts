/**
 * 提醒控制器（§3.5.1：GET/POST/PATCH/DELETE /reminders 与 GET/POST /tasks/:id/reminders；提醒属私有资源，仅本人可见可操作）。
 */
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthUser, CurrentUser } from './current-user.decorator';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { ReminderQueryDto } from './dto/reminder-query.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { RemindersService } from './reminders.service';

@Controller()
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  /** GET /api/v1/reminders 本人提醒列表 */
  @Get('reminders')
  async list(@CurrentUser() user: AuthUser, @Query() query: ReminderQueryDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.reminders.list(user, query);
    res.setHeader('X-Total-Count', String(result.meta.total));
    return result;
  }

  /** POST /api/v1/reminders 创建自定义提醒（支持多档提前量 leads） */
  @Post('reminders')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReminderDto) {
    return this.reminders.create(user, dto);
  }

  /** PATCH /api/v1/reminders/:id 更新（改触发时间同步 zset） */
  @Patch('reminders/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateReminderDto) {
    return this.reminders.update(id, user, dto);
  }

  /** DELETE /api/v1/reminders/:id 删除（status=cancelled + ZREM） */
  @Delete('reminders/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reminders.remove(id, user);
  }

  /** GET /api/v1/tasks/:id/reminders 任务维度提醒（本人视角） */
  @Get('tasks/:taskId/reminders')
  async listByTask(@CurrentUser() user: AuthUser, @Param('taskId') taskId: string, @Query() query: ReminderQueryDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.reminders.listByTask(taskId, user, query);
    res.setHeader('X-Total-Count', String(result.meta.total));
    return result;
  }

  /** POST /api/v1/tasks/:id/reminders 为任务创建提醒 */
  @Post('tasks/:taskId/reminders')
  createForTask(@CurrentUser() user: AuthUser, @Param('taskId') taskId: string, @Body() dto: CreateReminderDto) {
    return this.reminders.create(user, dto, taskId);
  }
}
