/**
 * 职责：任务 / 评论 / 附件 DTO 与状态机常量（对齐 Prisma tasks 表 + Web 端 task.ts，ARCH §4）。
 */

/**
 * 任务状态六态。
 * 增量 7 新增 `pending_review`（「已完成提报、待审批」的存储态，对齐
 * `services/api/src/common/constants/task-status.ts:15` 的 `PENDING_REVIEW`，字符串逐字对齐）。
 */
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled' | 'pending_review'
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low'

/**
 * 提报状态（增量 1 扩展：新增 draft / withdrawn）。
 * 说明：`draft` 为本地编辑态（不落库），`db.tasks` 中实际仅存在 pending / approved / rejected / withdrawn。
 */
export type SubmissionStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'withdrawn'
/** 提报类型：新建项目 / 新建任务 */
export type SubmissionKind = 'project' | 'task'

/** 审核动作（驱动状态迁移，对齐 web `types/task.ts` 的 AuditLog.action） */
export type AuditAction = 'approve' | 'reject' | 'withdraw'
/** 审核意见（**仅留痕**，不影响状态，对齐 web `AuditPage.tsx:50-62`） */
export type AuditOpinion = 'agree' | 'reject' | 'rework' | 'other'

/** 结构化审核日志（挂 `Task.auditLogs`，「撤回审核」栏日志流消费） */
export interface AuditLog {
  id: string
  taskId: string
  action: AuditAction
  opinion: AuditOpinion
  reason: string
  /** 真实操作人（修正「取 reviewerIds[0]」的旧写法） */
  operatorId: string
  operatorName: string
  /** ISO8601 UTC */
  createdAt: string
}

export interface Task {
  id: string
  /** tasks.tenant_id（租户铁律） */
  tenantId: string
  /** 团队任务必填；个人任务走 personal_tasks */
  projectId: string | null
  /** 任务树（parent_id 表达层级，深度 ≤4） */
  parentId: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  /** NULL = 待领取（先到先得） */
  assigneeId: string | null
  /** 排期开始时间（日历排期用） */
  startAt?: string | null
  dueAt: string | null
  /** 排期结束时间（与 dueAt 同步） */
  endAt?: string | null
  /** numeric(6,1) */
  estimatedHours: number | null
  /** 实际工时 */
  actualHours: number | null
  /** 完成时间（准时率数据源） */
  completedAt: string | null
  /** 首次领取 / 开始时间 */
  startedAt: string | null
  createdBy: string
  tags: string[]
  /** 看板列内排序 */
  sortOrder: number
  /** 自定义列（Phase 2） */
  workflowColumnId: string | null
  /** AI 草稿落库标记 */
  isAiGenerated: boolean
  /** 乐观锁（冲突返回 40901） */
  version: number
  /** Phase 4 提报 / 评审扩展（可选） */
  source?: 'published' | 'submission'
  submissionStatus?: SubmissionStatus | null
  /** 提报类型（增量 1 新增）：区分「新建项目」与「新建任务」提报 */
  submissionKind?: SubmissionKind | null
  submissionNote?: string | null
  reviewNote?: string | null
  reviewRequired?: boolean
  isReviewTask?: boolean
  reviewerIds?: string[]
  /** 实际审核人（增量 1 新增） */
  reviewedBy?: string | null
  /** 审核时间（增量 1 新增，ISO8601 UTC） */
  reviewedAt?: string | null
  /** 结构化审核日志（增量 7 新增，可选；四栏「撤回审核」栏消费） */
  auditLogs?: AuditLog[]
  createdAt: string
  updatedAt: string
}

export interface TaskComment {
  id: string
  tenantId: string
  taskId: string
  authorId: string | null
  /** 回复串 */
  parentId: string | null
  content: string
  /** @解析结果 jsonb */
  mentions: unknown
  /** 关键决策标记 */
  isDecision: boolean
  createdAt: string
  updatedAt: string
}

export interface Attachment {
  id: string
  tenantId: string
  resourceType: 'task' | 'comment' | 'project'
  resourceId: string
  /** 对象存储 key */
  objectKey: string
  fileName: string
  mimeType: string
  sizeBytes: number
  uploaderId: string
  createdAt: string
}

/**
 * 状态迁移表（前端预渲染按钮，后端为权威）。
 * 非法迁移后端返 40902 + allowed_transitions。
 *
 * 增量 7 新增（对齐后端 `task-status.ts:203-232` 的 T10/T11/T12）：
 * - T10 `in_progress|blocked → pending_review`（`submit_review`）；
 * - T11 `pending_review → done`（`approve`）；
 * - T12 `pending_review → in_progress`（`reject`）；
 * - `pending_review → todo` 仅服务既有 `reopenTask`（目标恒 todo）路径，UI 不暴露。
 */
export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  todo: ['in_progress', 'blocked', 'cancelled'],
  in_progress: ['todo', 'done', 'blocked', 'cancelled', 'pending_review'],
  blocked: ['in_progress', 'done', 'cancelled', 'pending_review'],
  done: ['todo', 'in_progress'],
  cancelled: [],
  pending_review: ['done', 'in_progress', 'todo'],
}

/** 迁移动作的 UI 配置（按钮文案 + 是否需要原因 / 工时） */
export interface TransitionActionConfig {
  to: TaskStatus
  label: string
  /** 阻塞 / 取消 / 重开原因必填（≥4 字符） */
  requireReason?: boolean
  /** 完成须填 actual_hours */
  requireActualHours?: boolean
}

/** 迁移动作配置（与 TASK_TRANSITIONS 同源，供任务详情页渲染） */
export const TASK_TRANSITION_ACTIONS: Record<TaskStatus, TransitionActionConfig[]> = {
  todo: [
    { to: 'in_progress', label: '开始执行' },
    { to: 'blocked', label: '标记阻塞', requireReason: true },
    { to: 'cancelled', label: '取消任务', requireReason: true },
  ],
  in_progress: [
    { to: 'todo', label: '退回待办' },
    { to: 'done', label: '标记完成', requireActualHours: true },
    { to: 'blocked', label: '标记阻塞', requireReason: true },
    { to: 'cancelled', label: '取消任务', requireReason: true },
  ],
  blocked: [
    { to: 'in_progress', label: '解除阻塞' },
    { to: 'done', label: '标记完成', requireActualHours: true },
    { to: 'cancelled', label: '取消任务', requireReason: true },
  ],
  done: [
    { to: 'todo', label: '重开为待办', requireReason: true },
    { to: 'in_progress', label: '重开为进行中', requireReason: true },
  ],
  cancelled: [],
  // 刻意不暴露通用迁移动作：审批（通过/驳回）与撤回走「审核中心」专用入口
  // （`reviewSubmission` / `withdrawCompletionAndNotify`），不能经 `moveTask` 绕过审核留痕与门禁。
  // 与 `TASK_TRANSITIONS.pending_review` 不再严格双射，见 ARCH §2.2。
  pending_review: [],
}

/** 原因最小长度（≥4 字符） */
export const REASON_MIN_LENGTH = 4

/** 看板默认列（todo / in_progress / blocked / pending_review / done，M3：新增「待评审」列） */
export const BOARD_COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'todo', label: '待办' },
  { status: 'in_progress', label: '进行中' },
  { status: 'blocked', label: '已阻塞' },
  { status: 'pending_review', label: '待评审' },
  { status: 'done', label: '已完成' },
]

/** 状态迁移写操作入参（带乐观锁 version） */
export interface MoveTaskInput {
  status: TaskStatus
  sortOrder?: number
  /** 乐观锁，冲突 40901 */
  version: number
  /** 阻塞 / 取消原因（≥4 字符） */
  reason?: string
}

/** 完成任务入参（actual_hours 必填，落 completed_at） */
export interface CompleteTaskInput {
  summary?: string
  actualHours?: number
  version: number
}

/** 重开任务入参（重开原因必填） */
export interface ReopenTaskInput {
  reason: string
  version: number
}

/** 新增评论入参 */
export interface CreateCommentInput {
  content: string
  parentId?: string | null
}
