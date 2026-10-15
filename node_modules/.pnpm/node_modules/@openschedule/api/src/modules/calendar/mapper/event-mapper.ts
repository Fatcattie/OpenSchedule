/**
 * event-mapper.ts —— 任务 → 日历事件 映射（纯函数）
 */

export interface TaskLite {
  id: string
  title: string
  description?: string | null
  dueDate?: Date | string | null
  status: string  // todo / in_progress / done / cancelled
  assigneeId?: string | null
  priority?: string | null
  tags?: string[] | null
}

export interface CalendarEventPayload {
  summary: string
  description: string
  start: { dateTime: string; timeZone: string } | { date: string }
  end: { dateTime: string; timeZone: string } | { date: string }
  isAllDay: boolean
  reminders: number[]  // 提前多少分钟提醒
  transparency: 'opaque' | 'transparent'  // opaque=占用时间, transparent=不占（已完成事件）
  status: 'confirmed' | 'cancelled' | 'tentative'
  // 扩展
  openScheduleTaskId?: string
  color?: string
}

export interface SyncChangeResult {
  shouldSync: boolean
  changedFields: string[]
}

// 需要同步的字段（日历事件中会体现的字段）
const SYNC_FIELDS = [
  'title',
  'description',
  'dueDate',
  'assigneeId',
  'status',
]

/**
 * 从任务构造日历事件 payload
 *
 * 规则：
 * - 截止日当天 = 全天事件（all-day event）
 * - 完成状态（done/cancelled）→ transparency=transparent, status=cancelled
 * - 默认提前 1 天（1440 分钟）和提前 1 小时（60 分钟）提醒
 */
export function taskToCalendarEvent(
  task: TaskLite,
  options: {
    timeZone?: string
    reminderMinutes?: number[]
    allDay?: boolean  // 是否强制全天，默认 true（截止日本身就是全天标记）
  } = {},
): CalendarEventPayload {
  const timeZone = options.timeZone ?? 'Asia/Shanghai'
  const reminderMinutes = options.reminderMinutes ?? [1440, 60]
  const isAllDay = options.allDay !== false  // 默认全天

  const isDone = task.status === 'done' || task.status === 'cancelled'

  // 计算起止时间
  let start: any
  let end: any

  if (task.dueDate) {
    const due = new Date(task.dueDate)

    if (isAllDay) {
      // 全天事件：start=当天日期, end=次日日期（飞书/Google 都这么算）
      const dateStr = formatDateStr(due)
      const nextDay = new Date(due)
      nextDay.setDate(nextDay.getDate() + 1)
      const nextDateStr = formatDateStr(nextDay)
      start = { date: dateStr }
      end = { date: nextDateStr }
    } else {
      // 非全天：默认 9:00-10:00（1 小时占位）
      const s = new Date(due.getFullYear(), due.getMonth(), due.getDate(), 9, 0, 0)
      const e = new Date(due.getFullYear(), due.getMonth(), due.getDate(), 10, 0, 0)
      start = { dateTime: s.toISOString(), timeZone }
      end = { dateTime: e.toISOString(), timeZone }
    }
  } else {
    // 没有截止日 → 不创建事件？但这个函数还是返回一个占位，调用方决定是否创建
    // 这里返回当天的 30 分钟占位，实际上调用方应该检查 dueDate 是否存在
    const now = new Date()
    const s = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0)
    const e = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 30, 0)
    start = { dateTime: s.toISOString(), timeZone }
    end = { dateTime: e.toISOString(), timeZone }
  }

  // 描述
  let description = task.description ?? ''
  if (task.priority) {
    description = `【优先级: ${task.priority}】\n${description}`
  }
  description += `\n\n— 来自 OpenSchedule · ${task.id}`

  // 颜色按优先级
  const colorMap: Record<string, string> = {
    high: '#f5222d',
    medium: '#faad14',
    low: '#52c41a',
  }

  return {
    summary: task.title,
    description: description.trim(),
    start,
    end,
    isAllDay,
    reminders: isDone ? [] : reminderMinutes,
    transparency: isDone ? 'transparent' : 'opaque',
    status: isDone ? 'cancelled' : 'confirmed',
    openScheduleTaskId: task.id,
    color: task.priority ? colorMap[task.priority] ?? undefined : undefined,
  }
}

/**
 * 判断任务变更是否需要触发日历同步
 */
export function shouldSyncTaskChange(
  oldTask: TaskLite,
  newTask: TaskLite,
): SyncChangeResult {
  const changedFields: string[] = []

  for (const field of SYNC_FIELDS) {
    const oldVal = getFieldValue(oldTask, field)
    const newVal = getFieldValue(newTask, field)

    if (oldVal !== newVal) {
      changedFields.push(field)
    }
  }

  return {
    shouldSync: changedFields.length > 0,
    changedFields,
  }
}

/**
 * 生成事件 UID（用于跨系统去重）
 * 格式：openschedule-task-{taskId}@{domain}
 */
export function generateEventUid(taskId: string, tenantId: string): string {
  return `openschedule-task-${taskId}@${tenantId}`
}

// ======== helper ========

function getFieldValue(task: TaskLite, field: string): any {
  switch (field) {
    case 'title':
      return task.title
    case 'description':
      return task.description ?? null
    case 'dueDate':
      return task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : null
    case 'assigneeId':
      return task.assigneeId ?? null
    case 'status':
      return task.status
    default:
      return undefined
  }
}

function formatDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
