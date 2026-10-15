/**
 * 职责：en 字典 —— 领域枚举词域（增量 12 · L0 · T01 独占）。
 *
 * ★ 键集合必须与 `zh/domain.ts` **完全一致**（编译期强制）。
 * ★ 与 zh 不同：en 值**手写英文**（术语表见 ARCH §10.6 / PRD §6-D12），
 *   因为英文常量在既有代码中不存在，无法「同源派生」。
 */

/** 领域枚举词字典（英文） */
export const domain = {
  // ── 任务状态（6）────────────────────────────────────────────────────
  'taskStatus.todo': 'To do',
  'taskStatus.in_progress': 'In progress',
  'taskStatus.blocked': 'Blocked',
  'taskStatus.done': 'Done',
  'taskStatus.cancelled': 'Cancelled',
  'taskStatus.pending_review': 'Pending review',

  // ── 看板列（5）─────────────────────────────────────────────────────
  'boardColumn.todo': 'To do',
  'boardColumn.in_progress': 'In progress',
  'boardColumn.blocked': 'Blocked',
  'boardColumn.pending_review': 'Pending review',
  'boardColumn.done': 'Done',

  // ── 迁移动作（8）───────────────────────────────────────────────────
  'taskAction.start': 'Start',
  'taskAction.block': 'Mark blocked',
  'taskAction.cancel': 'Cancel task',
  'taskAction.returnTodo': 'Return to to-do',
  'taskAction.complete': 'Mark complete',
  'taskAction.unblock': 'Unblock',
  'taskAction.reopenTodo': 'Reopen as to-do',
  'taskAction.reopenInProgress': 'Reopen as in progress',

  // ── 角色（2）───────────────────────────────────────────────────────
  'role.manager': 'Manager',
  'role.member': 'Member',

  // ── 优先级（4）─────────────────────────────────────────────────────
  'priority.urgent': 'Urgent',
  'priority.high': 'High',
  'priority.medium': 'Medium',
  'priority.low': 'Low',

  // ── 项目状态（3）───────────────────────────────────────────────────
  'projectStatus.active': 'Active',
  'projectStatus.archived': 'Archived',
  'projectStatus.completed': 'Completed',

  // ── 提报状态（5）───────────────────────────────────────────────────
  'submissionStatus.draft': 'Draft',
  'submissionStatus.pending': 'Pending review',
  'submissionStatus.approved': 'Approved',
  'submissionStatus.rejected': 'Rejected',
  'submissionStatus.withdrawn': 'Withdrawn',

  // ── 提报类型（2）───────────────────────────────────────────────────
  'submissionKind.project': 'New project',
  'submissionKind.task': 'New task',

  // ── AI 提议类型（5）─────────────────────────────────────────────────
  'aiProposalType.decompose': 'AI breakdown',
  'aiProposalType.evaluate': 'Smart evaluation',
  'aiProposalType.emergency': 'Emergency adjustment',
  'aiProposalType.execute': 'Execution advice',
  'aiProposalType.weekly_report': 'Weekly summary',

  // ── 通知事件（8）───────────────────────────────────────────────────
  'notificationEvent.taskAssigned': 'Task assigned',
  'notificationEvent.mention': 'Mention',
  'notificationEvent.deadlineApproaching': 'Deadline approaching',
  'notificationEvent.aiProposal': 'AI proposal',
  'notificationEvent.taskCompleted': 'Task completed',
  'notificationEvent.reviewResult': 'Review result',
  'notificationEvent.reviewPending': 'Review pending',
  'notificationEvent.reviewWithdrawn': 'Review withdrawn',

  // ── 依赖类型（4）───────────────────────────────────────────────────
  'dependencyType.FS': 'Finish to start',
  'dependencyType.SS': 'Start to start',
  'dependencyType.FF': 'Finish to finish',
  'dependencyType.SF': 'Start to finish',

  // ── 审核动作（3）───────────────────────────────────────────────────
  'auditAction.approve': 'Approved',
  'auditAction.reject': 'Rejected',
  'auditAction.withdraw': 'Withdrawn',

  // ── 审批状态（4）───────────────────────────────────────────────────
  'approvalStatus.none': 'Not submitted',
  'approvalStatus.pending': 'Pending review',
  'approvalStatus.approved': 'Approved',
  'approvalStatus.rejected': 'Rejected',

  // ── 审核意见（4）───────────────────────────────────────────────────
  'auditOpinion.agree': 'Agree',
  'auditOpinion.reject': 'Reject',
  'auditOpinion.rework': 'Rework',
  'auditOpinion.other': 'Other',

  // ── 审核卡片动作（3）───────────────────────────────────────────────
  'reviewAction.approve': 'Approve',
  'reviewAction.reject': 'Reject',
  'reviewAction.rework': 'Rework',
}
