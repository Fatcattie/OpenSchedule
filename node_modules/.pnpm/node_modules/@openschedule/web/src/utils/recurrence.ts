/**
 * recurrence.ts —— 定期 / 循环 重复规则的计算与「实体复制」生成
 *
 * 设计（用户确认）：
 * - 实例生成：实体复制。创建时即复制出各次执行子任务，共享 recurrenceGroupId + occurrenceIndex。
 * - 循环锚点：按完成顺延（completion）。完成一次后自动排下一次。
 * - 粒度：循环间隔支持到 分钟/小时/天/周/月/年。
 */
import dayjs, { type Dayjs } from 'dayjs'
import type { RecurrenceRule, RecurrenceUnit, WorkspaceTask } from '@/types'

const genId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

function addUnit(date: Dayjs, value: number, unit: RecurrenceUnit): Dayjs {
  switch (unit) {
    case 'minute': return date.add(value, 'minute')
    case 'hour': return date.add(value, 'hour')
    case 'day': return date.add(value, 'day')
    case 'week': return date.add(value, 'week')
    case 'month': return date.add(value, 'month')
    case 'year': return date.add(value, 'year')
    default: return date.add(value, 'day')
  }
}

/** 解析 'HH:mm' 为 [时, 分]，缺省 09:00 */
function parseTime(t?: string): [number, number] {
  const m = /^\s*(\d{1,2}):(\d{1,2})\s*$/.exec(t ?? '')
  if (m) return [Math.min(23, +m[1]), Math.min(59, +m[2])]
  return [9, 0]
}

/** 计算所有发生点的「开始时间」(Date[]) —— 定期 与 循环(date锚点) 预生成用；循环(完成锚点) 不调用本函数 */
export function computeOccurrenceStarts(
  rule: RecurrenceRule,
  fromIso: string,
  toIso: string,
  maxCount: number,
): Date[] {
  const from = dayjs(fromIso)
  const to = dayjs(toIso)
  const out: Date[] = []
  if (rule.kind === 'cyclic' && rule.anchor === 'completion') return out

  const [h, m] = parseTime(rule.time)
  const interval = Math.max(1, rule.interval ?? 1)
  let cursor = dayjs(rule.startDate)

  // 循环(date 锚点)：按 everyValue/everyUnit 步进
  if (rule.kind === 'cyclic') {
    const unit = rule.everyUnit ?? 'day'
    const val = Math.max(1, rule.everyValue ?? 1)
    while (cursor.isBefore(to) && out.length < maxCount) {
      if (!cursor.isBefore(from)) out.push(cursor.toDate())
      cursor = addUnit(cursor, val, unit)
    }
    return out
  }

  // 定期：按 freq 步进
  const stepUnit: RecurrenceUnit =
    rule.freq === 'daily' ? 'day' : rule.freq === 'weekly' ? 'week' : rule.freq === 'monthly' ? 'month' : 'year'
  const monthDay = rule.monthDay ?? cursor.date()
  while (cursor.isBefore(to) && out.length < maxCount) {
    let occ = cursor.hour(h).minute(m).second(0).millisecond(0)
    if (rule.freq === 'monthly') {
      const dim = Math.min(monthDay, cursor.daysInMonth())
      occ = occ.date(dim)
    }
    let ok = true
    if (rule.freq === 'weekly') ok = (rule.weekdays ?? [cursor.day()]).includes(occ.day())
    if (ok && !occ.isBefore(from)) out.push(occ.toDate())
    cursor = addUnit(cursor, interval, stepUnit)
  }
  return out
}

/** 由基准任务（首次发生的字段来源）按规则实体复制出所有子任务（含首次，index 0） */
export function materializeRecurrence(
  base: WorkspaceTask,
  rule: RecurrenceRule,
  opts: { now?: Dayjs; windowDays?: number; maxCount?: number } = {},
): WorkspaceTask[] {
  const now = opts.now ?? dayjs()
  const windowDays = opts.windowDays ?? 180
  const maxCount = Math.min(opts.maxCount ?? rule.count ?? 200, 200)
  const groupId = base.recurrenceGroupId || genId('rec')

  const starts: Date[] =
    rule.kind === 'cyclic' && rule.anchor === 'completion'
      ? [dayjs(rule.startDate).toDate()] // 完成锚点：仅生成首次，后续在完成后续生成
      : computeOccurrenceStarts(rule, rule.startDate, rule.endDate ?? now.add(windowDays, 'day').toISOString(), maxCount)

  const baseStart = base.startAt ? dayjs(base.startAt) : null
  const baseEnd = base.endAt ? dayjs(base.endAt) : null
  const durationMin = baseStart && baseEnd ? baseEnd.diff(baseStart, 'minute') : 60

  return starts.map((s, i) => {
    const start = dayjs(s)
    const end = start.add(durationMin, 'minute')
    const child: WorkspaceTask = {
      ...base,
      id: i === 0 ? base.id : genId(base.kind === 'plan' ? 'plan' : 'task'),
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      dueAt: end.toISOString(),
      recurrence: rule,
      recurrenceGroupId: groupId,
      occurrenceIndex: i,
      occurrenceDate: start.format('YYYY-MM-DD'),
      status: 'todo',
      completedAt: null,
      startedAt: null,
    }
    return child
  })
}

/** 循环(完成锚点)任务完成后，计算下一次子任务；不满足条件返回 null */
export function nextCyclicChild(
  completedChild: WorkspaceTask,
  group: WorkspaceTask[],
): WorkspaceTask | null {
  const rule = completedChild.recurrence
  if (!rule || rule.kind !== 'cyclic' || rule.anchor !== 'completion') return null
  const unit = rule.everyUnit ?? 'day'
  const val = Math.max(1, rule.everyValue ?? 1)
  const anchor = completedChild.completedAt ? dayjs(completedChild.completedAt) : dayjs()
  const nextStart = addUnit(anchor, val, unit)

  if (rule.endDate && nextStart.isAfter(dayjs(rule.endDate))) return null
  const maxIndex = group.reduce((mx, t) => Math.max(mx, t.occurrenceIndex ?? 0), -1)
  const nextIndex = (completedChild.occurrenceIndex ?? 0) + 1
  if (rule.count != null && nextIndex >= rule.count) return null
  if (nextIndex <= maxIndex) return null

  const baseStart = completedChild.startAt ? dayjs(completedChild.startAt) : null
  const baseEnd = completedChild.endAt ? dayjs(completedChild.endAt) : null
  const durationMin = baseStart && baseEnd ? baseEnd.diff(baseStart, 'minute') : 60
  const end = nextStart.add(durationMin, 'minute')

  return {
    ...completedChild,
    id: genId(completedChild.kind === 'plan' ? 'plan' : 'task'),
    startAt: nextStart.toISOString(),
    endAt: end.toISOString(),
    dueAt: end.toISOString(),
    recurrence: rule,
    recurrenceGroupId: completedChild.recurrenceGroupId ?? null,
    occurrenceIndex: nextIndex,
    occurrenceDate: nextStart.format('YYYY-MM-DD'),
    status: 'todo',
    completedAt: null,
    startedAt: null,
    approvalStatus: 'none',
    proposalStatus: 'none',
    completion: null,
  }
}
