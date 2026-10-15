/**
 * 职责：时间容器「整周」概览视图的纯逻辑工具（Task #18）。
 * 整周视图需要在 390px 宽内一屏塞下 7 列（无横向滚动），列宽必须按容器可用宽度运行时等分；
 * 同时每列需展示紧凑日期、按状态着色、点击列定位到对应「日视图」。
 * 本文件只放无副作用纯函数，便于单测（列宽等分 / 紧凑日期 / 自然日差 / 状态配色）。
 */
import { lightColors, lightStatusColor, type StatusStyle, type ThemeColors } from '@/theme'
import type { TaskStatus } from '@/types'

/** 一天的毫秒数 */
const DAY_MS = 86_400_000

/**
 * 把日期键 `YYYY-MM-DD` 拆成「UTC 午夜」的毫秒数。
 * 关键：直接解析 Y/M/D 分量并用 Date.UTC 组装，**不经过 `new Date(dateKey)`**。
 * 后者会把 date-only 字符串按 UTC 解析，再在负偏移时区（如 America/New_York）反算时
 * 落到前一天，导致「自然日差」整体偏移 1 天。本实现只比较日历标签本身，与时区偏移无关。
 *
 * @param dateKey 目标时区下的日期键 `YYYY-MM-DD`
 * @returns UTC 午夜毫秒数；非法输入返回 NaN
 */
export function dateKeyToUtc(dateKey: string): number {
  const [yearText, monthText, dayText] = dateKey.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return Number.NaN
  return Date.UTC(year, month - 1, day)
}

/**
 * 两个日期键的自然日差（`a - b`，单位天）。
 * 仅比较日历标签，与时区无关，故对任意 user.timezone 都稳定。
 *
 * @param a 日期键 `YYYY-MM-DD`
 * @param b 日期键 `YYYY-MM-DD`
 * @returns 天数差（正数表示 a 晚于 b）；非法输入返回 0
 */
export function calendarDayDiff(a: string, b: string): number {
  const diff = dateKeyToUtc(a) - dateKeyToUtc(b)
  if (!Number.isFinite(diff)) return 0
  return Math.round(diff / DAY_MS)
}

/**
 * 把某列日期键换算为相对「今天」的 dayOffset，并**钳制**到 `[-range, range]`。
 * 钳制是防御性保证：即便未来 getCalendarWeek 返回的日期超出日视图导航范围，
 * 点击也不会「无反应」或越界（只会落到最近的可达日）。
 * 当前 getCalendarWeek 返回「今天起连续 7 天」（offset 0..6），全部落在 ±7 内，钳制为无操作。
 *
 * @param dateKey 目标列日期键 `YYYY-MM-DD`
 * @param todayDateKey 目标时区下的今天日期键
 * @param range 允许的最大前后偏移（天）
 */
export function resolveDayOffset(dateKey: string, todayDateKey: string, range: number): number {
  const raw = calendarDayDiff(dateKey, todayDateKey)
  const safeRange = Math.max(0, Math.floor(range))
  return Math.max(-safeRange, Math.min(safeRange, raw))
}

/**
 * 紧凑日期：`9/26`（整周视图窄列用，避免「9月26日」换行）。
 *
 * @param dateKey 日期键 `YYYY-MM-DD`
 * @returns `M/D`；非法输入原样返回
 */
export function formatCompactDate(dateKey: string): string {
  const [, monthText, dayText] = dateKey.split('-')
  const month = Number(monthText)
  const day = Number(dayText)
  if (!Number.isFinite(month) || !Number.isFinite(day)) return dateKey
  return `${month}/${day}`
}

/**
 * 整周视图 7 列等分列宽（按容器可用宽度运行时计算，不写死像素）。
 * 结果向下取整，保证 7 列 + 间距的总宽 **不超过** 可用宽度，
 * 从而在纵向 ScrollView 内绝不产生横向溢出 / 滚动。
 *
 * @param availableWidth 容器实测可用宽度（已扣除页面左右留白）
 * @param columnCount 列数（整周视图为 7）
 * @param gap 列间距
 */
export function computeOverviewColumnWidth(
  availableWidth: number,
  columnCount: number,
  gap: number,
): number {
  if (columnCount <= 0) return 0
  const safeWidth = Math.max(0, availableWidth)
  const safeGap = Math.max(0, gap)
  const totalGap = safeGap * (columnCount - 1)
  return Math.max(0, Math.floor((safeWidth - totalGap) / columnCount))
}

/**
 * 整周视图时间带内任务块的填充色：仅用颜色表达状态（列太窄不显示文字）。
 * `done` / `cancelled` 统一灰显；其余按 `statusColor` 取同色系主色。
 *
 * 增量 10（C3）：签名新增运行时色表入参（默认 = 浅色静态集，L4：测试以 1 参调用仍得浅色值）；
 * 组件（`OverviewBlock`）渲染时传 `useTheme()` 下发的运行时 `colors` / `statusColor`。
 *
 * @param status 任务状态
 * @param colors 当前生效色板（默认浅色）
 * @param statusColor 当前生效状态色表（默认浅色）
 */
export function overviewBarColor(
  status: TaskStatus,
  colors: ThemeColors = lightColors,
  statusColor: Record<TaskStatus, StatusStyle> = lightStatusColor,
): string {
  if (status === 'done' || status === 'cancelled') return colors.text.tertiary
  return statusColor[status]?.color ?? colors.text.tertiary
}
