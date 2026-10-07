/**
 * 职责：聚焦域服务 —— 今日聚焦聚合 / AI 提议 / 通知与通知偏好 / 个人任务 / 团队动态 / 时间容器数据。
 */
import { db, findTask, findUser, nextId, now } from '@/data'
import {
  ApiError,
  type AiProposal,
  type AiProposalStatus,
  type AuditFeedItem,
  type NotificationItem,
  type NotificationPreference,
  type Paginated,
  type PersonalTask,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type User,
} from '@/types'
import { addDays, minutesFromMidnight, startOfDay, toDateKey } from '@/utils/date'
import { isSubmissionRecord } from '@/utils/submission'
import { translate } from '@/i18n'
import { getCurrentLocale } from '@/i18n/current'
import { httpClient, simulateLatency } from './client'
import { USE_MOCK } from './config'
import { listDeadlineApproaching, listPendingReview, listTodayDue } from './task.service'

/** 时间容器显示区间：08:00–20:00 */
export const CALENDAR_START_HOUR = 8
export const CALENDAR_END_HOUR = 20
/** 每小时的像素高度（页面按此换算 topRatio / heightRatio） */
export const CALENDAR_HOUR_HEIGHT = 56

/** 今日聚焦三分组 */
export interface TodayFocusData {
  /** 今日到期 */
  dueToday: Task[]
  /** 待我审核 */
  pendingReview: Task[]
  /** 临期预警（≤24h） */
  approaching: Task[]
}

/** 时间容器的任务块（团队任务 + 个人任务统一形态） */
export interface CalendarBlock {
  id: string
  title: string
  status: TaskStatus
  startAt: string
  endAt: string
  kind: 'task' | 'personal'
  /** 原始数据 id（团队任务 id 或 个人任务 id） */
  sourceId: string
}

/** 空闲时段 */
export interface FreeSlot {
  startAt: string
  endAt: string
  minutes: number
}

/** 时间容器某天的数据 */
export interface CalendarDay {
  /** 该天在目标时区下的日期键 YYYY-MM-DD */
  dateKey: string
  blocks: CalendarBlock[]
  freeSlots: FreeSlot[]
}

/** 聚合今日聚焦三分组（并行拉取，减少等待） */
export async function getTodayFocus(userId: string, timezone: string): Promise<TodayFocusData> {
  if (USE_MOCK) {
    const [dueToday, pendingReview, approaching] = await Promise.all([
      listTodayDue(userId, timezone),
      listPendingReview(userId),
      listDeadlineApproaching(userId, timezone),
    ])
    return { dueToday, pendingReview, approaching }
  }
  // TODO(real-api): GET /focus/today?userId=:userId&timezone=:timezone
  return httpClient.get<TodayFocusData>('/focus/today', { query: { userId, timezone } })
}

/** AI 提议列表（可按状态过滤） */
export async function listAiProposals(status?: AiProposalStatus): Promise<AiProposal[]> {
  if (USE_MOCK) {
    await simulateLatency()
    const proposals = status
      ? db.aiProposals.filter((proposal) => proposal.status === status)
      : db.aiProposals
    return proposals.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
  // TODO(real-api): GET /ai/proposals?status=:status
  return httpClient.get<AiProposal[]>('/ai/proposals', { query: { status } })
}

/** 单条 AI 提议 */
export async function getAiProposal(proposalId: string): Promise<AiProposal> {
  if (USE_MOCK) {
    await simulateLatency()
    const proposal = db.aiProposals.find((item) => item.id === proposalId)
    if (!proposal) throw new ApiError(40401, translate(getCurrentLocale(), 'aiProposal.notFound'))
    return { ...proposal }
  }
  // TODO(real-api): GET /ai/proposals/:proposalId
  return httpClient.get<AiProposal>(`/ai/proposals/${proposalId}`)
}

/** 确认 AI 提议（落库由后端执行；mock 下仅更新状态） */
export async function approveAiProposal(proposalId: string, approverId: string): Promise<AiProposal> {
  if (USE_MOCK) {
    await simulateLatency()
    const proposal = db.aiProposals.find((item) => item.id === proposalId)
    if (!proposal) throw new ApiError(40401, translate(getCurrentLocale(), 'aiProposal.notFound'))
    if (proposal.status !== 'pending') {
      throw new ApiError(40901, translate(getCurrentLocale(), 'aiProposal.alreadyHandled'))
    }
    proposal.status = 'applied'
    proposal.approverId = approverId
    proposal.approvedAt = now()
    proposal.updatedAt = now()
    return { ...proposal }
  }
  // TODO(real-api): POST /ai/proposals/:proposalId/approve
  return httpClient.post<AiProposal>(`/ai/proposals/${proposalId}/approve`, {})
}

/** 驳回 AI 提议（原因必填） */
export async function rejectAiProposal(
  proposalId: string,
  reason: string,
  approverId: string,
): Promise<AiProposal> {
  if (USE_MOCK) {
    await simulateLatency()
    const proposal = db.aiProposals.find((item) => item.id === proposalId)
    if (!proposal) throw new ApiError(40401, translate(getCurrentLocale(), 'aiProposal.notFound'))
    if (proposal.status !== 'pending') {
      throw new ApiError(40901, translate(getCurrentLocale(), 'aiProposal.alreadyHandled'))
    }
    proposal.status = 'rejected'
    proposal.approverId = approverId
    proposal.rejectReason = reason
    proposal.updatedAt = now()
    return { ...proposal }
  }
  // TODO(real-api): POST /ai/proposals/:proposalId/reject  body: { reason }
  return httpClient.post<AiProposal>(`/ai/proposals/${proposalId}/reject`, { reason })
}

/** 通知列表（倒序） */
export async function listNotifications(userId: string): Promise<NotificationItem[]> {
  if (USE_MOCK) {
    await simulateLatency()
    return db.notifications
      .filter((notification) => notification.userId === userId)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
  // TODO(real-api): GET /notifications
  return httpClient.get<NotificationItem[]>('/notifications')
}

/** 未读通知数（顶部铃铛红点） */
export async function getUnreadCount(userId: string): Promise<number> {
  if (USE_MOCK) {
    await simulateLatency()
    return db.notifications.filter(
      (notification) => notification.userId === userId && notification.readAt === null,
    ).length
  }
  // TODO(real-api): GET /notifications/unread-count
  return httpClient.get<number>('/notifications/unread-count')
}

/** 标记单条通知已读 */
export async function markNotificationRead(notificationId: string): Promise<NotificationItem> {
  if (USE_MOCK) {
    await simulateLatency()
    const notification = db.notifications.find((item) => item.id === notificationId)
    if (!notification) throw new ApiError(40401, translate(getCurrentLocale(), 'notification.notFound'))
    notification.readAt = notification.readAt ?? now()
    notification.status = 'read'
    return { ...notification }
  }
  // TODO(real-api): PATCH /notifications/:notificationId/read
  return httpClient.patch<NotificationItem>(`/notifications/${notificationId}/read`, {})
}

/** 全部标记已读 */
export async function markAllNotificationsRead(userId: string): Promise<number> {
  if (USE_MOCK) {
    await simulateLatency()
    let count = 0
    db.notifications.forEach((notification) => {
      if (notification.userId === userId && notification.readAt === null) {
        notification.readAt = now()
        notification.status = 'read'
        count += 1
      }
    })
    return count
  }
  // TODO(real-api): POST /notifications/read-all
  return httpClient.post<number>('/notifications/read-all', {})
}

/** 通知偏好列表 */
export async function getNotificationPreferences(userId: string): Promise<NotificationPreference[]> {
  if (USE_MOCK) {
    await simulateLatency()
    return db.notificationPreferences
      .filter((preference) => preference.userId === userId)
      .map((preference) => ({ ...preference }))
  }
  // TODO(real-api): GET /notification-preferences
  return httpClient.get<NotificationPreference[]>('/notification-preferences')
}

/** 更新通知偏好渠道开关 */
export async function updateNotificationChannels(
  preferenceId: string,
  channels: NotificationPreference['channels'],
): Promise<NotificationPreference> {
  if (USE_MOCK) {
    await simulateLatency()
    const preference = db.notificationPreferences.find((item) => item.id === preferenceId)
    if (!preference) throw new ApiError(40401, translate(getCurrentLocale(), 'notification.preferenceNotFound'))
    preference.channels = { ...channels }
    preference.updatedAt = now()
    return { ...preference }
  }
  // TODO(real-api): PATCH /notification-preferences/:preferenceId
  return httpClient.patch<NotificationPreference>(`/notification-preferences/${preferenceId}`, { channels })
}

/** 个人任务列表 */
export async function listPersonalTasks(userId: string): Promise<PersonalTask[]> {
  if (USE_MOCK) {
    await simulateLatency()
    return db.personalTasks
      .filter((task) => task.userId === userId)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
  }
  // TODO(real-api): GET /personal-tasks
  return httpClient.get<PersonalTask[]>('/personal-tasks')
}

/** 新建个人任务入参 */
export interface CreatePersonalTaskInput {
  title: string
  description?: string
  startAt: string
  endAt: string
  priority?: TaskPriority
}

/** 新建个人任务（落 personal_tasks） */
export async function createPersonalTask(
  userId: string,
  input: CreatePersonalTaskInput,
): Promise<PersonalTask> {
  if (USE_MOCK) {
    await simulateLatency()
    const timestamp = now()
    const task: PersonalTask = {
      id: nextId('personal'),
      tenantId: db.tenant.id,
      userId,
      parentId: null,
      title: input.title,
      description: input.description ?? null,
      status: 'todo',
      priority: input.priority ?? 'medium',
      startAt: input.startAt,
      endAt: input.endAt,
      dueAt: input.endAt,
      estimatedHours: null,
      actualHours: null,
      completedAt: null,
      tags: [],
      sortOrder: db.personalTasks.filter((item) => item.userId === userId).length + 1,
      linkedTaskId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    db.personalTasks.push(task)
    return { ...task }
  }
  // TODO(real-api): POST /personal-tasks
  return httpClient.post<PersonalTask>('/personal-tasks', input)
}

/** 更新个人任务入参（个人计划不做乐观锁，PersonalTask 无 version） */
export interface UpdatePersonalTaskInput {
  title?: string
  description?: string
  priority?: TaskPriority
  startAt?: string | null
  endAt?: string | null
  status?: TaskStatus
}

/** 更新个人任务（部分字段） */
export async function updatePersonalTask(
  id: string,
  input: UpdatePersonalTaskInput,
): Promise<PersonalTask> {
  if (USE_MOCK) {
    await simulateLatency()
    const task = db.personalTasks.find((item) => item.id === id)
    if (!task) throw new ApiError(40401, translate(getCurrentLocale(), 'personalTask.notFound'))
    if (input.title !== undefined) task.title = input.title
    if (input.description !== undefined) task.description = input.description
    if (input.priority !== undefined) task.priority = input.priority
    if (input.startAt !== undefined) task.startAt = input.startAt
    if (input.endAt !== undefined) {
      task.endAt = input.endAt
      task.dueAt = input.endAt
    }
    if (input.status !== undefined) {
      task.status = input.status
      if (input.status === 'done') {
        task.completedAt = task.completedAt ?? now()
        task.actualHours = task.actualHours ?? task.estimatedHours ?? null
      } else {
        task.completedAt = null
      }
    }
    task.updatedAt = now()
    return { ...task }
  }
  // TODO(real-api): PATCH /personal-tasks/:id  body: { ...input }
  return httpClient.patch<PersonalTask>(`/personal-tasks/${id}`, input)
}

/** 删除个人任务 */
export async function deletePersonalTask(id: string): Promise<void> {
  if (USE_MOCK) {
    await simulateLatency()
    const index = db.personalTasks.findIndex((item) => item.id === id)
    if (index === -1) throw new ApiError(40401, translate(getCurrentLocale(), 'personalTask.notFound'))
    db.personalTasks.splice(index, 1)
    return
  }
  // TODO(real-api): DELETE /personal-tasks/:id
  await httpClient.delete<void>(`/personal-tasks/${id}`)
}

/** 标记个人任务完成（落 completedAt + actualHours） */
export async function completePersonalTask(id: string): Promise<PersonalTask> {
  if (USE_MOCK) {
    await simulateLatency()
    const task = db.personalTasks.find((item) => item.id === id)
    if (!task) throw new ApiError(40401, translate(getCurrentLocale(), 'personalTask.notFound'))
    task.status = 'done'
    task.completedAt = now()
    task.actualHours = task.actualHours ?? task.estimatedHours ?? null
    task.updatedAt = now()
    return { ...task }
  }
  // TODO(real-api): POST /personal-tasks/:id/complete
  return httpClient.post<PersonalTask>(`/personal-tasks/${id}/complete`, {})
}

/** 排期改期入参（拖拽与点击 PickerSheet 复用同一签名，PRD §8.3） */
export interface SchedulePersonalTaskInput {
  startAt: string
  endAt: string
}

/** 排期：把个人任务排到具体时段（拖拽 M2-P1-04 与点击 PickerSheet M2-P1-01 复用） */
export async function schedulePersonalTask(
  id: string,
  input: SchedulePersonalTaskInput,
): Promise<PersonalTask> {
  if (USE_MOCK) {
    await simulateLatency()
    const task = db.personalTasks.find((item) => item.id === id)
    if (!task) throw new ApiError(40401, translate(getCurrentLocale(), 'personalTask.notFound'))
    task.startAt = input.startAt
    task.endAt = input.endAt
    task.dueAt = input.endAt
    task.updatedAt = now()
    return { ...task }
  }
  // TODO(real-api): POST /personal-tasks/:id/schedule  body: { startAt, endAt }
  return httpClient.post<PersonalTask>(`/personal-tasks/${id}/schedule`, input)
}

/** 团队动态分页（倒序） */
export async function listAuditFeed(page = 1, pageSize = 5): Promise<Paginated<AuditFeedItem>> {
  if (USE_MOCK) {
    await simulateLatency()
    const all = db.auditFeed.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const start = (page - 1) * pageSize
    return {
      items: all.slice(start, start + pageSize),
      total: all.length,
      page,
      pageSize,
    }
  }
  // TODO(real-api): GET /audit-logs?page=:page&pageSize=:pageSize
  return httpClient.get<Paginated<AuditFeedItem>>('/audit-logs', { query: { page, pageSize } })
}

/** 某条动态对应的任务标题（动态流点击跳转用） */
export function resolveFeedTaskId(item: AuditFeedItem): string | null {
  if (item.resourceType === 'task' && item.resourceId) return item.resourceId
  return null
}

/** 动态参与人信息 */
export function resolveFeedActor(item: AuditFeedItem): User | null {
  return findUser(item.actorId)
}

/**
 * 时间容器：某天的任务块 + 空闲时段。
 * @param offsetDays 相对今天的天数偏移（0 = 今天，-1 = 昨天）
 */
export async function getCalendarDay(
  userId: string,
  timezone: string,
  offsetDays = 0,
): Promise<CalendarDay> {
  if (USE_MOCK) {
    await simulateLatency()
    return buildCalendarDay(userId, timezone, addDays(new Date(), offsetDays))
  }
  // TODO(real-api): GET /calendar/day?userId=:userId&timezone=:timezone&date=:date
  return httpClient.get<CalendarDay>('/calendar/day', { query: { userId, timezone, offsetDays } })
}

/** 时间容器：从今天起连续 7 天（周视图） */
export async function getCalendarWeek(userId: string, timezone: string): Promise<CalendarDay[]> {
  if (USE_MOCK) {
    await simulateLatency()
    const days: CalendarDay[] = []
    for (let offset = 0; offset < 7; offset += 1) {
      days.push(buildCalendarDay(userId, timezone, addDays(new Date(), offset)))
    }
    return days
  }
  // TODO(real-api): GET /calendar/week?userId=:userId&timezone=:timezone
  return httpClient.get<CalendarDay[]>('/calendar/week', { query: { userId, timezone } })
}

/** 构造某天的任务块与空闲时段（mock 实现，按目标时区日期键过滤） */
function buildCalendarDay(userId: string, timezone: string, dayDate: Date): CalendarDay {
  const dateKey = toDateKey(dayDate, timezone)
  const taskBlocks: CalendarBlock[] = db.tasks
    .filter((task) => {
      if (task.status === 'cancelled') return false
      if (!task.startAt) return false
      if (isSubmissionRecord(task)) return false // 提报记录不进日历（ARCH §7 列表守卫）
      return toDateKey(task.startAt, timezone) === dateKey
    })
    .map((task) => ({
      id: `task-block-${task.id}`,
      sourceId: task.id,
      title: task.title,
      status: task.status,
      startAt: task.startAt as string,
      endAt: task.endAt ?? task.dueAt ?? task.startAt ?? now(),
      kind: 'task' as const,
    }))

  const personalBlocks: CalendarBlock[] = db.personalTasks
    .filter((task) => task.userId === userId && task.startAt && task.endAt)
    .filter((task) => toDateKey(task.startAt as string, timezone) === dateKey)
    .map((task) => ({
      id: `personal-block-${task.id}`,
      sourceId: task.id,
      title: task.title,
      status: task.status,
      startAt: task.startAt as string,
      endAt: task.endAt as string,
      kind: 'personal' as const,
    }))

  const blocks = [...taskBlocks, ...personalBlocks].sort((a, b) => a.startAt.localeCompare(b.startAt))
  return { dateKey, blocks, freeSlots: computeFreeSlots(blocks, timezone, dayDate) }
}

/** 计算 08:00–20:00 内未被占用的空闲时段（按目标时区换算） */
function computeFreeSlots(blocks: CalendarBlock[], timezone: string, dayDate: Date): FreeSlot[] {
  const dayStart = CALENDAR_START_HOUR * 60
  const dayEnd = CALENDAR_END_HOUR * 60

  const ranges = blocks
    .map((block) => {
      const rawStart = minutesFromMidnight(block.startAt, timezone)
      const rawEnd = minutesFromMidnight(block.endAt, timezone)
      // 跨日或时间倒挂时按 1 小时兜底，避免负高度
      const safeEnd = rawEnd > rawStart ? rawEnd : rawStart + 60
      return {
        start: Math.max(dayStart, rawStart),
        end: Math.min(dayEnd, safeEnd),
      }
    })
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start)

  const freeSlots: FreeSlot[] = []
  let cursor = dayStart
  ranges.forEach((range) => {
    if (range.start > cursor) {
      freeSlots.push(makeFreeSlot(dayDate, cursor, range.start, timezone))
    }
    cursor = Math.max(cursor, range.end)
  })
  if (cursor < dayEnd) {
    freeSlots.push(makeFreeSlot(dayDate, cursor, dayEnd, timezone))
  }
  // 过滤掉不足 30 分钟的碎片，避免视觉噪音
  return freeSlots.filter((slot) => slot.minutes >= 30)
}

/**
 * 用「目标时区当天 00:00 + 分钟偏移」构造空闲时段。
 * 必须按 user.timezone 换算，避免设备时区 ≠ 目标时区时时间轴错位（D-06）。
 */
function makeFreeSlot(dayDate: Date, startMinutes: number, endMinutes: number, timezone: string): FreeSlot {
  const base = startOfDay(dayDate, timezone)
  const startAt = new Date(base.getTime() + startMinutes * 60_000).toISOString()
  const endAt = new Date(base.getTime() + endMinutes * 60_000).toISOString()
  return { startAt, endAt, minutes: endMinutes - startMinutes }
}

/** 通知对应的任务（点击深链跳转） */
export function resolveNotificationTask(notification: NotificationItem): Task | null {
  const taskId = notification.data?.taskId
  if (!taskId) return null
  return findTask(taskId)
}
