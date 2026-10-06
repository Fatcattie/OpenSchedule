/**
 * 职责：主题聚合导出 + 任务状态 / 优先级配色映射（ARCH §3.1）。
 * 页面与组件统一从本文件取用 token 与语义色，禁止在业务代码里硬编码颜色。
 *
 * 增量 10（深色模式）：语义色（`statusColor` / `priorityColor`）双套化，定义移至 `./semantic`。
 * 本文件保留 `colors` / `statusColor` / `priorityColor` 三个**浅色**兼容导出（L2），
 * 供测试与未迁移引用兜底；业务运行时请改用 `useTheme()` / `useThemeColors()` 与 `get*For`。
 */
import type { TaskPriority, TaskStatus } from '@/types'
import { lightPriorityColor, lightStatusColor, type StatusStyle } from './semantic'
import { colors, fontFamily, layout, motion, radius, shadow, spacing, tokens, typography } from './tokens'

export { colors, fontFamily, layout, motion, radius, shadow, spacing, tokens, typography }
export type { Tokens } from './tokens'
export { darkColors, lightColors } from './tokens'
export type { ThemeColors } from './tokens'

// 语义色双套 + 取色函数（增量 10 · 定义在 ./semantic）
export {
  darkPriorityColor,
  darkStatusColor,
  getPriorityColor,
  getPriorityColorFor,
  getStatusStyle,
  getStatusStyleFor,
  lightPriorityColor,
  lightStatusColor,
} from './semantic'
export type { StatusStyle } from './semantic'

/** 任务状态 → 配色 + 文案（浅色兼容导出，= `lightStatusColor`，L2） */
export const statusColor: Record<TaskStatus, StatusStyle> = lightStatusColor

/** 优先级 → 主色（浅色兼容导出，= `lightPriorityColor`，L2） */
export const priorityColor: Record<TaskPriority, string> = lightPriorityColor

/** 优先级 → 中文文案 */
export const priorityLabel: Record<TaskPriority, string> = {
  urgent: '紧急',
  high: '高',
  medium: '中',
  low: '低',
}

/** 看板列顺序（todo / in_progress / blocked / pending_review / done，M3 新增「待评审」列） */
export const boardColumnOrder: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'pending_review', 'done']
