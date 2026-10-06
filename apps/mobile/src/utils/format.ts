/**
 * 职责：展示格式化工具 —— 工时、时长、相对时间、文件大小、文本截断。
 */
import { formatDate, formatTime, isSameDayInTz, startOfDay, toDate } from './date'

/** 空值占位符 */
export const EMPTY_PLACEHOLDER = '—'

/** 工时格式化（紧凑）：4h / 1.5h / — */
export function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || Number.isNaN(hours)) return EMPTY_PLACEHOLDER
  const rounded = Math.round(hours * 10) / 10
  return `${rounded}h`
}

/** 工时格式化（完整）：4 小时 / 1.5 小时 / — */
export function formatHoursLong(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || Number.isNaN(hours)) return EMPTY_PLACEHOLDER
  const rounded = Math.round(hours * 10) / 10
  return `${rounded} 小时`
}

/** 计时器显示：HH:MM:SS（等宽字体配合使用，防跳动） */
export function formatTimer(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  const pad = (value: number) => (value < 10 ? `0${value}` : String(value))
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

/** 时长简短文案：1h23m / 23m / 45s */
export function formatDurationShort(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || Number.isNaN(totalSeconds)) {
    return EMPTY_PLACEHOLDER
  }
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  if (hours > 0) return `${hours}h${minutes > 0 ? `${minutes}m` : ''}`
  if (minutes > 0) return `${minutes}m`
  return `${safe}s`
}

/** 相对时间：刚刚 / 5 分钟前 / 2 小时前 / 昨天 / 3 天前 / 9月12日 */
export function formatRelativeTime(value: string | number | Date, timezone?: string | null): string {
  const target = toDate(value)
  const diffMs = Date.now() - target.getTime()
  const diffMinutes = Math.floor(diffMs / 60_000)

  if (diffMinutes < 1) return '刚刚'
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24 && isSameDayInTz(target, new Date(), timezone)) {
    return `${diffHours} 小时前`
  }

  // 按目标时区的日历日判断「昨天 / N 天前」
  const dayDiff = Math.round(
    (startOfDay(new Date(), timezone).getTime() - startOfDay(target, timezone).getTime()) / 86_400_000,
  )
  if (dayDiff === 1) return `昨天 ${formatTime(target, timezone)}`
  if (dayDiff > 1 && dayDiff < 7) return `${dayDiff} 天前`

  return formatDate(target, timezone)
}

/** 文件大小：1.2 MB / 340 KB / 512 B */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return EMPTY_PLACEHOLDER
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** 文本截断（超出补省略号） */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 1))}…`
}

/** 姓名取首字母（头像兜底，中文取末字，英文取首字母） */
export function initialsOf(name: string): string {
  const trimmed = (name || '').trim()
  if (!trimmed) return '?'
  if (/[\u4e00-\u9fa5]/.test(trimmed)) return trimmed.slice(-1)
  const first = trimmed.split(/\s+/)[0]
  return first.slice(0, 1).toUpperCase()
}

/** 空值兜底：返回占位符 */
export function orPlaceholder(value: string | null | undefined): string {
  return value && value.trim() ? value : EMPTY_PLACEHOLDER
}
