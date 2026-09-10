/**
 * calendar.controller.ts
 */
import { Controller, Get, Post, Delete, Param, Body, Query } from '@nestjs/common'
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator'
import { CalendarService } from './calendar.service'
import {
  BindAccountDto,
  BusyFreeQueryDto,
  BatchBusyFreeQueryDto,
  SyncTaskDto,
  SyncAccountDto,
} from './dto/calendar.dto'

@Controller('calendar')
export class CalendarController {
  constructor(private calendarService: CalendarService) {}

  /** GET /calendar/providers —— 支持的提供商 */
  @Get('providers')
  listProviders() {
    return this.calendarService.listProviders()
  }

  // ===== 账户管理 =====

  /** GET /calendar/accounts */
  @Get('accounts')
  async listAccounts(@CurrentUser() user: AuthUser) {
    return this.calendarService.listAccounts(user)
  }

  /** POST /calendar/accounts/bind */
  @Post('accounts/bind')
  async bindAccount(
    @CurrentUser() user: AuthUser,
    @Body() body: BindAccountDto,
  ) {
    return this.calendarService.bindAccount(user, body)
  }

  /** DELETE /calendar/accounts/:id */
  @Delete('accounts/:id')
  async unbindAccount(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.calendarService.unbindAccount(id, user)
  }

  // ===== 同步 =====

  /** POST /calendar/sync/task/:taskId —— 同步单个任务 */
  @Post('sync/task/:taskId')
  async syncTask(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
    @Body() body: SyncTaskDto,
  ) {
    return this.calendarService.syncTask(taskId, user, body.accountId)
  }

  /** POST /calendar/sync/project/:projectId —— 批量同步项目任务 */
  @Post('sync/project/:projectId')
  async syncProjectTasks(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Body() body: SyncTaskDto,
  ) {
    return this.calendarService.syncProjectTasks(projectId, user, body.accountId)
  }

  /** POST /calendar/sync/account/:accountId —— 双向同步账户事件 */
  @Post('sync/account/:accountId')
  async syncAccount(
    @CurrentUser() user: AuthUser,
    @Param('accountId') accountId: string,
    @Body() body: SyncAccountDto,
  ) {
    return this.calendarService.syncAccount(accountId, user, body)
  }

  /** GET /calendar/mappings/task/:taskId —— 查询任务的事件映射 */
  @Get('mappings/task/:taskId')
  async getTaskMapping(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
  ) {
    return this.calendarService.getTaskEventMapping(taskId, user)
  }

  // ===== 忙闲查询 =====

  /** GET /calendar/busy-free */
  @Get('busy-free')
  async getBusyFree(
    @CurrentUser() user: AuthUser,
    @Query() query: BusyFreeQueryDto,
  ) {
    return this.calendarService.getBusyFree(query.userId, query.startDate, query.endDate, user)
  }

  /** GET /calendar/busy-free/batch */
  @Get('busy-free/batch')
  async getBatchBusyFree(
    @CurrentUser() user: AuthUser,
    @Query() query: BatchBusyFreeQueryDto,
  ) {
    return this.calendarService.getBatchBusyFree(query.userIds, query.startDate, query.endDate, user)
  }
}
