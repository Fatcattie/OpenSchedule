/**
 * calendar.service.ts
 */
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../common/prisma/prisma.service'
import { AuthUser } from '../../common/decorators/current-user.decorator'
import { getCalendarAdapter } from './calendar-adapter'
import { decideCalendarSync, type CalendarConflictStrategy } from './sync-conflict'
import { externalEventToTaskPatch } from './sync-contract'
import { taskToCalendarEvent, generateEventUid, shouldSyncTaskChange } from './mapper/event-mapper'
import { findFreeSlots, findCommonFreeSlots, computeDayLoads } from './busy-free/busy-free'

const WORK_HOURS = { startHour: 9, endHour: 18 }

@Injectable()
export class CalendarService {
  constructor(private prisma: PrismaService) {}

  /** 支持的日历提供商列表 */
  listProviders() {
    return {
      data: [
        {
          provider: 'feishu',
          name: '飞书日历',
          icon: 'feishu',
          features: ['单向同步', '忙闲查询', '全天事件'],
        },
      ],
    }
  }

  // ========== 账户管理 ==========

  async listAccounts(user: AuthUser) {
    const accounts = await this.prisma.calendarAccount.findMany({
      where: { tenantId: user.tenantId, userId: user.userId },
      select: {
        id: true,
        provider: true,
        accountName: true,
        calendarId: true,
        isActive: true,
        lastSyncedAt: true,
        syncCount: true,
        failureCount: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    return { data: accounts }
  }

  /**
   * 绑定日历账户
   * v1: mock 模式，直接生成假 token 绑定
   * 生产环境: 通过 OAuth 回调获取 token
   */
  async bindAccount(user: AuthUser, input: { provider: string; accountName: string; calendarId?: string }) {
    if (input.provider !== 'feishu') {
      throw new BadRequestException(`不支持的日历提供商: ${input.provider}`)
    }

    // v1: 生成 mock token（真实环境由 OAuth 流程获取）
    const mockAccessToken = 'mock_access_token_' + Math.random().toString(36).slice(2, 42)
    const mockRefreshToken = 'mock_refresh_token_' + Math.random().toString(36).slice(2, 42)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)  // 7 天后过期
    const calendarId = input.calendarId || 'primary_mock_calendar'

    const account = await this.prisma.calendarAccount.create({
      data: {
        tenantId: user.tenantId,
        userId: user.userId,
        provider: input.provider,
        accountName: input.accountName,
        calendarId,
        accessToken: mockAccessToken,
        refreshToken: mockRefreshToken,
        expiresAt,
        isActive: true,
      },
      select: {
        id: true, provider: true, accountName: true, calendarId: true,
        isActive: true, createdAt: true,
      },
    })

    return { data: account }
  }

  async unbindAccount(id: string, user: AuthUser) {
    const account = await this.prisma.calendarAccount.findFirst({
      where: { id, tenantId: user.tenantId, userId: user.userId },
    })
    if (!account) throw new NotFoundException('日历账户不存在')

    // 软删没有，直接删（也可以加 deletedAt，v1 简化直接删）
    await this.prisma.calendarEventMapping.deleteMany({
      where: { accountId: id },
    })
    await this.prisma.calendarAccount.delete({ where: { id } })

    return { data: { id, unbound: true } }
  }

  // ========== 同步功能 ==========

  /** 同步单个任务到日历 */
  async syncTask(taskId: string, user: AuthUser, accountId?: string) {
    // 找账户
    const account = await this.findAccount(user, accountId)
    const adapter = getCalendarAdapter(account.provider)

    // 找任务
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, tenantId: user.tenantId },
    })
    if (!task) throw new NotFoundException('任务不存在')

    // 找已有映射
    const existing = await this.prisma.calendarEventMapping.findFirst({
      where: { accountId: account.id, taskId, tenantId: user.tenantId },
    })

    const eventPayload = taskToCalendarEvent({
      id: task.id,
      title: task.title,
      description: task.description,
      dueDate: task.dueAt ? new Date(task.dueAt) : null,
      status: task.status,
      assigneeId: task.assigneeId ?? null,
      priority: task.priority ?? null,
      tags: task.tags ?? [],
    }, { timeZone: 'Asia/Shanghai' })
    const eventUid = generateEventUid(task.id, user.tenantId)

    let eventId: string
    let syncState: string

    if (existing) {
      // 更新
      await adapter.updateEvent(account.accessToken, account.calendarId, existing.eventId, eventPayload)
      eventId = existing.eventId
      syncState = 'synced'

      await this.prisma.calendarEventMapping.update({
        where: { id: existing.id },
        data: {
          eventUid,
          syncState,
          lastSyncedAt: new Date(),
          lastSyncError: null,
        },
      })
    } else {
      // 新建
      const result = await adapter.createEvent(account.accessToken, account.calendarId, eventPayload)
      eventId = result.eventId
      syncState = 'synced'

      await this.prisma.calendarEventMapping.create({
        data: {
          tenantId: user.tenantId,
          accountId: account.id,
          taskId,
          eventId,
          eventUid,
          syncState,
          lastSyncedAt: new Date(),
        },
      })
    }

    // 更新账户同步计数
    await this.prisma.calendarAccount.update({
      where: { id: account.id },
      data: {
        syncCount: { increment: 1 },
        lastSyncedAt: new Date(),
        failureCount: 0,  // 成功重置失败计数
      },
    })

    return {
      data: {
        taskId,
        eventId,
        eventUid,
        syncState,
        syncedAt: new Date().toISOString(),
      },
    }
  }

  /** 批量同步项目任务 */
  async syncProjectTasks(projectId: string, user: AuthUser, accountId?: string) {
    const account = await this.findAccount(user, accountId)

    const tasks = await this.prisma.task.findMany({
      where: {
        projectId,
        tenantId: user.tenantId,
        deletedAt: null,
      },
    })

    const results = []
    let success = 0
    let failed = 0

    for (const task of tasks) {
      try {
        const result = await this.syncTask(task.id, user, account.id)
        results.push(result.data)
        success++
      } catch (err: any) {
        results.push({ taskId: task.id, error: err.message })
        failed++
      }
    }

    return {
      data: {
        total: tasks.length,
        success,
        failed,
        results,
      },
    }
  }

  /**
   * 账户级双向同步。外部删除只标记映射，避免未经确认删除业务任务。
   */
  async syncAccount(
    accountId: string,
    user: AuthUser,
    input: { startDate: string; endDate: string; conflictStrategy?: CalendarConflictStrategy },
  ) {
    const account = await this.findAccount(user, accountId)
    const adapter = getCalendarAdapter(account.provider)
    const start = new Date(input.startDate)
    const end = new Date(input.endDate)
    const strategy = input.conflictStrategy ?? 'manual'
    const externalEvents = await adapter.listEvents(account.accessToken, account.calendarId, start, end)
    const mappings = await this.prisma.calendarEventMapping.findMany({
      where: { accountId: account.id, tenantId: user.tenantId },
    })
    const tasks = await this.prisma.task.findMany({
      where: { tenantId: user.tenantId, id: { in: mappings.map(mapping => mapping.taskId) } },
    })
    const taskById = new Map(tasks.map(task => [task.id, task]))
    const eventByKey = new Map<string, typeof externalEvents[number]>()
    for (const event of externalEvents) {
      eventByKey.set(event.eventUid, event)
      if (event.eventId) eventByKey.set(event.eventId, event)
    }

    const results: Array<{ taskId: string; action: string; syncState: string }> = []
    for (const mapping of mappings) {
      const task = taskById.get(mapping.taskId)
      if (!task) continue
      const event = eventByKey.get(mapping.eventUid) ?? eventByKey.get(mapping.eventId)
      if (!event) {
        await this.prisma.calendarEventMapping.update({
          where: { id: mapping.id },
          data: { syncState: 'external_deleted', lastSyncError: '外部事件已删除，任务未删除' },
        })
        results.push({ taskId: mapping.taskId, action: 'mark_external_deleted', syncState: 'external_deleted' })
        continue
      }

      const decision = decideCalendarSync({
        taskUpdatedAt: task.updatedAt,
        calendarUpdatedAt: event.updatedAt,
        lastSyncedAt: mapping.lastSyncedAt,
      }, strategy)

      if (decision.action === 'pull') {
        const patch = externalEventToTaskPatch(event)
        await this.prisma.task.update({ where: { id: task.id }, data: patch })
        await this.prisma.calendarEventMapping.update({ where: { id: mapping.id }, data: { syncState: 'synced', lastSyncedAt: new Date(), lastSyncError: null } })
        results.push({ taskId: mapping.taskId, action: 'pull', syncState: 'synced' })
      } else if (decision.action === 'push') {
        await this.syncTask(task.id, user, account.id)
        results.push({ taskId: mapping.taskId, action: 'push', syncState: 'synced' })
      } else if (decision.action === 'conflict') {
        await this.prisma.calendarEventMapping.update({ where: { id: mapping.id }, data: { syncState: 'conflict', lastSyncError: '任务和外部事件均已变更，需要人工决策' } })
        results.push({ taskId: mapping.taskId, action: 'conflict', syncState: 'conflict' })
      } else {
        results.push({ taskId: mapping.taskId, action: 'noop', syncState: mapping.syncState })
      }
    }

    await this.prisma.calendarAccount.update({ where: { id: account.id }, data: { lastSyncedAt: new Date(), syncCount: { increment: 1 }, failureCount: 0 } })
    return { data: { accountId: account.id, total: results.length, results, syncedAt: new Date().toISOString() } }
  }

  /** 查询任务的日历事件映射 */
  async getTaskEventMapping(taskId: string, user: AuthUser) {
    const mappings = await this.prisma.calendarEventMapping.findMany({
      where: { taskId, tenantId: user.tenantId },
      select: {
        id: true, accountId: true, eventId: true, eventUid: true,
        syncState: true, lastSyncedAt: true, lastSyncError: true,
        createdAt: true,
      },
      orderBy: { lastSyncedAt: 'desc' },
    })
    return { data: mappings }
  }

  // ========== 忙闲查询 ==========

  /** 查询单人忙闲 */
  async getBusyFree(userId: string, startDate: string, endDate: string, user: AuthUser) {
    const start = new Date(startDate)
    const end = new Date(endDate)

    // 找用户的日历账户
    const account = await this.prisma.calendarAccount.findFirst({
      where: { tenantId: user.tenantId, userId, isActive: true },
    })

    let busyIntervals: Array<{ start: Date; end: Date; summary?: string; status: string }> = []

    if (account) {
      const adapter = getCalendarAdapter(account.provider)
      busyIntervals = await adapter.getFreeBusy(
        account.accessToken,
        account.calendarId,
        start,
        end,
      )
    }
    // 如果没绑定账户，返回全空（全空闲）

    const freeSlots = findFreeSlots(
      busyIntervals.map(b => ({ ...b, status: 'busy' })),
      WORK_HOURS,
      { start, end },
      30,
    )

    const dayLoads = computeDayLoads(
      busyIntervals.map(b => ({ ...b, status: 'busy' })),
      { start, end },
      WORK_HOURS,
    )

    return {
      data: {
        userId,
        startDate,
        endDate,
        busyIntervals: busyIntervals.map(b => ({
          start: b.start.toISOString(),
          end: b.end.toISOString(),
          summary: b.summary,
          status: b.status,
        })),
        freeSlots,
        dayLoads,
      },
    }
  }

  /** 批量查询多人忙闲 + 共同空闲 */
  async getBatchBusyFree(userIds: string[], startDate: string, endDate: string, user: AuthUser) {
    const start = new Date(startDate)
    const end = new Date(endDate)

    const usersData: Record<string, any> = {}
    const usersBusy: Record<string, any[]> = {}

    for (const uid of userIds) {
      const result = await this.getBusyFree(uid, startDate, endDate, user)
      usersData[uid] = result.data
      usersBusy[uid] = result.data.busyIntervals.map((b: any) => ({
        start: new Date(b.start),
        end: new Date(b.end),
      }))
    }

    // 计算共同空闲
    const commonFree = findCommonFreeSlots(
      usersBusy,
      WORK_HOURS,
      { start, end },
      30,
    )

    return {
      data: {
        startDate,
        endDate,
        userIds,
        perUser: usersData,
        commonFreeSlots: commonFree,
      },
    }
  }

  // ========== helper ==========

  private async findAccount(user: AuthUser, accountId?: string) {
    const where: any = { tenantId: user.tenantId, userId: user.userId, isActive: true }
    if (accountId) where.id = accountId

    const account = accountId
      ? await this.prisma.calendarAccount.findFirst({ where })
      : await this.prisma.calendarAccount.findFirst({ where, orderBy: { createdAt: 'desc' } })

    if (!account) {
      throw new BadRequestException('未找到可用的日历账户，请先绑定日历账户')
    }
    return account
  }
}
