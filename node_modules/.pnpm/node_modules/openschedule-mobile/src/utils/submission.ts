/**
 * 职责：提报域**纯判定 / 构造辅助**（ARCH §3 / §7）。
 *
 * 约定（ARCH §7「提报状态字段读写规则」）：
 * - `submissionStatus` 与 `submissionKind` **只在 utils/submission.ts 判定、只在 service 层写**；
 * - `isSubmissionRecord(task)` 是「**新事项提报记录**」的唯一判定；正式列表统一 `&& !isSubmissionRecord(task)`；
 * - 增量 2 起：「审核态清理字段包」唯一构造点 = `createClearedReviewState()`（undo 与「离开 done」两路共用）；
 * - 本文件仅依赖 `@/types`，保持纯函数、可独立测试。
 */
import {
  REASON_MIN_LENGTH,
  type SubmissionKind,
  type SubmissionStatus,
  type Task,
  type TaskStatus,
} from '@/types'
import { translateCurrent } from '@/i18n/current'

/**
 * 提报状态机迁移表（PRD §6 / 增量 5 R6-3）：**表即契约**（K31），等于实读反推的**真实可写入集合**。
 *
 * - `'draft'` / `'published'` 为**类型预留**（全仓 `src/` 内零写入，保留以维持 `SUBMISSION_STATUS_LABEL` 与类型完整）；
 * - 表中**不含自环**（`to === from` 为幂等重写，由守卫 `assertSubmissionTransition` 放行，K30）；
 * - 修正记录（增量 5）：`approved: [] → ['pending']`（`TodayFocusScreen.tsx:264` 撤销审核通过）、
 *   `rejected: ['draft'] → ['draft','pending']`（驳回后重新完成提报）、
 *   `withdrawn: ['draft'] → ['draft','pending']`（撤回后重新完成提报）。
 */
export const SUBMISSION_TRANSITIONS = {
  draft: ['pending', 'published'],
  pending: ['approved', 'rejected', 'withdrawn'],
  approved: ['pending'], // 修正：原 [] 与 TodayFocusScreen.tsx:264 矛盾
  rejected: ['draft', 'pending'], // 修正：原 ['draft'] 缺 pending
  withdrawn: ['draft', 'pending'], // 修正：原 ['draft'] 缺 pending
} as const

/** 迁移目标：提报状态之一，或落地终态 'published' */
export type SubmissionTransitionTarget = SubmissionStatus | 'published'

/** 审核通过后的落地分叉 */
export type ApproveBranch = 'project' | 'task' | 'completion'

/** 提报状态中文文案（我的提报页展示用） */
export const SUBMISSION_STATUS_LABEL: Record<SubmissionStatus, string> = {
  draft: '草稿',
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  withdrawn: '已撤回',
}

/** 提报类型中文文案 */
export const SUBMISSION_KIND_LABEL: Record<SubmissionKind, string> = {
  project: '新项目',
  task: '新任务',
}

/** 驳回原因最小字数（与任务原因同源，≥4 字） */
export const REVIEW_REASON_MIN_LENGTH = REASON_MIN_LENGTH

/** 提报校验失败（42202） */
export const ERR_SUBMISSION_INVALID = 42202
/** 提报越权 / 状态不可撤回（40302） */
export const ERR_SUBMISSION_FORBIDDEN = 40302

/**
 * 「新事项提报记录」唯一判定。
 *
 * 判定依据：`source === 'submission'` **且** `submissionKind != null`。
 * - 种子里的「完成提报」任务（如 task-014 / task-015）只有 `source='submission'`、无 `submissionKind`，
 *   故本函数对其恒返回 `false` ⇒ 列表守卫对既有数据零影响（ARCH R3）。
 */
export function isSubmissionRecord(
  task: Pick<Task, 'source' | 'submissionKind'> | null | undefined,
): boolean {
  if (!task) return false
  return task.source === 'submission' && task.submissionKind != null
}

/**
 * 审核通过后的落地分叉（`reviewSubmission` 唯一新增逻辑，签名不变）。
 * - `source='submission'` 且 `submissionKind='project'` → 落地为正式 Project；
 * - `source='submission'` 且 `submissionKind='task'`    → 落地为正式 Task；
 * - 其余（既有「完成提报」）→ 保持现状（回归红线）。
 */
export function resolveApproveBranch(task: Pick<Task, 'source' | 'submissionKind'>): ApproveBranch {
  if (task.source === 'submission' && task.submissionKind === 'project') return 'project'
  if (task.source === 'submission' && task.submissionKind === 'task') return 'task'
  return 'completion'
}

/** 提报状态迁移是否合法（纯函数，遍历 SUBMISSION_TRANSITIONS） */
export function canTransition(from: SubmissionStatus, to: SubmissionTransitionTarget): boolean {
  const allowed = SUBMISSION_TRANSITIONS[from] as readonly SubmissionTransitionTarget[] | undefined
  if (!allowed) return false
  return allowed.includes(to)
}

/**
 * 是否可撤回（**分叉主体**，唯一事实来源；M5-P0-02 / K20）。
 *
 * 主体判定（与 `resolveReviewItemView` 的 `submitterId` 同源，K4：**禁止**用 `source` / `status` 判定）：
 * - `resolveApproveBranch(task) === 'completion'` ⇒ 提报人 = `task.assigneeId ?? task.createdBy`
 *   （完成提报由负责人提交，待我审核卡片显示「李娜 提交了完成提报」）；
 * - 否则（新事项提报）⇒ 提报人 = `task.createdBy`。
 *
 * 且必须 `submissionStatus === 'pending'`（状态门禁；**非**主体判定）。
 *
 * ⚠️ 修正前本函数以 `createdBy` 为唯一主体且**全仓零引用**（死代码），与服务层内联判据漂移；
 * 本增量将其收敛为唯一判据，并被 `withdrawCompletion` 真正引用（消除「谓词 / 实现漂移」）。
 */
export function isWithdrawable(
  task: Pick<Task, 'createdBy' | 'assigneeId' | 'source' | 'submissionKind' | 'submissionStatus'>,
  actorId: string,
): boolean {
  if (task.submissionStatus !== 'pending') return false
  const submitter =
    resolveApproveBranch(task) === 'completion' ? task.assigneeId ?? task.createdBy : task.createdBy
  return submitter === actorId
}

/** 提报标题校验：非空白（返回错误文案或 null） */
export function validateSubmissionTitle(title: string | null | undefined): string | null {
  if (!title || title.trim().length === 0) return translateCurrent('submission.titleRequired')
  return null
}

/** 驳回原因校验：去空白后 ≥4 字（PRD §6） */
export function isValidReviewReason(reason: string | null | undefined): boolean {
  return typeof reason === 'string' && reason.trim().length >= REVIEW_REASON_MIN_LENGTH
}

// ── 增量 2：完成提报（completeTask → 待我审核 断链）──────────────────

/** 「撤销完成」/「离开 done」需复位的审核态字段包（唯一构造点：createClearedReviewState()） */
export interface UndoReviewReset {
  submissionStatus: null
  reviewRequired: false
  reviewerIds: string[]
  reviewNote: null
  /** `pending` 态任务二者恒为 null（`completeTask` 亦写 null）⇒ 行为等价、回归面为零 */
  reviewedBy: null
  reviewedAt: null
}

/**
 * 构造「审核态已清理」字段包（**每次返回新对象**，避免共享可变引用）。
 * 本函数是「审核态清理字段清单」在全仓的**唯一构造点**：`undoCompletion` 的清理分支与
 * 「离开 done」路径（`reopenTask` / `moveTask`）必须共用，禁止在 service 内另行手写第二份字段列表。
 */
export function createClearedReviewState(): UndoReviewReset {
  return {
    submissionStatus: null,
    reviewRequired: false,
    reviewerIds: [],
    reviewNote: null,
    reviewedBy: null,
    reviewedAt: null,
  }
}

/**
 * 解析「撤销完成」需复位的审核态字段（纯函数，ARCH §3.2 / K2 / K3）。
 * - `next === null` → 返回清理包（6 字段全清）；
 * - 其它取值（含 `undefined` / `'pending'` / `'approved'` …）→ 返回 `null`（不清理）。
 *
 * ⚠️ 只有 `=== null` 才触发清理；`'pending'`（撤销审核通过）**不得**复位
 * `reviewRequired` / `reviewerIds`，否则任务会从待审队列消失（K3 最易写错处）。
 */
export function resolveUndoReviewReset(next: Task['submissionStatus']): UndoReviewReset | null {
  if (next !== null) return null
  return createClearedReviewState()
}

// ── 「审核轮回态」（M5-P0-05 / K26 / PRD §2.5）───────────────────────────────
// 定义：**非完成态** 且 `submissionStatus === 'pending'`，且 `reviewRequired === true` /
//       `reviewerIds` 非空。语义 = 「完成提报曾被通过，随后被『撤销审核通过』⇒ 任务回到推进中，
//       同时提报重新回到待审队列等待再审」（`TodayFocusScreen` 撤销审核通过时显式写入
//       `{ status:'in_progress', submissionStatus:'pending' }`）。`completedAt === null`。
//
// 口径：该态是**合法态**（非脏数据），由产品流程主动写入，并被 4 个测试套件保护
//       （`increment2-qa` / `increment2-completion` / `round2-regression`）。
//       ⇒ 下方 `shouldClearReviewOnLeaveDone` 的**窄口径是有意为之**：
//          · 「完成态 → 非完成态」= 「撤回完成声明」⇒ **清理**审核态
//            （增量 7 起「完成态」= `{done, pending_review}`，`pending_review` 是新的完成态）；
//          · **非完成态的 `pending`（审核轮回态）离开当前状态**（如 `in_progress → todo`）
//            **不清理** —— 该态下任务仍在推进，审核人必须仍能看到它，否则任务会从待审队列
//            静默消失（这正是 K3 要防的反向缺陷）。
//       ⚠️ 禁止为「统一清理口径」而给 `moveTask` / `reopenTask` 增加新清理分支（PRD §2.2-2）
//          —— `moveTask` 已由本函数单一入口覆盖，新增分支反而会破坏窄口径保护。
//          （注：增量 7.1 在既有清理分支上追加的「评审子任务关闭」`closeOpenReviewSubtasks`
//            属数据卫生副作用，不改变本判据、不新增清理条件，不违反上述禁令。）

/**
 * 「离开完成态」是否必须清理审核态（纯判定，T02b 的唯一触发口径）。
 *
 * 三条同时成立才为 `true`：
 *   ① `task.status === 'done' || task.status === 'pending_review'` —— 当前处于**完成态**
 *      （增量 7 起完成态 = `{done, pending_review}`；仅覆盖由完成态迁出的路径）；
 *   ② `nextStatus !== 'done' && nextStatus !== 'pending_review'` —— 目标不是完成态（迁往完成态时不得清理）；
 *   ③ `task.submissionStatus === 'pending'` —— 仍在待审（非 pending 无需清理）。
 *
 * ⚠️ 调用方须在**改写 `task.status` 之前**求值（本函数读取的是迁移前状态）。
 * ⚠️ 增量 7.1：调用方在清理成立时另需调用 `closeOpenReviewSubtasks(task)` 关闭未完成评审子任务
 *    （数据卫生，ARCH §2.4.2）；该副作用**不改变本函数判据**。
 */
export function shouldClearReviewOnLeaveDone(
  task: Pick<Task, 'status' | 'submissionStatus'>,
  nextStatus: TaskStatus,
): boolean {
  return (task.status === 'done' || task.status === 'pending_review') && nextStatus !== 'done' && nextStatus !== 'pending_review' && task.submissionStatus === 'pending'
}

/** 「待我审核」条目视图模型（列表分叉展示用） */
export interface ReviewItemView {
  branch: ApproveBranch
  /** 状态标签文案：「完成待审」/「提报待审 · 新任务」/「提报待审 · 新项目」 */
  label: string
  /** 提交人字段来源：完成提报 = assigneeId；新事项提报 = createdBy */
  submitterId: string | null
  /** 副文案：「提交了完成提报」/「提报了新任务」/「提报了新项目」 */
  actionText: string
  /** 标签配色复用的既有状态色槽（不新增 token）：completion → 'done'；task/project → 'in_progress' */
  tagStatus: TaskStatus
}

/**
 * 解析审核条目分叉视图（纯函数，判定依据 = `resolveApproveBranch(task)`，**禁止**用 source / status）。
 */
export function resolveReviewItemView(
  task: Pick<Task, 'source' | 'submissionKind' | 'assigneeId' | 'createdBy'>,
): ReviewItemView {
  const branch = resolveApproveBranch(task)
  if (branch === 'completion') {
    return {
      branch,
      label: translateCurrent('reviewView.completionLabel'),
      submitterId: task.assigneeId,
      actionText: translateCurrent('reviewView.completionAction'),
      tagStatus: 'done',
    }
  }
  const isProject = branch === 'project'
  return {
    branch,
    label: translateCurrent(isProject ? 'reviewView.projectLabel' : 'reviewView.taskLabel'),
    submitterId: task.createdBy,
    actionText: translateCurrent(isProject ? 'reviewView.projectAction' : 'reviewView.taskAction'),
    tagStatus: 'in_progress',
  }
}
