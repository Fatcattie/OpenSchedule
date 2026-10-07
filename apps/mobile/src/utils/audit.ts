/**
 * 职责：审核域**派生纯函数** + 四栏筛选 + 意见 / 状态元数据（增量 7，ARCH §4.2 / §4.4）。
 *
 * 设计原则：**纯函数、不落库、不改写既有字段** ⇒ 对既有 38 套件零回归。
 * 对标基准：`apps/web/src/pages/AuditPage.tsx`（:50-70 意见与相关性 · :107-143 四栏筛选）。
 * 本文件仅依赖 `@/types` 与 `@/theme`（配色 token），保持纯函数、可独立测试。
 */
import type { AuditAction, AuditLog, AuditOpinion, Task } from '@/types'
import type { ThemeColors } from '@/theme'
import { translateCurrent } from '@/i18n/current'

/** web 语义的审核状态（四值，对齐 `apps/web/src/types/task.ts:172`） */
export type ApprovalStatus = 'none' | 'pending' | 'approved' | 'rejected'
/** 待审事项类型（D2 范围仅两类；proposal = 新事项提报，completion = 完成提报） */
export type ApprovalType = 'proposal' | 'completion' | null

/** 日期区间（起 / 止，ISO8601；null 表示该端不限） */
export interface DateRange {
  from: string | null
  to: string | null
}

/** 审核意见选项（逐字对齐 `AuditPage.tsx:50-55`） */
export const OPINION_OPTIONS: { value: AuditOpinion; label: string }[] = [
  { value: 'agree', label: '同意' },
  { value: 'reject', label: '不通过' },
  { value: 'rework', label: '退回重改' },
  { value: 'other', label: '其他' },
]

/**
 * 审核意见元数据（标签 + 配色）。
 *
 * 增量 10（C2）：由模块级常量改为**函数**，接收当前生效色板（浅 / 深）⇒ 深色下取提亮色。
 * 调用方（`AuditLogItem`）传 `useThemeColors()`；非组件场景可传 `lightColors` 兜底。
 *
 * @param colors 当前生效色板（`ThemeColors`）
 */
export function opinionMeta(colors: ThemeColors): Record<AuditOpinion, { label: string; color: string }> {
  // 标签复用领域字典 `auditOpinion.*`（zh 值派生自 `OPINION_OPTIONS`，与改造前逐字一致）。
  return {
    agree: { label: translateCurrent('auditOpinion.agree'), color: colors.success },
    reject: { label: translateCurrent('auditOpinion.reject'), color: colors.danger },
    rework: { label: translateCurrent('auditOpinion.rework'), color: colors.warning },
    other: { label: translateCurrent('auditOpinion.other'), color: colors.text.secondary },
  }
}

/**
 * 卡片三枚审批动作的**显示文案**（审核中心 / 今日聚焦**共用单一事实来源**，避免两处分叉）。
 * 与 `OPINION_OPTIONS` 的「不通过」「退回重改」逐字一致。
 */
export const REVIEW_ACTION_LABEL = {
  approve: '通过',
  reject: '不通过',
  rework: '退回重改',
} as const

/**
 * 卡片三枚审批动作的 `accessibilityLabel`（**带「审核」前缀，与显示文案分离**）。
 *
 * 分离原因：抽屉内的「审核动作 / 审核意见」选项与卡片按钮显示文案可能同名；若
 * accessibilityLabel 沿用显示文案，抽屉打开后按标签定位会**同时命中卡片按钮与抽屉选项**
 * （自动化用例不稳）。加「审核」前缀后全树唯一。
 */
export const REVIEW_ACTION_A11Y = {
  approve: '审核通过',
  reject: '审核不通过',
  rework: '审核退回重改',
} as const

/** 审核状态中文文案 */
export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  none: '未提交',
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
}

/** 审核动作中文文案 */
export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  approve: '通过',
  reject: '驳回',
  withdraw: '撤回',
}

/**
 * 审核状态（映射移动端字段 → web 四值）：
 *  - `isReviewTask === true`            → `'none'`（评审子任务本身不走提报审核）
 *  - `submissionStatus === 'pending'`   → `'pending'`
 *  - `submissionStatus === 'approved'`  → `'approved'`
 *  - `submissionStatus === 'rejected'`  → `'rejected'`
 *  - 其余（null / undefined / draft / withdrawn）→ `'none'`
 */
export function deriveApprovalStatus(
  task: Pick<Task, 'submissionStatus' | 'isReviewTask'>,
): ApprovalStatus {
  if (task.isReviewTask === true) return 'none'
  switch (task.submissionStatus) {
    case 'pending':
      return 'pending'
    case 'approved':
      return 'approved'
    case 'rejected':
      return 'rejected'
    default:
      return 'none'
  }
}

/**
 * 待审事项类型（仅 D2 两类）：
 *  - `source === 'submission' && submissionKind != null` → `'proposal'`（新事项提报）
 *  - 其余（含完成提报）                                  → `'completion'`
 */
export function deriveApprovalType(task: Pick<Task, 'source' | 'submissionKind'>): ApprovalType {
  if (task.source === 'submission' && task.submissionKind != null) return 'proposal'
  return 'completion'
}

/**
 * 是否处于「待评审」语义（展示与门禁用）：
 * `reviewRequired === true && isReviewTask !== true && submissionStatus === 'pending'`
 * （严格对齐后端 `tasks.service.ts:340` 的 needsReview 公式）。
 */
export function derivePendingReview(
  task: Pick<Task, 'reviewRequired' | 'isReviewTask' | 'submissionStatus'>,
): boolean {
  return (
    task.reviewRequired === true &&
    task.isReviewTask !== true &&
    task.submissionStatus === 'pending'
  )
}

/**
 * 主任务是否可被审批通过（§5.3 门禁）：其**全部未取消的评审子任务**均已 `done`
 * （无评审子任务时为 true）。
 *
 * 增量 7.1（缺陷 E · ARCH §2.4.3）：`status === 'cancelled'` 的评审子任务视为**不阻塞**
 *   —— 「取消任务 = 放弃该评审项」。若不过滤，用户取消子任务后门禁将**永久 false**（审批死锁）。
 *
 * @param task     主任务（仅用其 id 关联子任务）
 * @param children 主任务的子任务集合（调用方从 `db.tasks` 过滤 `parentId === task.id`）
 */
export function canApproveMainTask(
  task: Pick<Task, 'id'>,
  children: Pick<Task, 'parentId' | 'isReviewTask' | 'status'>[],
): boolean {
  return children
    .filter(
      (child) =>
        child.parentId === task.id &&
        child.isReviewTask === true &&
        child.status !== 'cancelled',
    )
    .every((child) => child.status === 'done')
}

/** 相关任务口径（对齐 `AuditPage.tsx:65-70`；移动端 `Task` 无 participants 字段，省略该分支） */
export function isTaskRelated(
  task: Pick<Task, 'assigneeId' | 'createdBy'>,
  userId: string,
  isManager: boolean,
): boolean {
  if (isManager) return true
  return task.assigneeId === userId || task.createdBy === userId
}

/** 取任务**最后一条** `action === 'approve'` 的日志（无则 null） */
export function lastApproveLog(task: Pick<Task, 'auditLogs'>): AuditLog | null {
  const logs = task.auditLogs ?? []
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    if (logs[index].action === 'approve') return logs[index]
  }
  return null
}

/** ISO 时间是否落在区间内（起 / 止均可为 null = 不限） */
function inRange(iso: string, range: DateRange): boolean {
  const time = new Date(iso).getTime()
  if (range.from && time < new Date(range.from).getTime()) return false
  if (range.to && time > new Date(range.to).getTime()) return false
  return true
}

/**
 * 栏①「待提报」（**D6 宽口径**，对齐 `AuditPage.tsx:107-113`）：
 * `!isReviewTask ∧ status ∉ {done, cancelled} ∧ deriveApprovalStatus !== 'pending'`
 * ⇒ 已通过但未完成的任务会**同时**出现在「待提报」与「审核通过」两栏。
 * 排序：`dueAt` 升序（null 靠后）→ `createdAt` 升序。
 */
export function filterPendingReport(tasks: Task[]): Task[] {
  return tasks
    .filter(
      (task) =>
        task.isReviewTask !== true &&
        task.status !== 'done' &&
        task.status !== 'cancelled' &&
        deriveApprovalStatus(task) !== 'pending',
    )
    .slice()
    .sort((a, b) => {
      if (a.dueAt && b.dueAt && a.dueAt !== b.dueAt) return a.dueAt.localeCompare(b.dueAt)
      if (a.dueAt && !b.dueAt) return -1
      if (!a.dueAt && b.dueAt) return 1
      return a.createdAt.localeCompare(b.createdAt)
    })
}

/**
 * 栏②「待审核」：`deriveApprovalStatus(task) === 'pending'`（即 `submissionStatus === 'pending'`）。
 * 排序：`updatedAt` 降序。
 */
export function filterPendingAudit(tasks: Task[]): Task[] {
  return tasks
    .filter((task) => deriveApprovalStatus(task) === 'pending')
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/**
 * 栏③「审核通过」：`submissionStatus === 'approved'`，受**日期区间**筛选
 * （取最后一条 `action === 'approve'` 的 `createdAt`）。排序：`updatedAt` 降序。
 */
export function filterApproved(tasks: Task[], range: DateRange | null): Task[] {
  return tasks
    .filter((task) => task.submissionStatus === 'approved')
    .filter((task) => {
      if (!range) return true
      const last = lastApproveLog(task)
      if (!last) return false
      return inRange(last.createdAt, range)
    })
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/**
 * 栏④「撤回审核」：**日志流**（一条日志一个条目），遍历相关任务的 `auditLogs`，
 * 取 `action !== 'approve'`（`reject` 或 `withdraw`），受日期区间筛选。排序：`createdAt` 降序。
 */
export function filterWithdrawnLogs(
  tasks: Task[],
  range: DateRange | null,
): (AuditLog & { task: Task })[] {
  const logs: (AuditLog & { task: Task })[] = []
  for (const task of tasks) {
    for (const log of task.auditLogs ?? []) {
      if (log.action === 'approve') continue
      if (range && !inRange(log.createdAt, range)) continue
      logs.push({ ...log, task })
    }
  }
  return logs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
