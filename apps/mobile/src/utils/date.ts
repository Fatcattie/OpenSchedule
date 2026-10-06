/**
 * 职责：时间处理工具 —— 存储 / 传输为 ISO8601 UTC，渲染统一按 user.timezone 换算（ARCH §10 / R6）。
 * 使用 Intl 实现，不引入 dayjs；时区非法或 Intl 异常时兜底固定按 Asia/Shanghai 渲染。
 */

/** 兜底时区（R6） */
export const FALLBACK_TIMEZONE = 'Asia/Shanghai'

/** 一天的毫秒数 */
const DAY_MS = 86_400_000

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const

const WEEKDAY_SHORT_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

/** Intl 格式化器缓存（按 timezone 复用，避免重复构造开销） */
const formatterCache = new Map<string, Intl.DateTimeFormat>()

/** 校验并返回安全时区；非法 / 空值回落到 Asia/Shanghai */
export function safeTimezone(timezone?: string | null): string {
  if (!timezone) return FALLBACK_TIMEZONE
  try {
    // 构造成功即视为合法时区
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date())
    return timezone
  } catch {
    return FALLBACK_TIMEZONE
  }
}

function getFormatter(timezone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timezone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    })
    formatterCache.set(timezone, formatter)
  }
  return formatter
}

/** 目标时区下的时间分量 */
export interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  /** 0=周日 … 6=周六 */
  weekday: number
}

/** 把 UTC 时刻拆解为目标时区的墙钟分量 */
export function getZonedParts(date: Date, timezone?: string | null): ZonedParts {
  const tz = safeTimezone(timezone)
  const parts = getFormatter(tz).formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '0'

  // 部分引擎在 hour12:false 下把午夜输出为 "24"，需归零
  const rawHour = Number(pick('hour'))
  const weekdayRaw = pick('weekday')

  return {
    year: Number(pick('year')),
    month: Number(pick('month')),
    day: Number(pick('day')),
    hour: rawHour === 24 ? 0 : rawHour,
    minute: Number(pick('minute')),
    second: Number(pick('second')),
    weekday: WEEKDAY_SHORT_INDEX[weekdayRaw] ?? 0,
  }
}

/** 目标时区相对 UTC 的偏移毫秒数（东八区为 +8h） */
function tzOffsetMs(date: Date, timezone: string): number {
  const parts = getZonedParts(date, timezone)
  const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return asUTC - (date.getTime() - date.getMilliseconds())
}

/** 把 ISO 字符串 / Date 归一化为 Date；非法输入返回当前时刻 */
export function toDate(value: string | number | Date | null | undefined): Date {
  if (value instanceof Date) return value
  if (typeof value === 'number') return new Date(value)
  if (typeof value === 'string') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return new Date()
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** 目标时区下的日期键：YYYY-MM-DD */
export function toDateKey(value: string | number | Date, timezone?: string | null): string {
  const parts = getZonedParts(toDate(value), timezone)
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`
}

/** 目标时区下的「今天」日期键 */
export function todayKey(timezone?: string | null): string {
  return toDateKey(new Date(), timezone)
}

/** 目标时区下的日期：9月12日 */
export function formatDate(value: string | number | Date, timezone?: string | null): string {
  const parts = getZonedParts(toDate(value), timezone)
  return `${parts.month}月${parts.day}日`
}

/** 目标时区下的完整日期：2026年9月12日 */
export function formatDateFull(value: string | number | Date, timezone?: string | null): string {
  const parts = getZonedParts(toDate(value), timezone)
  return `${parts.year}年${parts.month}月${parts.day}日`
}

/** 目标时区下的时间：14:30 */
export function formatTime(value: string | number | Date, timezone?: string | null): string {
  const parts = getZonedParts(toDate(value), timezone)
  return `${pad2(parts.hour)}:${pad2(parts.minute)}`
}

/** 目标时区下的日期 + 时间：9月12日 14:30 */
export function formatDateTime(value: string | number | Date, timezone?: string | null): string {
  return `${formatDate(value, timezone)} ${formatTime(value, timezone)}`
}

/** 目标时区下的星期文案：周五 */
export function formatWeekday(value: string | number | Date, timezone?: string | null): string {
  const parts = getZonedParts(toDate(value), timezone)
  return WEEKDAY_LABELS[parts.weekday]
}

/** 目标时区当日 00:00 对应的 UTC 时刻 */
export function startOfDay(value: string | number | Date, timezone?: string | null): Date {
  const tz = safeTimezone(timezone)
  const date = toDate(value)
  const parts = getZonedParts(date, tz)
  const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0)
  return new Date(asUTC - tzOffsetMs(new Date(asUTC), tz))
}

/** 目标时区当日 23:59:59 对应的 UTC 时刻 */
export function endOfDay(value: string | number | Date, timezone?: string | null): Date {
  return new Date(startOfDay(value, timezone).getTime() + DAY_MS - 1000)
}

/** 日期偏移 N 天（按绝对时间推进，跨夏令时场景足够精确） */
export function addDays(value: string | number | Date, days: number): Date {
  return new Date(toDate(value).getTime() + days * DAY_MS)
}

/** 分钟偏移 */
export function addMinutes(value: string | number | Date, minutes: number): Date {
  return new Date(toDate(value).getTime() + minutes * 60_000)
}

/** 目标时区下是否为同一天 */
export function isSameDayInTz(
  a: string | number | Date,
  b: string | number | Date,
  timezone?: string | null,
): boolean {
  return toDateKey(a, timezone) === toDateKey(b, timezone)
}

/** 目标时区下是否为今天 */
export function isToday(value: string | number | Date, timezone?: string | null): boolean {
  return isSameDayInTz(value, new Date(), timezone)
}

/**
 * 距目标时区「今天」的天数差（正数=未来，负数=过去，0=今天）。
 * 用当日 00:00 的 UTC 时刻做差，避免跨时区误差。
 */
export function daysUntil(value: string | number | Date, timezone?: string | null): number {
  const target = startOfDay(value, timezone).getTime()
  const today = startOfDay(new Date(), timezone).getTime()
  return Math.round((target - today) / DAY_MS)
}

/** 目标时区下距 00:00 的分钟数（时间轴定位用） */
export function minutesFromMidnight(value: string | number | Date, timezone?: string | null): number {
  const parts = getZonedParts(toDate(value), timezone)
  return parts.hour * 60 + parts.minute
}

/** 两个时刻相差的分钟数 */
export function minutesBetween(
  from: string | number | Date,
  to: string | number | Date,
): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 60_000)
}

/** 当前 ISO8601 UTC 字符串 */
export function nowIso(): string {
  return new Date().toISOString()
}

/** 分钟 / 小时 / 天的毫秒数（相对时间换算用） */
const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const RELATIVE_DAY_MS = 86_400_000

/**
 * 相对时间（增量 8 · A3，`StaleBadge` 展示「上次更新 X 前」用）：
 * `刚刚` / `X 分钟前` / `X 小时前` / `X 天前`。零依赖，`now` 可注入便于测试。
 */
export function formatRelativeTime(value: string | number | Date, now: number = Date.now()): string {
  const target = toDate(value).getTime()
  const diffMs = now - target
  if (diffMs < MINUTE_MS) return '刚刚'

  const diffMinutes = Math.floor(diffMs / MINUTE_MS)
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`

  const diffHours = Math.floor(diffMs / HOUR_MS)
  if (diffHours < 24) return `${diffHours} 小时前`

  const diffDays = Math.floor(diffMs / RELATIVE_DAY_MS)
  return `${diffDays} 天前`
}
