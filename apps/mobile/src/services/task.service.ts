/**
 * 职责：任务服务 —— 列表 / 详情 / 状态迁移 / 评论 / 计时 / 依赖。
 * 写操作一律携带 `version`（乐观锁），失败回滚由调用方（页面 + AppProvider）负责；
 * 真实模式保留 `// TODO(real-api)` 调用位（ARCH §10）。
 */
import {
  allManagerIds,
  attachmentsByTask,
  commentsByTask,
  db,
  dependenciesOfTask,
  findProject,
  findTask,
  findUser,
  isManagerUser,
  nextId,
  now,
  pushNotification,
  pushNotificationOnce,
  timeEntriesByTask,
} from '@/data'
import {
  ApiError,
  ERR_ILLEGAL_TRANSITION,
  ERR_OPTIMISTIC_LOCK,
  TASK_TRANSITIONS,
  type AppRole,
  type Attachment,
  type AuditAction,
  type AuditLog,
  type AuditOpinion,
  type CompleteTaskInput,
  type CreateCommentInput,
  type MoveTaskInput,
  type Project,
  type ReopenTaskInput,
  type SubmissionKind,
  type SubmissionStatus,
  type Task,
  type TaskComment,
  type TaskDependency,
  type TaskPriority,
  type TaskStatus,
  type TimeEntry,
  type User,
} from '@/types'
import { demoDayAt } from '@/data/seed'
import { toDateKey } from '@/utils/date'
import {
  ERR_SUBMISSION_FORBIDDEN,
  ERR_SUBMISSION_INVALID,
  REVIEW_REASON_MIN_LENGTH,
  SUBMISSION_TRANSITIONS,
  canTransition,
  createClearedReviewState,
  isSubmissionRecord,
  isValidReviewReason,
  isWithdrawable,
  resolveApproveBranch,
  resolveUndoReviewReset,
  shouldClearReviewOnLeaveDone,
  validateSubmissionTitle,
} from '@/utils/submission'
import {
  ERR_INVALID_ATTACHMENT,
  sanitizeFileName,
  validateAttachment,
  type AttachmentFileMeta,
} from '@/utils/attachment'
import { delay, httpClient, postMultipart, simulateLatency } from './client'
import { USE_MOCK } from './config'
import { insertProject } from './project.service'

/** 任务详情聚合体（详情页一次性取全量分区数据） */
export interface TaskDetail {
  task: Task
  assignee: User | null
  project: Project | null
  comments: TaskComment[]
  attachments: Attachment[]
  timeEntries: TimeEntry[]
  dependencies: TaskDependency[]
}

/** 状态排序权重（列表默认排序用） */
const STATUS_WEIGHT: Record<TaskStatus, number> = {
  in_progress: 0,
  todo: 1,
  blocked: 2,
  pending_review: 3,
  done: 3,
  cancelled: 4,
}

const PRIORITY_WEIGHT: Record<Task['priority'], number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
}

/** 校验乐观锁 version，不一致抛 40901 */
function assertVersion(task: Task, version: number): void {
  if (task.version !== version) {
    throw new ApiError(ERR_OPTIMISTIC_LOCK, '任务已被他人更新，已为你刷新最新数据')
  }
}

/** 校验状态迁移合法性，非法抛 40902（details 带 allowed_transitions） */
function assertTransition(from: TaskStatus, to: TaskStatus): void {
  const allowed = TASK_TRANSITIONS[from] ?? []
  if (!allowed.includes(to)) {
    throw new ApiError(ERR_ILLEGAL_TRANSITION, '该状态迁移不被允许，请刷新后重试', {
      allowed_transitions: allowed.map((status) => ({ to: status })),
    })
  }
}

/**
 * 提报状态迁移守卫（M6-P0-07 / R6-4 / K30 / K35）：**`submissionStatus` 写入的唯一守卫**。
 * 非法迁移抛 40302（`ERR_SUBMISSION_FORBIDDEN`，`details.allowed_transitions`）。
 *
 * 放行规则：
 * - `to === from`（幂等重写）⇒ 放行（**不是迁移**，不进表）；
 * - `from == null`（初始写入）⇒ **仅放行 `'pending'`**（唯一初始值）；
 * - 其余 ⇒ 查 `SUBMISSION_TRANSITIONS`（表即契约）。
 *
 * 豁免（**不调用本守卫**）：清理包（`submissionStatus: null`，复位 ≠ 迁移）、
 *   新对象字面量（`insertTask` / `buildSubmissionRecord`，无 `from`）。
 *
 * 落点为 service 层本地（镜像 `assertVersion` / `assertTransition`）：`src/utils/` 内 `ApiError` 零使用，
 * 守卫须保持 `utils/` 纯净（K35）。
 */
function assertSubmissionTransition(from: Task['submissionStatus'], to: SubmissionStatus): void {
  if (to === from) return
  if (from == null) {
    if (to === 'pending') return
    throw new ApiError(ERR_SUBMISSION_FORBIDDEN, '提报状态迁移不被允许', {
      allowed_transitions: [{ to: 'pending' }],
    })
  }
  if (!canTransition(from, to)) {
    const allowed = SUBMISSION_TRANSITIONS[from] ?? []
    throw new ApiError(ERR_SUBMISSION_FORBIDDEN, '提报状态迁移不被允许', {
      allowed_transitions: allowed.map((target) => ({ to: target })),
    })
  }
}

/** 写入团队动态（mock 下模拟 audit_logs 只读聚合） */
function pushAudit(action: string, actorId: string, resourceId: string, summary: string): void {
  const actor = findUser(actorId)
  db.auditFeed.unshift({
    id: nextId('feed'),
    action,
    actorId,
    actorName: actor?.displayName ?? '系统',
    resourceType: 'task',
    resourceId,
    summary,
    createdAt: now(),
  })
}

/** 排序：先按状态权重，再按优先级，再按截止时间 */
function sortTasks(tasks: Task[]): Task[] {
  return tasks.slice().sort((a, b) => {
    const statusDiff = STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status]
    if (statusDiff !== 0) return statusDiff
    const priorityDiff = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]
    if (priorityDiff !== 0) return priorityDiff
    if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt)
    if (a.dueAt) return -1
    if (b.dueAt) return 1
    return a.sortOrder - b.sortOrder
  })
}

/**
 * 把「审核态清理」字段包落到任务对象上（唯一落地实现，T02b）。
 * 字段清单来源 = `createClearedReviewState()`，禁止在此另行手写第二份（K1 / K8）。
 */
function applyClearedReviewState(task: Task): void {
  Object.assign(task, createClearedReviewState())
}

/** 我的待办：assignee = 我，且未完成 / 未取消（最多返回 5 条由页面裁剪） */
export async function listMyTodos(userId: string): Promise<Task[]> {
  if (USE_MOCK) {
    await simulateLatency()
    const tasks = db.tasks.filter(
      (task) =>
        task.assigneeId === userId &&
        task.status !== 'done' &&
        task.status !== 'cancelled' &&
        task.submissionStatus !== 'pending' &&
        // 提报记录不进正式列表（ARCH §7 列表守卫）
        !isSubmissionRecord(task),
    )
    return sortTasks(tasks)
  }
  // TODO(real-api): GET /tasks?assigneeId=:userId&statusNot=done,cancelled
  return httpClient.get<Task[]>('/tasks', { query: { assigneeId: userId, scope: 'my_todos' } })
}

/**
 * 今日到期：dueAt 落在目标时区的今天，且**仍需处理**（未完成、未取消、非待审中）。
 *
 * 口径归因（增量 5 AC-17 / M6-P1-02，零行为变更）：`:178` 的 `status !== 'done'` 已排除**全部** `done` ⇒
 * `:179` 的 `submissionStatus !== 'pending'` 的**唯一作用**是排除「**审核轮回态**」（非 done 的 pending），
 * 这是增量 3 消除 `task-014` 重复计数的唯一手段。**不可删**（放行会打破 6 处受保护断言，R6-2）。
 */
export async function listTodayDue(userId: string, timezone: string): Promise<Task[]> {
  if (USE_MOCK) {
    await simulateLatency()
    const today = toDateKey(new Date(), timezone)
    const tasks = db.tasks.filter(
      (task) =>
        task.dueAt !== null &&
        toDateKey(task.dueAt, timezone) === today &&
        task.status !== 'cancelled' &&
        task.status !== 'done' && // S1（增量 3）：已完成不进「今日到期」
        // S1（增量 3）：待审中不进「今日到期」（K15）
        // ⚠️ 归因（增量 5 AC-17 / M6-P1-02）：上一行已排除**全部** `done` ⇒ 本行唯一作用 = 排除「非 done 的 pending」
        //    = **审核轮回态**；这是增量 3 消除 `task-014` 重复计数的**唯一手段**，**不可删**
        //    （放行会立即打破 6 处受保护断言，含「今日到期 ∩ 待我审核 为空」，见 R6-2）。
        task.submissionStatus !== 'pending' &&
        // 提报记录不进正式列表（ARCH §7 列表守卫）
        !isSubmissionRecord(task),
    )
    return sortTasks(tasks)
  }
  // TODO(real-api): GET /tasks?scope=today_due&timezone=:timezone
  return httpClient.get<Task[]>('/tasks', { query: { scope: 'today_due', assigneeId: userId, timezone } })
}

/** 待我审核：需评审且提交待审，且我在评审人列表 */
export async function listPendingReview(userId: string): Promise<Task[]> {
  if (USE_MOCK) {
    await simulateLatency()
    const tasks = db.tasks.filter(
      (task) =>
        task.reviewRequired === true &&
        task.submissionStatus === 'pending' &&
        (task.reviewerIds ?? []).includes(userId),
    )
    return sortTasks(tasks)
  }
  // TODO(real-api): GET /tasks?scope=pending_review
  return httpClient.get<Task[]>('/tasks', { query: { scope: 'pending_review', reviewerId: userId } })
}

/** 临期预警：截止时间在未来 24h 内且未完成（增量 7：显式排除 `pending_review`，§2.5-3） */
export async function listDeadlineApproaching(userId: string, timezone: string): Promise<Task[]> {
  if (USE_MOCK) {
    await simulateLatency()
    const nowMs = Date.now()
    const limit = nowMs + 24 * 3600 * 1000
    const tasks = db.tasks.filter((task) => {
      if (!task.dueAt) return false
      // 增量 7：`pending_review`（完成态待审）显式排除，避免与「待我审核」重复计数（§2.5-3）
      if (task.status === 'done' || task.status === 'cancelled' || task.status === 'pending_review') return false
      if (isSubmissionRecord(task)) return false // 提报记录不进正式列表（ARCH §7）
      const dueMs = new Date(task.dueAt).getTime()
      return dueMs >= nowMs - 3600 * 1000 && dueMs <= limit
    })
    void timezone
    return sortTasks(tasks)
  }
  // TODO(real-api): GET /tasks?scope=deadline_approaching
  return httpClient.get<Task[]>('/tasks', { query: { scope: 'deadline_approaching', timezone } })
}

/** 某项目下全部任务（提报记录不进正式列表，ARCH §7 列表守卫） */
export async function listTasksByProject(projectId: string): Promise<Task[]> {
  if (USE_MOCK) {
    await simulateLatency()
    return sortTasks(
      db.tasks.filter((task) => task.projectId === projectId && !isSubmissionRecord(task)),
    )
  }
  // TODO(real-api): GET /projects/:projectId/tasks
  return httpClient.get<Task[]>(`/projects/${projectId}/tasks`)
}

/** 任务详情（聚合评论 / 附件 / 工时 / 依赖 / 负责人 / 项目） */
export async function getTaskDetail(taskId: string): Promise<TaskDetail> {
  if (USE_MOCK) {
    await simulateLatency()
    const task = findTask(taskId)
    if (!task) throw new ApiError(40401, '任务不存在或不可见')
    return {
      task: { ...task },
      assignee: findUser(task.assigneeId),
      project: findProject(task.projectId),
      comments: commentsByTask(taskId),
      attachments: attachmentsByTask(taskId),
      timeEntries: timeEntriesByTask(taskId),
      dependencies: dependenciesOfTask(taskId),
    }
  }
  // TODO(real-api): GET /tasks/:taskId（含 include=comments,attachments,timeEntries,dependencies）
  return httpClient.get<TaskDetail>(`/tasks/${taskId}`)
}

/** 仅取任务本体 */
export async function getTask(taskId: string): Promise<Task> {
  if (USE_MOCK) {
    await simulateLatency()
    const task = findTask(taskId)
    if (!task) throw new ApiError(40401, '任务不存在或不可见')
    return { ...task }
  }
  // TODO(real-api): GET /tasks/:taskId
  return httpClient.get<Task>(`/tasks/${taskId}`)
}

/**
 * 承接任务（T1）：assignee 置为当前用户并进入进行中。
 * 乐观更新由调用方登记，失败回滚。
 */
export async function claimTask(taskId: string, version: number, userId: string): Promise<Task> {
  if (USE_MOCK) {
    await simulateLatency()
    const task = findTask(taskId)
    if (!task) throw new ApiError(40401, '任务不存在或不可见')
    assertVersion(task, version)
    if (task.status !== 'todo') {
      assertTransition(task.status, 'in_progress')
    }
    task.assigneeId = userId
    task.status = 'in_progress'
    task.startedAt = task.startedAt ?? now()
    task.version += 1
    task.updatedAt = now()
    pushAudit('task.claim', userId, taskId, `承接了「${task.title}」`)
    return { ...task }
  }
  // TODO(real-api): POST /tasks/:taskId/claim  body: { version }
  return httpClient.post<Task>(`/tasks/${taskId}/claim`, { version })
}

/** 状态流转（T3–T9）：带 version 乐观锁 + 迁移合法性校验 */
export async function moveTask(taskId: string, input: MoveTaskInput): Promise<Task> {
  if (USE_MOCK) {
    await simulateLatency()
    const task = findTask(taskId)
    if (!task) throw new ApiError(40401, '任务不存在或不可见')
    assertVersion(task, input.version)
    assertTransition(task.status, input.status)

    const previous = task.status
    // S4（增量 2 · K8）：由 done 迁出且仍待审 ⇒ 清理审核态（守卫读迁移前状态，须在改写 status 前判定）
    const clearReviewOnLeaveDone = shouldClearReviewOnLeaveDone(task, input.status)
    task.status = input.status
    task.version += 1
    task.updatedAt = now()

    if (input.status === 'in_progress') task.startedAt = task.startedAt ?? now()
    if (input.status === 'done') {
      task.completedAt = now()
      task.actualHours = task.actualHours ?? task.estimatedHours ?? null
    }
    if (input.status === 'todo' || input.status === 'in_progress') task.completedAt = null
    if (input.sortOrder !== undefined) task.sortOrder = input.sortOrder
    // 增量 7.1（Route 2 · ARCH §2.4.2）：清理审核态时同步关闭未完成评审子任务（数据卫生，消除孤儿）
    if (clearReviewOnLeaveDone) {
      applyClearedReviewState(task)
      closeOpenReviewSubtasks(task)
    }

    const reasonSuffix = input.reason ? `（原因：${input.reason}）` : ''
    pushAudit(
      'task.move',
      task.assigneeId ?? task.createdBy,
      taskId,
      `将「${task.title}」由 ${previous} 变更为 ${input.status}${reasonSuffix}`,
    )
    return { ...task }
  }
  // TODO(real-api): POST /tasks/:taskId/move  body: { status, sortOrder, version, reason }
  return httpClient.post<Task>(`/tasks/${taskId}/move`, input)
}

/**
 * 完成提报（T4/T7）：落 completedAt + actualHours。
 *
 * 增量 7（M1）完成分流 —— 判定式**严格忠实后端** `tasks.service.ts:340`：
 * `needsReview = task.reviewRequired === true && task.isReviewTask !== true`
 * - `needsReview === true`  ⇒ `status = 'pending_review'` + 写提报态 + 生成 / 复用评审子任务 + 通知审核人；
 * - `needsReview === false` ⇒ 直接 `status = 'done'`（**不写**提报态 / **不生成**下级评审 / **不发** review.pending）。
 *
 * ⚠️ M1 铁律：`completeTask` **只读** `reviewRequired`，**绝不改写它**（创建期已决定）；
 *    `reviewRequired` 的唯一写入点 = `createTask` / `insertTask`（`input.reviewRequired ?? false`）。
 */
export async function completeTask(taskId: string, input: CompleteTaskInput): Promise<Task> {
  if (USE_MOCK) {
    await simulateLatency()
    const task = findTask(taskId)
    if (!task) throw new ApiError(40401, '任务不存在或不可见')
    assertVersion(task, input.version)

    // M1：严格后端公式；`reviewRequired` 只读不改
    const needsReview = task.reviewRequired === true && task.isReviewTask !== true
    const target: TaskStatus = needsReview ? 'pending_review' : 'done'
    assertTransition(task.status, target)

    task.status = target
    task.completedAt = now()
    task.actualHours = input.actualHours ?? task.actualHours ?? task.estimatedHours ?? null

    if (needsReview) {
      // 完成提报进入待审队列（K4：不改 source，保持原值）
      // 守卫（M6-P0-07 / K30）：初始写入（from == null）/ 幂等重写 / rejected→pending / withdrawn→pending 均放行
      assertSubmissionTransition(task.submissionStatus, 'pending')
      task.submissionStatus = 'pending'
      // M1：**不再**写 `task.reviewRequired = true`（该标志已由创建期决定，此处只读）
      task.reviewerIds = allManagerIds()
      task.reviewNote = null
      task.reviewedBy = null
      task.reviewedAt = null
      // 评审子任务生成 / 复用（对齐 tasks.service.ts:353-385）
      ensureReviewSubtask(task)
    }
    // else：免评审（reviewRequired !== true）或评审子任务自身（isReviewTask === true）
    //       ⇒ 直接完成，不写提报态、不生成下级评审（防递归）。

    task.version += 1
    task.updatedAt = now()
    // 注：审计动态动作保持 'task.complete'（受保护断言 increment2-completion.test.ts:263 依赖它，
    // 不在 §2.6 授权改动范围内）；审核留痕由结构化 AuditLog 承载。
    pushAudit(
      'task.complete',
      task.assigneeId ?? task.createdBy,
      taskId,
      `完成了「${task.title}」${input.summary ? `：${input.summary}` : ''}`,
    )
    if (needsReview) {
      // S3（增量 3）：向全部审核人派发「待你审核」通知（未读级去重，M4-P0-03 / M4-P0-04）
      // 接收人来源 = task.reviewerIds（与 listPendingReview 的可见性判定同源，K18）
      for (const reviewerId of task.reviewerIds ?? []) {
        pushNotificationOnce({
          userId: reviewerId,
          type: 'review.pending',
          title: '待你审核',
          body: `「${task.title}」已完成提报，等待你的审核`,
          data: { taskId },
        })
      }
    }
    return { ...task }
  }
  // TODO(real-api): POST /tasks/:taskId/complete  body: { summary, actualHours, version }
  return httpClient.post<Task>(`/tasks/${taskId}/complete`, input)
}

/** 重开（T9）：原因必填，completedAt 置空、actualHours 保留 */
export async function reopenTask(taskId: string, input: ReopenTaskInput): Promise<Task> {
  if (USE_MOCK) {
    await simulateLatency()
    const task = findTask(taskId)
    if (!task) throw new ApiError(40401, '任务不存在或不可见')
    assertVersion(task, input.version)
    assertTransition(task.status, 'todo')

    // S4（增量 2 · K8）：reopenTask 目标恒为 todo ⇒ 由 done 迁出且仍待审时清理审核态
    const clearReviewOnLeaveDone = shouldClearReviewOnLeaveDone(task, 'todo')
    task.status = 'todo'
    task.completedAt = null
    task.version += 1
    task.updatedAt = now()
    // 增量 7.1（Route 2 · ARCH §2.4.2）：清理审核态时同步关闭未完成评审子任务（数据卫生，消除孤儿）
    if (clearReviewOnLeaveDone) {
      applyClearedReviewState(task)
      closeOpenReviewSubtasks(task)
    }
    pushAudit('task.reopen', task.createdBy, taskId, `重开了「${task.title}」（原因：${input.reason}）`)
    return { ...task }
  }
  // TODO(real-api): POST /tasks/:taskId/reopen  body: { reason, version }
  return httpClient.post<Task>(`/tasks/${taskId}/reopen`, input)
}

/** 撤销「完成 / 审核通过」入参（按目标状态回滚，可复位提报态） */
export interface UndoCompletionInput {
  /** 回滚目标状态（原状态，非固定 todo） */
  status: TaskStatus
  /**
   * 提报态处置（三态，缺一不可，K2 / K3）：
   * - `undefined`（不传）→ **不动**提报态（保持原值）；
   * - `null`           → **清理审核态**：submissionStatus=null、reviewRequired=false、
   *                      reviewerIds=[]、reviewNote=null、reviewedBy=null、reviewedAt=null
   *                      （撤销「完成」用；字段清单唯一来源 = `createClearedReviewState()`）；
   * - `'pending'`      → 仅把 submissionStatus 置回 `'pending'`，**不得**复位
   *                      reviewRequired / reviewerIds（撤销「审核通过」用，Q3-9）。
   */
  submissionStatus?: Task['submissionStatus']
  version: number
  reason?: string
}

/**
 * 撤销「完成 / 审核通过」：按目标状态回滚（修复「撤销落到 todo 而非原状态」的语义问题）。
 * 仅允许从终态 done 回滚（复用 TASK_TRANSITIONS 校验）。
 */
export async function undoCompletion(taskId: string, input: UndoCompletionInput): Promise<Task> {
  if (USE_MOCK) {
    await simulateLatency()
    const task = findTask(taskId)
    if (!task) throw new ApiError(40401, '任务不存在或不可见')
    assertVersion(task, input.version)
    assertTransition(task.status, input.status)

    task.status = input.status
    // 提报态三态处置（K2 / K3）：undefined 不动；null 清理审核态；'pending' 仅置回（禁止复位审核态）
    if (input.submissionStatus !== undefined) {
      // 守卫（M6-P0-07 / K30）：仅「状态变化」需校验；`null` 为复位包（豁免，K35）
      if (input.submissionStatus !== null) {
        assertSubmissionTransition(task.submissionStatus, input.submissionStatus)
      }
      task.submissionStatus = input.submissionStatus
    }
    const reviewReset = resolveUndoReviewReset(input.submissionStatus)
    // 增量 7.1（Route 2 · ARCH §2.4.2）：**仅在审核态被复位时**关闭未完成评审子任务。
    // ⚠️ 硬约束：不得无条件调用 —— `submissionStatus:'pending'`（审核轮回态）时 `reviewReset === null`，
    //    该态下 `reviewRequired` 保持 true，审核人必须仍能看到该任务，误关会造成审批死锁（守门用例 R-6）。
    if (reviewReset) {
      Object.assign(task, reviewReset)
      closeOpenReviewSubtasks(task)
    }
    task.completedAt = null
    task.version += 1
    task.updatedAt = now()
    pushAudit(
      'task.undo',
      task.assigneeId ?? task.createdBy,
      taskId,
      `撤销了对「${task.title}」的完成操作${input.reason ? `（${input.reason}）` : ''}`,
    )
    return { ...task }
  }
  // TODO(real-api): POST /tasks/:taskId/undo-completion  body: { status, submissionStatus, version, reason }
  return httpClient.post<Task>(`/tasks/${taskId}/undo-completion`, input)
}

/** 评论列表 */
export async function listComments(taskId: string): Promise<TaskComment[]> {
  if (USE_MOCK) {
    await simulateLatency()
    return commentsByTask(taskId)
  }
  // TODO(real-api): GET /tasks/:taskId/comments
  return httpClient.get<TaskComment[]>(`/tasks/${taskId}/comments`)
}

/** 评论 @提及解析结果（offset = '@' 在正文中的字符偏移，length = displayName 长度，不含 '@'） */
export interface CommentMention {
  userId: string
  offset: number
  length: number
}

/**
 * 解析评论正文中的 @提及（与用户 displayName 精确前缀匹配）。
 * 规则：按正文出现顺序返回；长名优先匹配（避免前缀吞并）；同一用户重复提及只保留首次。
 */
export function parseMentions(content: string, users: User[]): CommentMention[] {
  if (!content) return []
  const candidates = users
    .filter((user) => Boolean(user.displayName))
    .slice()
    .sort((a, b) => b.displayName.length - a.displayName.length)

  const mentions: CommentMention[] = []
  const seen = new Set<string>()
  let index = 0
  while (index < content.length) {
    const at = content.indexOf('@', index)
    if (at === -1) break
    const rest = content.slice(at + 1)
    const matched = candidates.find((user) => rest.startsWith(user.displayName))
    if (matched) {
      if (!seen.has(matched.id)) {
        mentions.push({ userId: matched.id, offset: at, length: matched.displayName.length })
        seen.add(matched.id)
      }
      index = at + 1 + matched.displayName.length
    } else {
      index = at + 1
    }
  }
  return mentions
}

/** 新增评论（发送后即时上屏）：解析 @提及并为被提及者生成通知 */
export async function addComment(
  taskId: string,
  input: CreateCommentInput,
  authorId: string,
): Promise<TaskComment> {
  if (USE_MOCK) {
    await simulateLatency()
    const task = findTask(taskId)
    if (!task) throw new ApiError(40401, '任务不存在或不可见')
    const timestamp = now()
    const mentions = parseMentions(input.content, db.users)
    const comment: TaskComment = {
      id: nextId('comment'),
      tenantId: task.tenantId,
      taskId,
      authorId,
      parentId: input.parentId ?? null,
      content: input.content,
      mentions,
      isDecision: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    db.comments.push(comment)
    const author = findUser(authorId)
    const authorName = author?.displayName ?? '有人'
    pushAudit('comment.create', authorId, taskId, `${authorName}在「${task.title}」中发表了评论`)

    // @提及触发通知：落入 mock 通知库，通知列表可见；不给自己发通知
    mentions.forEach((mention) => {
      if (mention.userId === authorId) return
      if (!findUser(mention.userId)) return
      db.notifications.unshift({
        id: nextId('notif'),
        tenantId: task.tenantId,
        userId: mention.userId,
        type: 'mention',
        title: `${authorName} 在任务《${task.title}》中提到了你`,
        body: input.content,
        data: { taskId },
        channel: 'in_app',
        status: 'sent',
        readAt: null,
        createdAt: timestamp,
      })
    })
    return comment
  }
  // TODO(real-api): POST /tasks/:taskId/comments  body: { content, parentId }（提及通知由后端生成）
  return httpClient.post<TaskComment>(`/tasks/${taskId}/comments`, input)
}

/** 附件列表 */
export async function listAttachments(taskId: string): Promise<Attachment[]> {
  if (USE_MOCK) {
    await simulateLatency()
    return attachmentsByTask(taskId)
  }
  // 按资源维度查询（后端 `attachments.controller.listByResource` 返回 { data: items, meta }，
  // `client.request` 解包 envelope.data ⇒ 直接拿到 items 数组；items 为 Prisma 原始行，含
  // tenantId / uploaderId，故列表无需补齐）
  return httpClient.get<Attachment[]>('/attachments', {
    query: { resource_type: 'task', resource_id: taskId },
  })
}

/** 上传附件入参（文件选择结果） */
export type UploadAttachmentInput = AttachmentFileMeta

/**
 * 真实上传分支的上下文。
 *
 * 🔴 `tenantId` 的源头是 **`task.tenantId`**（由屏幕经 props 下传）。
 * **不要用 `useAuth().user.tenantId`** —— 移动端 `User` 类型**不含 `tenantId`**
 * （`src/types/user.ts:7-26`），写了会 `tsc` 报错。
 */
export interface UploadContext {
  /** 真实分支补齐响应缺失字段用。来源 = task.tenantId（由屏幕经 props 下传） */
  tenantId: string
}

/**
 * 服务端上传响应的形态：即 Attachment **减去 `tenantId` / `uploaderId`**
 * （后端上传响应不含这两个字段，需客户端补齐）。
 */
interface ServerUploadedAttachment {
  id: string
  resourceType: string
  resourceId: string
  objectKey: string
  fileName: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

/**
 * 组 multipart FormData（字段名对齐后端 `UploadAttachmentDto`）。
 * native 用 `{ uri, name, type }` 形态；Web 用真实 `File`。
 */
export function buildAttachmentFormData(
  input: UploadAttachmentInput,
  resourceType: 'task' | 'comment' | 'project',
  resourceId: string,
): FormData {
  const form = new FormData()
  if (input.file) {
    form.append('file', input.file)
  } else {
    // RN 的 FormData 接受 { uri, name, type } 描述本地文件；TS 侧类型只有 string | Blob，
    // 故此处做一次窄化断言（运行时语义由 RN 运行时保证）。
    form.append(
      'file',
      { uri: input.uri ?? '', name: sanitizeFileName(input.fileName), type: input.mimeType } as unknown as Blob,
    )
  }
  form.append('resource_type', resourceType)
  form.append('resource_id', resourceId)
  return form
}

/** 上传响应 → 移动端 Attachment（客户端补齐 tenantId / uploaderId） */
export function mapUploadedAttachment(
  raw: ServerUploadedAttachment,
  ctx: { tenantId: string; uploaderId: string },
): Attachment {
  return {
    ...raw,
    resourceType: raw.resourceType as Attachment['resourceType'],
    tenantId: ctx.tenantId,
    uploaderId: ctx.uploaderId,
  }
}

/**
 * 上传附件（mock：本地大小 / 类型校验 + 模拟分片进度 + 落内存库）。
 * 大小超限或类型不在白名单抛 ERR_INVALID_ATTACHMENT（42201，中文提示）。
 * @param onProgress 上传进度回调（0..1），供页面渲染线性进度条（PRD §6.5）
 * @param context 真实分支补齐 tenantId 用（源头 = task.tenantId）
 */
export async function uploadAttachment(
  taskId: string,
  input: UploadAttachmentInput,
  uploaderId: string,
  onProgress?: (ratio: number) => void,
  context?: UploadContext,
): Promise<Attachment> {
  if (USE_MOCK) {
    const validation = validateAttachment(input)
    if (!validation.ok) throw new ApiError(ERR_INVALID_ATTACHMENT, validation.message)
    const task = findTask(taskId)
    if (!task) throw new ApiError(40401, '任务不存在或不可见')

    // 模拟分片上传：按比例回推进度（让线性进度条可见）
    const steps = [0.25, 0.5, 0.75, 0.95]
    for (const ratio of steps) {
      onProgress?.(ratio)
      await delay(80)
    }

    const attachment: Attachment = {
      id: nextId('att'),
      tenantId: task.tenantId,
      resourceType: 'task',
      resourceId: taskId,
      objectKey: `${task.tenantId}/${taskId}/${sanitizeFileName(input.fileName)}`,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      uploaderId,
      createdAt: now(),
    }
    db.attachments.push(attachment)
    onProgress?.(1)
    pushAudit('attachment.create', uploaderId, taskId, `上传了附件「${input.fileName}」`)
    return { ...attachment }
  }
  // 真实分支：multipart/form-data → POST /api/v1/attachments
  // 前置守卫：既无 File（Web）也无 uri（native）⇒ 读不到文件内容，不发起请求
  if (input.file == null && !input.uri) {
    throw new ApiError(ERR_INVALID_ATTACHMENT, '未能读取所选文件内容，请重新选择')
  }

  const form = buildAttachmentFormData(input, 'task', taskId)
  // 真实 fetch 没有上传进度事件 ⇒ 不伪造百分比（架构裁决 M5：真实分支 UI 用不确定态）
  onProgress?.(0)
  const raw = await postMultipart<ServerUploadedAttachment>('/attachments', form)
  onProgress?.(1)
  // 上传响应不含 tenantId / uploaderId ⇒ 客户端补齐（tenantId 源头 = task.tenantId）
  return mapUploadedAttachment(raw, { tenantId: context!.tenantId, uploaderId })
}

/** 工时记录列表 */
export async function listTimeEntries(taskId: string): Promise<TimeEntry[]> {
  if (USE_MOCK) {
    await simulateLatency()
    return timeEntriesByTask(taskId)
  }
  // TODO(real-api): GET /tasks/:taskId/time-entries
  return httpClient.get<TimeEntry[]>(`/tasks/${taskId}/time-entries`)
}

/** 开始计时：若已有进行中的记录则直接返回（保证退出重进不重复开表） */
export async function startTimer(taskId: string, userId: string): Promise<TimeEntry> {
  if (USE_MOCK) {
    await simulateLatency()
    const task = findTask(taskId)
    if (!task) throw new ApiError(40401, '任务不存在或不可见')
    const running = db.timeEntries.find((entry) => entry.taskId === taskId && entry.endedAt === null)
    if (running) return { ...running }
    const entry: TimeEntry = {
      id: nextId('time'),
      tenantId: task.tenantId,
      taskId,
      userId,
      startedAt: now(),
      endedAt: null,
      durationSeconds: null,
      note: null,
    }
    db.timeEntries.unshift(entry)
    pushAudit('time.start', userId, taskId, `开始为「${task.title}」计时`)
    return { ...entry }
  }
  // TODO(real-api): POST /tasks/:taskId/time-entries  body: { action: 'start' }
  return httpClient.post<TimeEntry>(`/tasks/${taskId}/time-entries`, { action: 'start' })
}

/** 结束计时：写入 durationSeconds 并回填任务 actualHours */
export async function stopTimer(entryId: string, note?: string): Promise<TimeEntry> {
  if (USE_MOCK) {
    await simulateLatency()
    const entry = db.timeEntries.find((item) => item.id === entryId)
    if (!entry) throw new ApiError(40401, '计时记录不存在')
    const endedAt = now()
    const durationSeconds = Math.max(
      1,
      Math.round((new Date(endedAt).getTime() - new Date(entry.startedAt).getTime()) / 1000),
    )
    entry.endedAt = endedAt
    entry.durationSeconds = durationSeconds
    if (note !== undefined) entry.note = note

    // 回填 actual_hours（累计全部已结束的工时）
    const task = findTask(entry.taskId)
    if (task) {
      const totalSeconds = db.timeEntries
        .filter((item) => item.taskId === task.id && item.durationSeconds !== null)
        .reduce((sum, item) => sum + (item.durationSeconds ?? 0), 0)
      task.actualHours = Math.round((totalSeconds / 3600) * 10) / 10
      task.updatedAt = now()
      pushAudit('time.stop', entry.userId, task.id, `结束「${task.title}」计时`)
    }
    return { ...entry }
  }
  // TODO(real-api): PATCH /time-entries/:entryId  body: { action: 'stop', note }
  return httpClient.patch<TimeEntry>(`/time-entries/${entryId}`, { action: 'stop', note })
}

/** 任务依赖列表（只读抽屉） */
export async function listDependencies(taskId: string): Promise<TaskDependency[]> {
  if (USE_MOCK) {
    await simulateLatency()
    return dependenciesOfTask(taskId)
  }
  // TODO(real-api): GET /tasks/:taskId/dependencies
  return httpClient.get<TaskDependency[]>(`/tasks/${taskId}/dependencies`)
}

/** 创建团队任务入参（manager 直接创建，PRD §8.3） */
export interface CreateTaskInput {
  projectId: string | null
  title: string
  description?: string
  priority?: TaskPriority
  assigneeId?: string | null
  dueAt?: string | null
  estimatedHours?: number | null
  /**
   * 是否需要评审（增量 7 / M1）：管理员创建任务时选择。
   * `completeTask` 依此决定「完成 → pending_review」还是「完成 → done」；缺省 `false`。
   */
  reviewRequired?: boolean
}

/**
 * 构造并落库一条**正式团队任务**（mock 内部复用：createTask / 审核落地 / 免审直落）。
 * 产出恒为 `source='published'`、`status='todo'`、非提报记录（不进审核列表）。
 */
export function insertTask(input: CreateTaskInput, actorId: string): Task {
  const timestamp = now()
  const task: Task = {
    id: nextId('task'),
    tenantId: db.tenant.id,
    projectId: input.projectId ?? null,
    parentId: null,
    title: input.title,
    description: input.description ?? null,
    status: 'todo',
    priority: input.priority ?? 'medium',
    assigneeId: input.assigneeId ?? null,
    startAt: null,
    dueAt: input.dueAt ?? null,
    endAt: null,
    estimatedHours: input.estimatedHours ?? null,
    actualHours: null,
    completedAt: null,
    startedAt: null,
    createdBy: actorId,
    tags: [],
    sortOrder: db.tasks.filter((t) => t.projectId === (input.projectId ?? null)).length + 1,
    workflowColumnId: null,
    isAiGenerated: false,
    version: 1,
    source: 'published',
    submissionKind: null,
    submissionStatus: null,
    submissionNote: null,
    reviewNote: null,
    // M1：由创建入参决定（缺省 false），是 `reviewRequired` 的唯一写入点
    reviewRequired: input.reviewRequired ?? false,
    isReviewTask: false,
    reviewerIds: [],
    reviewedBy: null,
    reviewedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  db.tasks.push(task)
  return task
}

/** 创建团队任务（manager 直接创建，立即落地，无需审核） */
export async function createTask(input: CreateTaskInput, actorId: string): Promise<Task> {
  if (USE_MOCK) {
    await simulateLatency()
    const task = insertTask(input, actorId)
    pushAudit('task.create', actorId, task.id, `创建了任务「${task.title}」`)
    return { ...task }
  }
  // TODO(real-api): POST /tasks  body: { ...input }
  return httpClient.post<Task>('/tasks', input)
}

/** 提报事项入参（PRD §8.3） */
export interface SubmitItemInput {
  kind: SubmissionKind
  title: string
  description?: string
  priority?: TaskPriority
  /** kind='task' 时目标项目 */
  projectId?: string | null
  dueAt?: string | null
  estimatedHours?: number | null
  /** kind='project' 时拟负责人 */
  ownerId?: string | null
  /** 提报说明 */
  note?: string
}

/** 构造一条提报记录（未落库）：`source='submission'` + `submissionKind` 非空 → 被列表守卫隐藏 */
function buildSubmissionRecord(
  input: SubmitItemInput,
  actorId: string,
  reviewerIds: string[],
): Task {
  const timestamp = now()
  return {
    id: nextId('submission'),
    tenantId: db.tenant.id,
    projectId: input.kind === 'task' ? input.projectId ?? null : null,
    parentId: null,
    title: input.title.trim(),
    description: input.description ?? null,
    status: 'todo',
    priority: input.priority ?? 'medium',
    // kind='project'：assigneeId 承载「拟负责人」
    assigneeId: input.kind === 'project' ? input.ownerId ?? null : null,
    startAt: null,
    dueAt: input.dueAt ?? null,
    endAt: null,
    estimatedHours: input.estimatedHours ?? null,
    actualHours: null,
    completedAt: null,
    startedAt: null,
    createdBy: actorId,
    tags: [],
    sortOrder: 0,
    workflowColumnId: null,
    isAiGenerated: false,
    version: 1,
    source: 'submission',
    submissionKind: input.kind,
    submissionStatus: 'pending',
    submissionNote: input.note ?? null,
    reviewNote: null,
    reviewRequired: true,
    isReviewTask: false,
    reviewerIds,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

/**
 * 审核通过落地（mock 内部复用：reviewSubmission approve / submitItem manager 免审）。
 * 按 `resolveApproveBranch` 分叉：
 * - `project` → 落地为正式 `Project`；
 * - `task`    → 落地为正式 `Task`（`source='published'`、`status='todo'`）。
 * 提报记录本体：`submissionStatus='approved'`、`status='cancelled'`（归档，且被守卫隐藏）。
 */
function landSubmissionRecord(record: Task, reviewerId: string): void {
  const branch = resolveApproveBranch(record)
  if (branch === 'project') {
    insertProject(
      {
        name: record.title,
        description: record.description ?? undefined,
        ownerId: record.assigneeId,
        deadline: record.dueAt,
      },
      reviewerId,
    )
  } else if (branch === 'task') {
    insertTask(
      {
        projectId: record.projectId,
        title: record.title,
        description: record.description ?? undefined,
        priority: record.priority,
        assigneeId: record.assigneeId,
        dueAt: record.dueAt,
        estimatedHours: record.estimatedHours,
      },
      reviewerId,
    )
  }
  // 守卫（M6-P0-07 / K30）：提报记录归档迁移 pending → approved
  assertSubmissionTransition(record.submissionStatus, 'approved')
  record.submissionStatus = 'approved'
  record.reviewedBy = reviewerId
  record.reviewedAt = now()
  record.reviewNote = null
  record.status = 'cancelled' // 归档
  record.updatedAt = now()
}

/**
 * 提报事项：member 生成 `pending` 记录；manager 免审直接落地（PRD §8.3 / US2-01 / US2-08）。
 *
 * @param role 可选：前端演示角色。缺省时按 actorId 是否 manager 推导（Q2-4）。
 */
export async function submitItem(
  input: SubmitItemInput,
  actorId: string,
  role?: AppRole,
): Promise<Task> {
  if (USE_MOCK) {
    await simulateLatency()
    const titleError = validateSubmissionTitle(input.title)
    if (titleError) throw new ApiError(ERR_SUBMISSION_INVALID, titleError)

    const actorRole: AppRole = role ?? (isManagerUser(actorId) ? 'manager' : 'member')
    const record = buildSubmissionRecord(input, actorId, allManagerIds())
    db.tasks.push(record)

    if (actorRole === 'manager') {
      // 免审直接落地：立即通过并落地为正式事项（无待审中间态）
      landSubmissionRecord(record, actorId)
      pushAudit('submission.publish', actorId, record.id, `直接创建了「${record.title}」`)
    } else {
      pushAudit('submission.create', actorId, record.id, `提报了「${record.title}」，等待审核`)
    }
    return { ...record }
  }
  // TODO(real-api): POST /tasks/submissions  body: { ...input, role }
  return httpClient.post<Task>('/tasks/submissions', { ...input, role })
}

/** 我的提报（按最近更新倒序，PRD §8.3 / US2-02） */
export async function listMySubmissions(userId: string): Promise<Task[]> {
  if (USE_MOCK) {
    await simulateLatency()
    return db.tasks
      .filter((task) => task.createdBy === userId && isSubmissionRecord(task))
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
  // TODO(real-api): GET /tasks/submissions?createdBy=:userId
  return httpClient.get<Task[]>('/tasks/submissions', { query: { createdBy: userId } })
}

/** 撤回提报：仅「本人 + pending」可撤回（PRD §8.3 / §6 / Q2-5） */
export async function withdrawSubmission(
  taskId: string,
  version: number,
  actorId: string,
): Promise<Task> {
  if (USE_MOCK) {
    await simulateLatency()
    const task = findTask(taskId)
    if (!task) throw new ApiError(40401, '提报不存在或不可见')
    assertVersion(task, version)
    // 主体类型守卫（M6-P0-05 / ④）：本入口仅用于撤回**新事项提报记录**（`isSubmissionRecord`）。
    // 正式任务的「完成提报」必须走 `withdrawCompletion`；否则会把正式任务静默写成 cancelled（R6-5）。
    if (!isSubmissionRecord(task)) {
      throw new ApiError(ERR_SUBMISSION_FORBIDDEN, '该入口仅用于撤回新事项提报')
    }
    if (task.createdBy !== actorId) {
      throw new ApiError(ERR_SUBMISSION_FORBIDDEN, '只能撤回本人的提报')
    }
    if (task.submissionStatus !== 'pending') {
      throw new ApiError(ERR_SUBMISSION_FORBIDDEN, '仅待审核的提报可撤回')
    }
    // 守卫（M6-P0-07 / K30）：pending → withdrawn（`:917` 门禁已保证 from === 'pending'）
    assertSubmissionTransition(task.submissionStatus, 'withdrawn')
    task.submissionStatus = 'withdrawn'
    task.status = 'cancelled' // 归档，移出待审列表
    task.version += 1
    task.updatedAt = now()
    pushAudit('submission.withdraw', actorId, taskId, `撤回了「${task.title}」的提报`)
    return { ...task }
  }
  // TODO(real-api): POST /tasks/:taskId/submissions/withdraw  body: { version }
  return httpClient.post<Task>(`/tasks/${taskId}/submissions/withdraw`, { version })
}

/** 撤回「完成提报」入参（M5-P0-01 / M5-P1-02） */
export interface WithdrawCompletionInput {
  /** 乐观锁版本；与 task.version 不一致 ⇒ 抛 40901（ERR_OPTIMISTIC_LOCK） */
  version: number
  /** 撤回发起人；必须 === 提报人本人，否则抛 40302（ERR_SUBMISSION_FORBIDDEN） */
  actorId: string
  /** 撤回原因（**可选**，≤200 字；填写时并入 audit summary；不强制 ≥4 字，M5-P1-02） */
  reason?: string
}

/**
 * 撤回「完成提报」（M5-P0-01）：把提报人本人已提交的完成提报撤回，任务退出审核队列继续推进。
 *
 * 与 `withdrawSubmission` 的区别（R5-7 / R5-9）：
 * - 语义：`withdrawSubmission` = 撤回「新事项提报记录」（提报记录归档为 `cancelled`，正确）；
 *         `withdrawCompletion` = 撤回「正式任务的完成提报」（任务回到 `in_progress`，**永不写 `cancelled`**）。
 * - 主体：`withdrawCompletion` 主体 = 提报人（完成提报 = `assigneeId ?? createdBy`，M5-P0-02）。
 *
 * 行为约束：
 * - 主体判定**唯一事实来源** = `isWithdrawable(task, actorId)`（禁止内联手写第二份主体判据，K20）；
 * - 审核态清理**必须复用** `applyClearedReviewState()` → `createClearedReviewState()`（唯一构造点，K19）；
 * - **零通知**（不新增通知类型、不触碰通知系统，K24）。
 *
 * 检查顺序（校验一律在写入之前，失败时任务零变化，K22）：
 * `assertVersion`（40901）→ 前置态 `pending`（40302）→ 主体 `isWithdrawable`（40302）→ `status` 分支。
 */
export async function withdrawCompletion(
  taskId: string,
  input: WithdrawCompletionInput,
): Promise<Task> {
  if (USE_MOCK) {
    await simulateLatency()
    const task = findTask(taskId)
    if (!task) throw new ApiError(40401, '任务不存在或不可见')
    assertVersion(task, input.version) // ① 乐观锁 ⇒ 40901（AC-04）

    // ② 前置态：仍待审（精确提示；AC-05/06/07/08 均命中此处 ⇒ 40302）
    if (task.submissionStatus !== 'pending') {
      throw new ApiError(ERR_SUBMISSION_FORBIDDEN, '仅待审核的完成提报可撤回')
    }
    // ③ 主体：唯一事实来源 = isWithdrawable（M5-P0-02；AC-02 命中 ⇒ 40302）
    if (!isWithdrawable(task, input.actorId)) {
      throw new ApiError(ERR_SUBMISSION_FORBIDDEN, '只能撤回本人提交的完成提报')
    }

    // ④ 任务状态：完成态（done / pending_review）⇒ in_progress（先校验迁移合法，INV-1 放宽后保持）；
    //    非完成态 ⇒ 不改 status（避免非法自迁移 40902）
    if (task.status === 'done' || task.status === 'pending_review') {
      assertTransition(task.status, 'in_progress')
      task.status = 'in_progress'
      task.completedAt = null // INV-1（放宽）：completedAt != null ⟺ status ∈ {done, pending_review}
    }

    // ⑤ 提报状态迁移守卫（M6-P0-07 / K22 / K30）：`from` 必须在审核态清理**之前**快照（K28 / K34）
    //    —— `applyClearedReviewState` 会把 submissionStatus 置 null，之后读取会误判为「初始写入」而放行（K35）。
    // ⑥ 审核态清理：复用唯一构造点（K19）—— submissionStatus=null / reviewRequired=false /
    //    reviewerIds=[] / reviewNote=null / reviewedBy=null / reviewedAt=null
    const fromSubmissionStatus = task.submissionStatus
    assertSubmissionTransition(fromSubmissionStatus, 'withdrawn')
    applyClearedReviewState(task)
    task.submissionStatus = 'withdrawn' // 覆写（INV-8：pending → withdrawn 合法）
    // 增量 7.1（Route 2 · ARCH §2.4.2）：审核态已清理 ⇒ 同步关闭未完成评审子任务（数据卫生，消除孤儿）
    closeOpenReviewSubtasks(task)

    task.version += 1
    task.updatedAt = now()
    const reasonSuffix = input.reason ? `（原因：${input.reason}）` : ''
    pushAudit(
      'submission.withdraw.completion',
      input.actorId,
      taskId,
      `撤回了「${task.title}」的完成提报${reasonSuffix}`,
    ) // M5-P1-01：写团队动态；**零通知**（K24）
    return { ...task }
  }
  // TODO(real-api): POST /tasks/:taskId/submissions/withdraw-completion  body: { version, actorId, reason }
  return httpClient.post<Task>(`/tasks/${taskId}/submissions/withdraw-completion`, input)
}

/**
 * 审核提报（今日聚焦「通过 / 驳回」）。
 *
 * approve 分支按 `task.source` / `task.submissionKind` 分叉：
 * - `source='submission'` & `submissionKind='project'` → 落地正式 Project，提报记录归档；
 * - `source='submission'` & `submissionKind='task'`    → 落地正式 Task，提报记录归档；
 * - 其余（既有「完成提报」，如 task-014 / task-015）   → **保持现有行为完全不变**（回归红线）。
 *
 * 增量 7：新增结构化审核留痕（`Task.auditLogs`）。新增两个**可选**尾参以修正 B3：
 * @param actorId 真实操作人（缺省回落到旧行为 `reviewerIds[0] ?? createdBy`）；
 * @param opinion 审核意见（仅留痕；缺省 approve→`'agree'` / reject→`'reject'`）。
 * 既有 4 参调用完全兼容（签名向后兼容）。
 */
export async function reviewSubmission(
  taskId: string,
  action: 'approve' | 'reject',
  version: number,
  reason?: string,
  actorId?: string,
  opinion?: AuditOpinion,
): Promise<Task> {
  if (USE_MOCK) {
    await simulateLatency()
    const task = findTask(taskId)
    if (!task) throw new ApiError(40401, '任务不存在或不可见')
    assertVersion(task, version)
    const reviewerId = task.reviewerIds?.[0] ?? task.createdBy
    // B3 修正：操作人 = 真实发起人（缺省回落旧行为）
    const operatorId = actorId ?? reviewerId

    if (action === 'approve') {
      if (resolveApproveBranch(task) === 'completion') {
        // 既有「完成提报」行为完全不变（services.test.ts:168-180 全绿）
        // 守卫（M6-P0-07 / K30）：pending → approved
        assertSubmissionTransition(task.submissionStatus, 'approved')
        task.submissionStatus = 'approved'
        task.status = 'done'
        // PRD §6.3：通过（完成提报）→ completedAt **保持**（不覆写「声明完成」时刻，保准时率基准）
        task.completedAt = task.completedAt ?? now()
        task.reviewNote = null
        appendAuditLog(task, 'approve', opinion ?? 'agree', reason ?? '', operatorId)
        pushAudit('task.approve', reviewerId, taskId, `通过了「${task.title}」的完成提报`)
        // 站内通知：结果回流给提报人（M2-P1-03）
        pushNotification({
          userId: task.createdBy,
          type: 'review.result',
          title: '提报已通过',
          body: `你提交的「${task.title}」已完成提报`,
          data: { taskId },
        })
      } else {
        // 新事项提报：落地为正式事项 + 归档提报记录
        landSubmissionRecord(task, reviewerId)
        appendAuditLog(task, 'approve', opinion ?? 'agree', reason ?? '', operatorId)
        pushAudit('submission.approve', reviewerId, taskId, `通过了「${task.title}」的提报，已落地为正式事项`)
        // 站内通知：结果回流给提报人（M2-P1-03）
        pushNotification({
          userId: task.createdBy,
          type: 'review.result',
          title: '提报已通过',
          body: `你的提报「${task.title}」已通过审核`,
          data: { taskId },
        })
      }
    } else {
      // 驳回原因必填（≥4 字，PRD §6）
      if (!isValidReviewReason(reason)) {
        throw new ApiError(ERR_SUBMISSION_INVALID, `驳回原因不少于 ${REVIEW_REASON_MIN_LENGTH} 字`)
      }
      // 守卫（M6-P0-07 / K30）：pending → rejected
      assertSubmissionTransition(task.submissionStatus, 'rejected')
      task.submissionStatus = 'rejected'
      // 完成提报驳回回到 in_progress（既有行为）；新事项提报驳回归档
      task.status = isSubmissionRecord(task) ? 'cancelled' : 'in_progress'
      // S3（增量 2）：完成提报驳回 ⇒ 清空 completedAt（INV-1 放宽：completedAt != null ⟺ status ∈ {done, pending_review}）
      if (resolveApproveBranch(task) === 'completion') task.completedAt = null
      task.reviewNote = reason ?? '未填写驳回原因'
      // 文案分叉（仅文案）：opinion='rework' ⇒ 退回重改，否则驳回。状态机完全不动（用户拍板）。
      const isRework = opinion === 'rework'
      appendAuditLog(task, 'reject', opinion ?? 'reject', task.reviewNote, operatorId)
      pushAudit('task.reject', reviewerId, taskId,
        isRework ? `退回了「${task.title}」的提报` : `驳回了「${task.title}」的提报`)
      // 站内通知：正文包含驳回原因，故必须在 reviewNote 赋值之后写入（M2-P1-03）
      pushNotification({
        userId: task.createdBy,
        type: 'review.result',
        title: isRework ? '提报已退回重改' : '提报已驳回',
        body: isRework
          ? `你的提报「${task.title}」被退回重改：${task.reviewNote}`
          : `你的提报「${task.title}」被驳回：${task.reviewNote}`,
        data: { taskId },
      })
    }
    task.version += 1
    task.updatedAt = now()
    return { ...task }
  }
  // TODO(real-api): POST /tasks/:taskId/review  body: { action, reason, version, actorId, opinion }
  return httpClient.post<Task>(`/tasks/${taskId}/review`, { action, reason, version, actorId, opinion })
}

/**
 * 撤回「完成提报」并通知审核人（M6-P0-01）：**产品唯一入口**（K33）。
 *
 * 分层（K33）：`withdrawCompletion`（纯状态迁移、**零通知**，K24）→ 本包装（迁移 + 通知副作用）。
 * 时序（K28 / K34，双重快照陷阱）：
 *   ① `reviewerIds` **必须在调用 `withdrawCompletion` 之前**快照 —— 其内部 `applyClearedReviewState`
 *      会把 `reviewerIds` 置 `[]`，调用后读取必为空；
 *   ② `submissionStatus` 的 `from` 在 `withdrawCompletion` 内部于清理**之前**快照（W6）。
 * 派发时机：**仅撤回成功后**（先迁移后派发）⇒ 失败（40302/40901）**零通知、零副作用**（INV-3）。
 * 接收人来源 = `task.reviewerIds`（与 `listPendingReview` 的可见性判定同源，K18）。
 * 写入器 = `pushNotificationOnce`（未读级去重：`userId`+`type`+`data.taskId`，未读判定 `readAt === null`，K29）。
 *
 * ⚠️ 定义位置为硬约束（K38）：**必须置于 `reviewSubmission` 之后**。全仓有 2 处源码切片断言
 *    （`increment4-qa.test.ts` / `increment4-withdraw.test.ts`）以
 *    `[indexOf('export async function withdrawCompletion'), indexOf('export async function reviewSubmission'))`
 *    取「`withdrawCompletion` 函数体」并断言 `not.toContain('pushNotification')`；本函数体含
 *    `pushNotificationOnce`（**含子串** `pushNotification`）⇒ 插在其间会同时打破这两处断言。
 */
export async function withdrawCompletionAndNotify(
  taskId: string,
  input: WithdrawCompletionInput,
  opinion?: AuditOpinion,
): Promise<Task> {
  if (USE_MOCK) {
    await simulateLatency()
    const task = findTask(taskId)
    if (!task) throw new ApiError(40401, '任务不存在或不可见')

    // ① 快照：必须在 withdrawCompletion 的清理之前（K28 / K34）
    const reviewerIds = [...(task.reviewerIds ?? [])]

    // ② 先迁移（失败即抛出 ⇒ 零通知、零副作用）
    await withdrawCompletion(taskId, input)

    // ③ 结构化审核留痕（撤回动作）：写回**活引用** `task`（`withdrawCompletion` 返回的是浅拷贝快照，
    //    在其上追加不会落库）；opinion 仅留痕，缺省 'other'。
    appendAuditLog(task, 'withdraw', opinion ?? 'other', input.reason ?? '', input.actorId)

    // ④ 后派发：撤回前全部审核人各 1 条（未读级去重，K29）
    for (const reviewerId of reviewerIds) {
      pushNotificationOnce({
        userId: reviewerId,
        type: 'review.withdrawn',
        title: '提报已撤回',
        body: `「${task.title}」的完成提报已被提报人撤回，无需审核`,
        data: { taskId },
      })
    }
    return { ...task }
  }
  // TODO(real-api): POST /tasks/:taskId/submissions/withdraw-completion  body: { version, actorId, reason, notify: true, opinion }
  return httpClient.post<Task>(`/tasks/${taskId}/submissions/withdraw-completion`, {
    ...input,
    notify: true,
    opinion,
  })
}

/** 供时间容器使用的「今日任务块」（含 startAt / endAt 的任务） */
export async function listScheduledTasks(timezone: string): Promise<Task[]> {
  if (USE_MOCK) {
    await simulateLatency()
    const today = toDateKey(new Date(), timezone)
    return db.tasks.filter((task) => {
      if (!task.startAt) return false
      if (task.status === 'cancelled') return false
      if (isSubmissionRecord(task)) return false // 提报记录不进正式列表（ARCH §7）
      return toDateKey(task.startAt, timezone) === today || toDateKey(task.dueAt ?? task.startAt, timezone) === today
    })
  }
  // TODO(real-api): GET /tasks?scope=scheduled&date=:date
  return httpClient.get<Task[]>('/tasks', { query: { scope: 'scheduled' } })
}

/** 演示用：取「今天 09:00」的 ISO（供页面构造默认时间） */
export function todayAt(hour: number, minute = 0): string {
  return demoDayAt(0, hour, minute)
}

// ── 增量 7：审核域内部辅助（**必须置于文件末尾**）──────────────────────────────
// ⚠️ 定义位置为硬约束（ARCH §6-T02-6）：不得插入 `withdrawCompletion` 与 `reviewSubmission`
//    之间（保护 2 处源码切片断言 `increment4-qa.test.ts:551-554` / `increment4-withdraw.test.ts:342-345`）。
//    二者均为**函数声明**（可提升），故文件靠前的 `completeTask` / `reviewSubmission` 可正常调用。

/**
 * 追加一条结构化审核日志（挂 `Task.auditLogs`）。
 * 操作人姓名从用户表解析；`opinion` 仅留痕，不影响状态（对齐 `AuditPage.tsx:153-162`）。
 */
function appendAuditLog(
  task: Task,
  action: AuditAction,
  opinion: AuditOpinion,
  reason: string,
  operatorId: string,
): AuditLog {
  const log: AuditLog = {
    id: nextId('audit'),
    taskId: task.id,
    action,
    opinion,
    reason,
    operatorId,
    operatorName: findUser(operatorId)?.displayName ?? '系统',
    createdAt: now(),
  }
  task.auditLogs = [...(task.auditLogs ?? []), log]
  return log
}

/**
 * 评审子任务生成 / 复用（对齐后端 `tasks.service.ts:353-385`）。
 *
 * - **复用优先**：同一主任务下已存在 `isReviewTask === true` 且 `status ∉ {done, cancelled}` 的子任务
 *   ⇒ 直接复用（覆盖「驳回后重新提报」路径，避免重复创建）；
 *   ⚠️ 增量 7.1（缺陷 C · ARCH §2.4.3）：`cancelled` 子任务**不得复用** —— 用户可在 UI 里
 *   「取消任务」把它置为 `cancelled`（`TASK_TRANSITION_ACTIONS.todo` 含 `→ cancelled`），
 *   若复用则评审形同虚设、且叠加门禁 E 会造成审批死锁。
 * - 否则新建：承接人 `project.ownerId ?? mainTask.createdBy`（对齐后端 `:359`），
 *   `status='todo'`（`:367`，须先开始执行再完成）、`priority='high'`（`:368`）、
 *   `source='published'`（`:372`）、`reviewRequired=false`（`:373`，防递归）、`isReviewTask=true`（`:374`）；
 * - 新建后向承接人派发 1 条 `task.review.pending` 通知（未读级去重）。
 */
function ensureReviewSubtask(mainTask: Task): Task {
  const open = db.tasks.find(
    (task) =>
      task.parentId === mainTask.id &&
      task.isReviewTask === true &&
      task.status !== 'done' &&
      task.status !== 'cancelled',
  )
  if (open) return open

  const project = findProject(mainTask.projectId)
  const owner = project?.ownerId ?? mainTask.createdBy
  const timestamp = now()
  const child: Task = {
    id: nextId('task'),
    tenantId: mainTask.tenantId,
    projectId: mainTask.projectId,
    parentId: mainTask.id,
    title: `项目评审 — ${mainTask.title}`,
    description: null,
    status: 'todo',
    priority: 'high',
    assigneeId: owner,
    startAt: timestamp,
    dueAt: null,
    endAt: null,
    estimatedHours: null,
    actualHours: null,
    completedAt: null,
    startedAt: null,
    createdBy: mainTask.createdBy,
    tags: [],
    sortOrder: db.tasks.filter((task) => task.parentId === mainTask.id).length + 1,
    workflowColumnId: null,
    isAiGenerated: false,
    version: 1,
    source: 'published',
    submissionKind: null,
    submissionStatus: null,
    submissionNote: null,
    reviewNote: null,
    reviewRequired: false,
    isReviewTask: true,
    reviewerIds: owner ? [owner] : [],
    reviewedBy: null,
    reviewedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  db.tasks.push(child)
  if (owner) {
    pushNotificationOnce({
      userId: owner,
      type: 'task.review.pending',
      title: '待你评审',
      body: `「${mainTask.title}」已完成提报，请进行项目评审`,
      data: { taskId: child.id },
    })
  }
  return child
}

/**
 * 关闭主任务下**未完成**的评审子任务（数据卫生：消除孤儿评审子任务，ARCH §2.4.2 / 分类 R）。
 *
 * 触发口径（唯一）= 主任务「本轮提报」的评审需求被清除（`reviewRequired → false`），
 *   由 `createClearedReviewState()` 承载，共 4 个清除点（`moveTask` / `reopenTask` /
 *   `undoCompletion` / `withdrawCompletion`）。
 * ⚠️ 不得以「离开 `pending_review`」为判据 —— 驳回同样离开 `pending_review`，但
 *   `reviewRequired` 保持 `true`，子任务须存活供「驳回后重新提报」复用。
 * 关闭方式 = `status='cancelled'`（移动端 `Task` 无 `deletedAt`；`todo` / `in_progress` 均可迁
 *   `cancelled`）。**幂等**：已 `done` / 已 `cancelled` 跳过。**零通知**：仅状态变更。
 * ⚠️ 定义位置 = 文件末尾（同 `ensureReviewSubtask`）；不得把 `'cancelled'` / `pushNotification`
 *   字面量写进 `withdrawCompletion` / `undoCompletion` 函数体（保护 4 处源码切片断言）。
 */
function closeOpenReviewSubtasks(mainTask: Task): void {
  const timestamp = now()
  for (const child of db.tasks) {
    if (child.parentId !== mainTask.id) continue
    if (child.isReviewTask !== true) continue
    if (child.status === 'done' || child.status === 'cancelled') continue
    child.status = 'cancelled'
    child.version += 1
    child.updatedAt = timestamp
  }
}
