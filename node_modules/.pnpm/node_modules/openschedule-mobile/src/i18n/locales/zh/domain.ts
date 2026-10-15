/**
 * 职责：zh 字典 —— 领域枚举词域（增量 12 · L0 · T01 独占）。
 *
 * ★ **同源派生（§2.9，F6 去重）**：本文件所有 zh 值**一律从既有集中式常量派生**，
 *   禁止手写第二遍 ⇒ 与常量零漂移。
 * ★ **派生方向单向**：只能「字典 ← 常量」；**禁止反向**（不得把常量改为引用字典）——
 *   `lightStatusColor` 被 `theme-contrast.test.ts` 深比较冻结，任何改动都会红。
 *
 * 覆盖：任务状态 / 看板列 / 迁移动作 / 角色 / 优先级 / 项目状态 / 提报状态与类型 /
 *       AI 提议类型 / 通知事件 / 依赖类型 / 审核动作 / 审批状态 / 审核意见。
 */

import { priorityLabel } from '@/theme'
import { lightStatusColor } from '@/theme/semantic'
import { AI_PROPOSAL_TYPE_LABEL, DEPENDENCY_TYPE_LABEL, NOTIFICATION_EVENT_LABEL } from '@/types/domain'
import { PROJECT_STATUS_LABEL } from '@/types/project'
import { BOARD_COLUMNS, TASK_TRANSITION_ACTIONS, type TaskStatus } from '@/types/task'
import { ROLE_LABEL } from '@/types/user'
import { APPROVAL_STATUS_LABEL, AUDIT_ACTION_LABEL, OPINION_OPTIONS, REVIEW_ACTION_LABEL } from '@/utils/audit'
import { SUBMISSION_KIND_LABEL, SUBMISSION_STATUS_LABEL } from '@/utils/submission'

/**
 * 去重收集 `TASK_TRANSITION_ACTIONS` 的 8 个**互异**动作文案（同源派生，F6）。
 *
 * 键语义（供 `TaskDetailScreen` 等消费）：
 * - `start`            ← `todo → in_progress`（开始执行）
 * - `block`            ← `todo → blocked`（标记阻塞，`in_progress → blocked` 同值）
 * - `cancel`           ← `in_progress → cancelled`（取消任务，多处同值）
 * - `returnTodo`       ← `in_progress → todo`（退回待办）
 * - `complete`         ← `in_progress → done`（标记完成，`blocked → done` 同值）
 * - `unblock`          ← `blocked → in_progress`（解除阻塞）
 * - `reopenTodo`       ← `done → todo`（重开为待办）
 * - `reopenInProgress` ← `done → in_progress`（重开为进行中）
 */
function deriveActionLabels(): Record<string, string> {
  const find = (from: TaskStatus, to: TaskStatus): string =>
    TASK_TRANSITION_ACTIONS[from].find((action) => action.to === to)?.label ?? ''
  return {
    start: find('todo', 'in_progress'),
    block: find('todo', 'blocked'),
    cancel: find('in_progress', 'cancelled'),
    returnTodo: find('in_progress', 'todo'),
    complete: find('in_progress', 'done'),
    unblock: find('blocked', 'in_progress'),
    reopenTodo: find('done', 'todo'),
    reopenInProgress: find('done', 'in_progress'),
  }
}

/** 8 个互异迁移动作文案（派生自 `TASK_TRANSITION_ACTIONS`） */
const actionLabels = deriveActionLabels()

/** 取审核意见文案（派生自 `OPINION_OPTIONS`，单一事实来源） */
const opinionLabel = (value: (typeof OPINION_OPTIONS)[number]['value']): string =>
  OPINION_OPTIONS.find((option) => option.value === value)?.label ?? ''

/** 领域枚举词字典（**全部键字面量**，值派生自既有常量；`as const` 保证键为字面量联合） */
export const domain = {
  // ── 任务状态（6，派生自 `lightStatusColor[*].label`）────────────────
  'taskStatus.todo': lightStatusColor.todo.label,
  'taskStatus.in_progress': lightStatusColor.in_progress.label,
  'taskStatus.blocked': lightStatusColor.blocked.label,
  'taskStatus.done': lightStatusColor.done.label,
  'taskStatus.cancelled': lightStatusColor.cancelled.label,
  'taskStatus.pending_review': lightStatusColor.pending_review.label,

  // ── 看板列（5，派生自 `lightStatusColor[*].label`；`BOARD_COLUMNS` 同值）──
  'boardColumn.todo': lightStatusColor.todo.label,
  'boardColumn.in_progress': lightStatusColor.in_progress.label,
  'boardColumn.blocked': lightStatusColor.blocked.label,
  'boardColumn.pending_review': lightStatusColor.pending_review.label,
  'boardColumn.done': lightStatusColor.done.label,

  // ── 迁移动作（8，派生自 `TASK_TRANSITION_ACTIONS`）──────────────────
  'taskAction.start': actionLabels.start,
  'taskAction.block': actionLabels.block,
  'taskAction.cancel': actionLabels.cancel,
  'taskAction.returnTodo': actionLabels.returnTodo,
  'taskAction.complete': actionLabels.complete,
  'taskAction.unblock': actionLabels.unblock,
  'taskAction.reopenTodo': actionLabels.reopenTodo,
  'taskAction.reopenInProgress': actionLabels.reopenInProgress,

  // ── 角色（2，派生自 `ROLE_LABEL`）───────────────────────────────────
  'role.manager': ROLE_LABEL.manager,
  'role.member': ROLE_LABEL.member,

  // ── 优先级（4，派生自 `theme.priorityLabel`）────────────────────────
  'priority.urgent': priorityLabel.urgent,
  'priority.high': priorityLabel.high,
  'priority.medium': priorityLabel.medium,
  'priority.low': priorityLabel.low,

  // ── 项目状态（3，派生自 `PROJECT_STATUS_LABEL`）─────────────────────
  'projectStatus.active': PROJECT_STATUS_LABEL.active,
  'projectStatus.archived': PROJECT_STATUS_LABEL.archived,
  'projectStatus.completed': PROJECT_STATUS_LABEL.completed,

  // ── 提报状态（5，派生自 `SUBMISSION_STATUS_LABEL`）──────────────────
  'submissionStatus.draft': SUBMISSION_STATUS_LABEL.draft,
  'submissionStatus.pending': SUBMISSION_STATUS_LABEL.pending,
  'submissionStatus.approved': SUBMISSION_STATUS_LABEL.approved,
  'submissionStatus.rejected': SUBMISSION_STATUS_LABEL.rejected,
  'submissionStatus.withdrawn': SUBMISSION_STATUS_LABEL.withdrawn,

  // ── 提报类型（2，派生自 `SUBMISSION_KIND_LABEL`）────────────────────
  'submissionKind.project': SUBMISSION_KIND_LABEL.project,
  'submissionKind.task': SUBMISSION_KIND_LABEL.task,

  // ── AI 提议类型（5，派生自 `AI_PROPOSAL_TYPE_LABEL`）────────────────
  'aiProposalType.decompose': AI_PROPOSAL_TYPE_LABEL.decompose,
  'aiProposalType.evaluate': AI_PROPOSAL_TYPE_LABEL.evaluate,
  'aiProposalType.emergency': AI_PROPOSAL_TYPE_LABEL.emergency,
  'aiProposalType.execute': AI_PROPOSAL_TYPE_LABEL.execute,
  'aiProposalType.weekly_report': AI_PROPOSAL_TYPE_LABEL.weekly_report,

  // ── 通知事件（8，派生自 `NOTIFICATION_EVENT_LABEL`）────────────────
  'notificationEvent.taskAssigned': NOTIFICATION_EVENT_LABEL['task.assigned'],
  'notificationEvent.mention': NOTIFICATION_EVENT_LABEL.mention,
  'notificationEvent.deadlineApproaching': NOTIFICATION_EVENT_LABEL.deadline_approaching,
  'notificationEvent.aiProposal': NOTIFICATION_EVENT_LABEL['ai.proposal'],
  'notificationEvent.taskCompleted': NOTIFICATION_EVENT_LABEL['task.completed'],
  'notificationEvent.reviewResult': NOTIFICATION_EVENT_LABEL['review.result'],
  'notificationEvent.reviewPending': NOTIFICATION_EVENT_LABEL['review.pending'],
  'notificationEvent.reviewWithdrawn': NOTIFICATION_EVENT_LABEL['review.withdrawn'],

  // ── 依赖类型（4，派生自 `DEPENDENCY_TYPE_LABEL`）────────────────────
  'dependencyType.FS': DEPENDENCY_TYPE_LABEL.FS,
  'dependencyType.SS': DEPENDENCY_TYPE_LABEL.SS,
  'dependencyType.FF': DEPENDENCY_TYPE_LABEL.FF,
  'dependencyType.SF': DEPENDENCY_TYPE_LABEL.SF,

  // ── 审核动作（3，派生自 `AUDIT_ACTION_LABEL`）──────────────────────
  'auditAction.approve': AUDIT_ACTION_LABEL.approve,
  'auditAction.reject': AUDIT_ACTION_LABEL.reject,
  'auditAction.withdraw': AUDIT_ACTION_LABEL.withdraw,

  // ── 审批状态（4，派生自 `APPROVAL_STATUS_LABEL`）────────────────────
  'approvalStatus.none': APPROVAL_STATUS_LABEL.none,
  'approvalStatus.pending': APPROVAL_STATUS_LABEL.pending,
  'approvalStatus.approved': APPROVAL_STATUS_LABEL.approved,
  'approvalStatus.rejected': APPROVAL_STATUS_LABEL.rejected,

  // ── 审核意见（4，派生自 `OPINION_OPTIONS`）─────────────────────────
  'auditOpinion.agree': opinionLabel('agree'),
  'auditOpinion.reject': opinionLabel('reject'),
  'auditOpinion.rework': opinionLabel('rework'),
  'auditOpinion.other': opinionLabel('other'),

  // ── 审核卡片动作（3，派生自 `REVIEW_ACTION_LABEL`）──────────────────
  'reviewAction.approve': REVIEW_ACTION_LABEL.approve,
  'reviewAction.reject': REVIEW_ACTION_LABEL.reject,
  'reviewAction.rework': REVIEW_ACTION_LABEL.rework,
} as const
