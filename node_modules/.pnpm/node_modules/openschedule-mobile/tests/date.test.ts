/**
 * 职责：utils/date.ts 单元测试 —— UTC → 用户时区换算、跨日边界、夏令时、非法输入兜底。
 * 依据 ARCH §10「时间处理」：存储/传输 ISO8601 UTC，渲染按 user.timezone 换算。
 */
import {
  FALLBACK_TIMEZONE,
  addDays,
  addMinutes,
  daysUntil,
  endOfDay,
  formatDate,
  formatDateTime,
  formatTime,
  formatWeekday,
  getZonedParts,
  isSameDayInTz,
  isToday,
  minutesBetween,
  minutesFromMidnight,
  nowIso,
  safeTimezone,
  startOfDay,
  toDate,
  toDateKey,
  todayKey,
} from '@/utils/date'

const SH = 'Asia/Shanghai'
const NY = 'America/New_York'

describe('safeTimezone —— 非法/空值兜底（R6）', () => {
  it('空值回落 Asia/Shanghai', () => {
    expect(safeTimezone(undefined)).toBe(FALLBACK_TIMEZONE)
    expect(safeTimezone(null)).toBe(FALLBACK_TIMEZONE)
    expect(safeTimezone('')).toBe(FALLBACK_TIMEZONE)
  })

  it('非法时区字符串回落 Asia/Shanghai', () => {
    expect(safeTimezone('Invalid/Zone')).toBe(FALLBACK_TIMEZONE)
    expect(safeTimezone('UTC+8')).toBe(FALLBACK_TIMEZONE)
  })

  it('合法时区原样返回', () => {
    expect(safeTimezone(SH)).toBe(SH)
    expect(safeTimezone(NY)).toBe(NY)
  })
})

describe('toDate —— 非法输入兜底为当前时刻', () => {
  it('非法字符串不返回 Invalid Date', () => {
    const result = toDate('not-a-date')
    expect(result).toBeInstanceOf(Date)
    expect(Number.isNaN(result.getTime())).toBe(false)
  })

  it('null / undefined 返回当前时刻附近', () => {
    const before = Date.now()
    expect(toDate(null).getTime()).toBeGreaterThanOrEqual(before - 1000)
    expect(toDate(undefined).getTime()).toBeGreaterThanOrEqual(before - 1000)
  })

  it('合法 ISO 与时间戳正确解析', () => {
    expect(toDate('2026-09-12T00:00:00.000Z').toISOString()).toBe('2026-09-12T00:00:00.000Z')
    expect(toDate(0).toISOString()).toBe('1970-01-01T00:00:00.000Z')
  })
})

describe('toDateKey / getZonedParts —— UTC → 用户时区跨日换算', () => {
  it('UTC 16:00 在上海为次日 00:00（跨日）', () => {
    expect(toDateKey('2026-09-12T16:00:00.000Z', SH)).toBe('2026-09-13')
  })

  it('同一时刻在纽约仍为当日（负偏移）', () => {
    expect(toDateKey('2026-09-12T16:00:00.000Z', NY)).toBe('2026-09-12')
  })

  it('午夜 24 → 0 归零（部分引擎 hour12:false 输出 24）', () => {
    const parts = getZonedParts(new Date('2026-09-11T16:00:00.000Z'), SH)
    expect(parts.hour).toBe(0)
    expect(parts.day).toBe(12)
  })

  it('getZonedParts 星期分量正确（2026-09-12 为周六）', () => {
    const parts = getZonedParts(new Date('2026-09-12T04:00:00.000Z'), SH)
    expect(parts.weekday).toBe(6)
  })
})

describe('夏令时边界（America/New_York 2026-03-08 春令开始）', () => {
  it('02:00 被跳过：06:30Z → 01:30，07:30Z → 03:30', () => {
    expect(formatTime('2026-03-08T06:30:00.000Z', NY)).toBe('01:30')
    expect(formatTime('2026-03-08T07:30:00.000Z', NY)).toBe('03:30')
  })

  it('跨 DST 仍能正确取日期键', () => {
    expect(toDateKey('2026-03-08T05:30:00.000Z', NY)).toBe('2026-03-08')
    expect(toDateKey('2026-03-08T04:30:00.000Z', NY)).toBe('2026-03-07')
  })
})

describe('格式化函数', () => {
  it('formatDate / formatTime / formatDateTime', () => {
    expect(formatDate('2026-09-12T04:30:00.000Z', SH)).toBe('9月12日')
    expect(formatTime('2026-09-12T04:30:00.000Z', SH)).toBe('12:30')
    expect(formatDateTime('2026-09-12T04:30:00.000Z', SH)).toBe('9月12日 12:30')
  })

  it('formatWeekday 中文星期', () => {
    expect(formatWeekday('2026-09-12T04:00:00.000Z', SH)).toBe('周六')
    expect(formatWeekday('2026-09-13T04:00:00.000Z', SH)).toBe('周日')
  })
})

describe('日界与偏移计算', () => {
  it('startOfDay / endOfDay 落在同一目标日', () => {
    const start = startOfDay('2026-09-12T04:30:00.000Z', SH)
    const end = endOfDay('2026-09-12T04:30:00.000Z', SH)
    expect(toDateKey(start, SH)).toBe('2026-09-12')
    expect(toDateKey(end, SH)).toBe('2026-09-12')
    expect(end.getTime()).toBeGreaterThan(start.getTime())
    // 该日时长 24h - 1s
    expect(end.getTime() - start.getTime()).toBe(86_400_000 - 1000)
  })

  it('addDays / addMinutes 精确推进', () => {
    expect(toDateKey(addDays('2026-09-12T04:00:00.000Z', 3), SH)).toBe('2026-09-15')
    expect(minutesBetween('2026-09-12T00:00:00.000Z', '2026-09-12T01:30:00.000Z')).toBe(90)
    expect(addMinutes('2026-09-12T00:00:00.000Z', 45).toISOString()).toBe('2026-09-12T00:45:00.000Z')
  })

  it('daysUntil 正负与 0', () => {
    const now = new Date()
    expect(daysUntil(now, SH)).toBe(0)
    expect(daysUntil(addDays(now, 2), SH)).toBe(2)
    expect(daysUntil(addDays(now, -1), SH)).toBe(-1)
  })

  it('isSameDayInTz / isToday', () => {
    const now = new Date()
    expect(isToday(now, SH)).toBe(true)
    expect(isSameDayInTz(now, addDays(now, 1), SH)).toBe(false)
  })

  it('minutesFromMidnight 时间轴定位（08:00 → 480）', () => {
    // 上海 08:00 == UTC 00:00
    expect(minutesFromMidnight('2026-09-12T00:00:00.000Z', SH)).toBe(480)
    expect(minutesFromMidnight('2026-09-12T04:30:00.000Z', SH)).toBe(750)
  })

  it('todayKey 为 10 位日期键', () => {
    expect(todayKey(SH)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('nowIso 为合法 ISO8601', () => {
    // 只取一次，避免两次调用跨毫秒导致的偶发失败
    const value = nowIso()
    expect(new Date(value).toISOString()).toBe(value)
  })
})
