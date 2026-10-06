/**
 * 职责：service 桶文件 —— 统一导出配置、client 与各领域服务。
 * 页面统一从 `@/services` 取用，不直接依赖具体文件路径。
 */
export * from './config'
export * from './client'
export * from './cache'
export * from './connectivity'
export * as authService from './auth.service'
export * as taskService from './task.service'
export * as projectService from './project.service'
export * as focusService from './focus.service'
export * as auditService from './audit.service'
export * as summaryService from './summary.service'

export type { LoginResult } from './auth.service'
export type {
  TaskDetail,
  CommentMention,
  UploadAttachmentInput,
  UndoCompletionInput,
  WithdrawCompletionInput,
  SubmitItemInput,
  CreateTaskInput,
} from './task.service'
export type { ProjectCardData, ProjectFilter, BoardColumn, CreateProjectInput } from './project.service'
export type { SubmitAuditInput, SubmitAuditAction } from './audit.service'
export type {
  TodayFocusData,
  CalendarBlock,
  FreeSlot,
  CalendarDay,
  CreatePersonalTaskInput,
  UpdatePersonalTaskInput,
  SchedulePersonalTaskInput,
} from './focus.service'

// ── 常量与选项的扁平导出（页面按需引用，避免深层路径） ──────────────
export { CALENDAR_START_HOUR, CALENDAR_END_HOUR, CALENDAR_HOUR_HEIGHT } from './focus.service'
export { PROJECT_FILTER_OPTIONS, PROJECT_STATUS_TEXT } from './project.service'
export { todayAt } from './task.service'
