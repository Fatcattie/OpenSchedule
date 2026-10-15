/**
 * busy-free.ts —— 忙闲时间计算（纯函数）
 *
 * 核心能力：
 * 1. 从忙时段反推空闲时段
 * 2. 按工作时间过滤（9:00-18:00）
 * 3. 最小时长过滤
 * 4. 多人共同空闲时间
 * 5. 单日负载比例计算
 */

export interface Interval {
  start: Date
  end: Date
  summary?: string
  status?: 'busy' | 'free' | 'tentative'
}

export interface WorkHours {
  startHour: number  // 9
  endHour: number    // 18
}

export interface DateRange {
  start: Date
  end: Date
}

/**
 * 给定一组忙碌时段，反推一天内的空闲时段
 * @param busyIntervals 忙碌时段（会被裁剪到工作时间内排序合并）
 * @param workHours 工作时间
 * @param day 哪一天（取年月日部分）
 * @param minDurationMinutes 最少空闲时长（分钟）
 */
export function findFreeSlotsForDay(
  busyIntervals: Interval[],
  workHours: WorkHours,
  day: Date,
  minDurationMinutes: number = 30,
): Interval[] {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), workHours.startHour, 0, 0, 0)
  const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), workHours.endHour, 0, 0, 0)

  // 1. 裁剪到当天工作时间内
  const clipped: Interval[] = []
  for (const b of busyIntervals) {
    const s = new Date(Math.max(b.start.getTime(), dayStart.getTime()))
    const e = new Date(Math.min(b.end.getTime(), dayEnd.getTime()))
    if (s < e) {
      clipped.push({ start: s, end: e, summary: b.summary, status: b.status })
    }
  }

  // 2. 按开始时间排序
  clipped.sort((a, b) => a.start.getTime() - b.start.getTime())

  // 3. 合并重叠
  const merged: Interval[] = []
  for (const b of clipped) {
    if (merged.length === 0 || b.start.getTime() > merged[merged.length - 1].end.getTime()) {
      merged.push({ ...b })
    } else {
      merged[merged.length - 1].end = new Date(
        Math.max(merged[merged.length - 1].end.getTime(), b.end.getTime())
      )
    }
  }

  // 4. 反推空闲
  const free: Interval[] = []
  let cursor = dayStart.getTime()

  for (const b of merged) {
    const bStart = b.start.getTime()
    if (bStart > cursor) {
      const gapMin = (bStart - cursor) / 60000
      if (gapMin >= minDurationMinutes) {
        free.push({
          start: new Date(cursor),
          end: new Date(bStart),
          status: 'free',
        })
      }
    }
    cursor = Math.max(cursor, b.end.getTime())
  }

  // 收尾：最后一段到 dayEnd
  if (cursor < dayEnd.getTime()) {
    const gapMin = (dayEnd.getTime() - cursor) / 60000
    if (gapMin >= minDurationMinutes) {
      free.push({
        start: new Date(cursor),
        end: new Date(dayEnd),
        status: 'free',
      })
    }
  }

  return free
}

/**
 * 计算日期范围内每天的空闲时段
 */
export function findFreeSlots(
  busyIntervals: Interval[],
  workHours: WorkHours,
  dateRange: DateRange,
  minDurationMinutes: number = 30,
): { date: string; slots: Interval[] }[] {
  const result: { date: string; slots: Interval[] }[] = []
  const startDay = new Date(dateRange.start.getFullYear(), dateRange.start.getMonth(), dateRange.start.getDate())
  const endDay = new Date(dateRange.end.getFullYear(), dateRange.end.getMonth(), dateRange.end.getDate())

  let cur = new Date(startDay)
  while (cur <= endDay) {
    const dateStr = formatDate(cur)
    const slots = findFreeSlotsForDay(busyIntervals, workHours, cur, minDurationMinutes)
    result.push({ date: dateStr, slots })
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1)
  }

  return result
}

/**
 * 多人员共同空闲时段：找所有人都有空的时间段
 * 思路：把所有人的忙碌时段合并成一个"集体忙碌"集合，再反推
 */
export function findCommonFreeSlots(
  usersBusy: Record<string, Interval[]>,
  workHours: WorkHours,
  dateRange: DateRange,
  minDurationMinutes: number = 30,
): { date: string; slots: Interval[] }[] {
  // 把所有人的忙时段都合到一起
  const allBusy: Interval[] = []
  for (const intervals of Object.values(usersBusy)) {
    allBusy.push(...intervals)
  }
  return findFreeSlots(allBusy, workHours, dateRange, minDurationMinutes)
}

/**
 * 计算某人某天的负载比例（忙碌分钟 / 工作分钟）
 */
export function computeDayLoad(
  busyIntervals: Interval[],
  day: Date,
  workHours: WorkHours,
): { loadRatio: number; busyMinutes: number; totalWorkMinutes: number } {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), workHours.startHour, 0, 0, 0)
  const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), workHours.endHour, 0, 0, 0)
  const totalWorkMinutes = (workHours.endHour - workHours.startHour) * 60

  // 裁剪 + 合并
  const clipped: Interval[] = []
  for (const b of busyIntervals) {
    const s = new Date(Math.max(b.start.getTime(), dayStart.getTime()))
    const e = new Date(Math.min(b.end.getTime(), dayEnd.getTime()))
    if (s < e) clipped.push({ start: s, end: e })
  }
  clipped.sort((a, b) => a.start.getTime() - b.start.getTime())

  const merged: Interval[] = []
  for (const b of clipped) {
    if (merged.length === 0 || b.start.getTime() > merged[merged.length - 1].end.getTime()) {
      merged.push({ ...b })
    } else {
      merged[merged.length - 1].end = new Date(
        Math.max(merged[merged.length - 1].end.getTime(), b.end.getTime())
      )
    }
  }

  let busyMinutes = 0
  for (const b of merged) {
    busyMinutes += (b.end.getTime() - b.start.getTime()) / 60000
  }

  const loadRatio = totalWorkMinutes > 0 ? busyMinutes / totalWorkMinutes : 0
  return {
    loadRatio: Math.min(1, Math.max(0, loadRatio)),
    busyMinutes: Math.round(busyMinutes),
    totalWorkMinutes,
  }
}

/**
 * 批量计算多天的负载
 */
export function computeDayLoads(
  busyIntervals: Interval[],
  dateRange: DateRange,
  workHours: WorkHours,
): { date: string; loadRatio: number; busyMinutes: number; totalWorkMinutes: number }[] {
  const result = []
  const startDay = new Date(dateRange.start.getFullYear(), dateRange.start.getMonth(), dateRange.start.getDate())
  const endDay = new Date(dateRange.end.getFullYear(), dateRange.end.getMonth(), dateRange.end.getDate())

  let cur = new Date(startDay)
  while (cur <= endDay) {
    const dateStr = formatDate(cur)
    const load = computeDayLoad(busyIntervals, cur, workHours)
    result.push({ date: dateStr, ...load })
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1)
  }

  return result
}

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
