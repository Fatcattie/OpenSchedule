/**
 * 职责：语义色双套（增量 10 · C1 / D8）—— 任务状态标签配色与优先级色条。
 *
 * 浅色集（`light*`）= 改造前 `theme/index.ts` 的 `statusColor` / `priorityColor`（值逐字节冻结）；
 * 深色集（`dark*`）= 附录 A。`ThemeProvider` 按生效方案下发对应集合。
 *
 * 取色函数分两组：
 * - `getStatusStyle` / `getPriorityColor`：**1 参，默认浅色**（保持与既有实现完全一致的签名与行为，
 *   供 `overview.ts` 默认参数与旧引用 / 测试兜底，见 L4）。
 * - `getStatusStyleFor` / `getPriorityColorFor`：**带 map 入参**，供组件传入运行时色表。
 */
import type { TaskPriority, TaskStatus } from '@/types'

/** 状态标签配色：8% 淡底 + 同色系深字（§3.1 / §3.7-10） */
export interface StatusStyle {
  /** 主色（深字 / 圆点 / 进度） */
  color: string
  /** 淡底 */
  bg: string
  /** 中文文案 */
  label: string
}

/** 任务状态 → 配色 + 文案（浅色，= 改造前 `statusColor`，值逐字节冻结） */
export const lightStatusColor: Record<TaskStatus, StatusStyle> = {
  todo: { color: '#6B7280', bg: '#F1F3F7', label: '待办' },
  in_progress: { color: '#2E4470', bg: '#EAEEF5', label: '进行中' },
  blocked: { color: '#C8871B', bg: '#FBF3E2', label: '已阻塞' },
  done: { color: '#2F9E6E', bg: '#E7F5EE', label: '已完成' },
  cancelled: { color: '#9AA1AE', bg: '#F1F3F7', label: '已取消' },
  pending_review: { color: '#C8871B', bg: '#FBF3E2', label: '待评审' },
}

/** 任务状态 → 配色 + 文案（深色，附录 A；color 提亮 + bg 低明度同色相底） */
export const darkStatusColor: Record<TaskStatus, StatusStyle> = {
  todo: { color: '#A6ADBB', bg: '#1E2634', label: '待办' },
  in_progress: { color: '#6E93E0', bg: '#1B2740', label: '进行中' },
  blocked: { color: '#E0A33A', bg: '#2B2313', label: '已阻塞' },
  done: { color: '#3DBE8B', bg: '#13291F', label: '已完成' },
  cancelled: { color: '#7A8291', bg: '#1E2634', label: '已取消' },
  pending_review: { color: '#E0A33A', bg: '#2B2313', label: '待评审' },
}

/** 优先级 → 主色（用于卡片左侧 3px 色条；浅色，= 改造前 `priorityColor`，值逐字节冻结） */
export const lightPriorityColor: Record<TaskPriority, string> = {
  urgent: '#C24A4A',
  high: '#C8871B',
  medium: '#2E4470',
  low: '#9AA1AE',
}

/** 优先级 → 主色（深色，附录 A；统一提亮） */
export const darkPriorityColor: Record<TaskPriority, string> = {
  urgent: '#E36B6B',
  high: '#E0A33A',
  medium: '#6E93E0',
  low: '#8A93A3',
}

/**
 * 取状态样式（**1 参，默认浅色**；未知状态兜底为 todo）。
 * 保持与既有实现完全一致的签名与行为（`overview.test.ts:84-91` 兼容）。
 */
export function getStatusStyle(status: TaskStatus): StatusStyle {
  return lightStatusColor[status] ?? lightStatusColor.todo
}

/** 取状态样式（运行时：传入生效的色表；未知状态兜底为 todo） */
export function getStatusStyleFor(status: TaskStatus, map: Record<TaskStatus, StatusStyle>): StatusStyle {
  return map[status] ?? map.todo
}

/**
 * 取优先级颜色（**1 参，默认浅色**；未知优先级兜底为 low）。
 * 保持与既有实现完全一致的签名与行为。
 */
export function getPriorityColor(priority: TaskPriority): string {
  return lightPriorityColor[priority] ?? lightPriorityColor.low
}

/** 取优先级颜色（运行时：传入生效的色表；未知优先级兜底为 low） */
export function getPriorityColorFor(priority: TaskPriority, map: Record<TaskPriority, string>): string {
  return map[priority] ?? map.low
}
