/**
 * 职责：领域扩展 DTO —— 工时 / 个人任务 / AI 提议 / 通知 / 通知偏好 / 任务依赖 / 团队动态（ARCH §4）。
 */
import type { TaskPriority, TaskStatus } from './task'

/** 工时记录（time_entries） */
export interface TimeEntry {
  id: string
  tenantId: string
  taskId: string
  /** 计时人 */
  userId: string
  startedAt: string
  endedAt: string | null
  /** 冗余存，便于统计 */
  durationSeconds: number | null
  note: string | null
}

/** 个人任务（personal_tasks） */
export interface PersonalTask {
  id: string
  tenantId: string
  /** 属主 */
  userId: string
  parentId: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  startAt: string | null
  endAt: string | null
  dueAt: string | null
  estimatedHours: number | null
  actualHours: number | null
  completedAt: string | null
  tags: string[]
  sortOrder: number
  /** 团队任务提升 / 关联预留 */
  linkedTaskId: string | null
  createdAt: string
  updatedAt: string
}

export type AiProposalType = 'decompose' | 'evaluate' | 'emergency' | 'execute' | 'weekly_report'
export type AiProposalStatus = 'pending' | 'approved' | 'rejected' | 'applied' | 'expired'

/** AI 提议草稿载荷（decompose 正式 schema） */
export interface AiProposalPayload {
  version: number
  summary: string
  tasks: { title: string; description: string; estimatedHours: number; priority: string }[]
  warnings: string[]
}

/** AI 提议与现状对比摘要 */
export interface AiProposalDiffSummary {
  add: string[]
  update: { taskIdx: number; changedFields: string[] }[]
  remove: string[]
}

/** AI 提议（ai_proposals，独立状态机 pending → approved → applied/rejected/expired） */
export interface AiProposal {
  id: string
  tenantId: string
  type: AiProposalType
  status: AiProposalStatus
  payload: AiProposalPayload
  diffSummary: AiProposalDiffSummary | null
  proposerId: string | null
  approverId: string | null
  approvedAt: string | null
  rejectReason: string | null
  source: string
  relatedProjectId: string | null
  relatedTaskId: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

/** AI 提议类型中文文案 */
export const AI_PROPOSAL_TYPE_LABEL: Record<AiProposalType, string> = {
  decompose: 'AI 拆解提议',
  evaluate: '智能评估',
  emergency: '应急调整',
  execute: '执行建议',
  weekly_report: '周报摘要',
}

/** 通知（notifications） */
export interface NotificationItem {
  id: string
  tenantId: string
  /** 接收人 */
  userId: string
  /** task.assigned / mention / deadline_approaching / ai.proposal / task.completed / review.result / review.pending / review.withdrawn */
  type: string
  title: string
  body: string | null
  /** 跳转参数（taskId 等） */
  data: { taskId?: string } | null
  channel: 'in_app' | 'email' | 'push' | 'im'
  status: 'pending' | 'sent' | 'failed' | 'read'
  readAt: string | null
  createdAt: string
}

/** 通知偏好（notification_preferences） */
export interface NotificationPreference {
  id: string
  tenantId: string
  userId: string
  /** 事件类型（支持通配默认项） */
  eventType: string
  channels: { email: boolean; push: boolean; im: boolean }
  /** 免打扰时段 */
  quietHours: { days: number[]; start: string; end: string }[] | null
  createdAt: string
  updatedAt: string
}

/** 通知偏好事件类型中文文案 */
export const NOTIFICATION_EVENT_LABEL: Record<string, string> = {
  'task.assigned': '任务指派',
  mention: '@提及',
  deadline_approaching: '临期提醒',
  'ai.proposal': 'AI 提议',
  'task.completed': '任务完成',
  'review.result': '审核结果',
  'review.pending': '待审核提醒',
  'review.withdrawn': '撤回提醒',
}

/** 任务依赖（task_dependencies） */
export interface TaskDependency {
  id: string
  tenantId: string
  projectId: string | null
  prevTaskId: string
  nextTaskId: string
  /** FS / SS / FF / SF */
  type: 'FS' | 'SS' | 'FF' | 'SF'
  lagDays: number
  /** 共享子任务 / 公共前置标记 */
  isShared: boolean
  createdAt: string
  prevTask?: { id: string; title: string; status: string }
  nextTask?: { id: string; title: string; status: string }
}

/** 依赖类型中文文案 */
export const DEPENDENCY_TYPE_LABEL: Record<TaskDependency['type'], string> = {
  FS: '完成-开始',
  SS: '开始-开始',
  FF: '完成-完成',
  SF: '开始-完成',
}

/** 团队动态（由 audit_logs 只读聚合） */
export interface AuditFeedItem {
  id: string
  action: string
  actorId: string
  actorName: string
  resourceType: string
  resourceId: string | null
  summary: string
  createdAt: string
}
