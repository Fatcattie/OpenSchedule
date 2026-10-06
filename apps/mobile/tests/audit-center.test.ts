/**
 * 职责：增量 7 独立验收套件 —— 审核域派生纯函数 + 四栏筛选 + 评审子任务闭环 + 审核日志 +
 * M1 完成分流（reviewRequired）+ M3「待评审」看板列。
 *
 * 覆盖：ARCH-mobile-increment-7 §4.2 / §4.4 / §5.1 / §5.2 / §6-T05。
 * 约束：不修改既有套件的任何断言（本文件为新增）。
 */
import { DEMO_USER_IDS, allManagerIds, db, findTask, resetDatabase } from '@/data'
import { auditService } from '@/services'
import * as projectService from '@/services/project.service'
import * as taskService from '@/services/task.service'
import type { Task } from '@/types'
import {
  canApproveMainTask,
  deriveApprovalStatus,
  deriveApprovalType,
  derivePendingReview,
  filterApproved,
  filterPendingAudit,
  filterPendingReport,
  filterWithdrawnLogs,
  isTaskRelated,
  lastApproveLog,
} from '@/utils/audit'

const ME = DEMO_USER_IDS.me
const LINA = DEMO_USER_IDS.lina
const MANAGER = DEMO_USER_IDS.manager

/** 合成任务（仅补齐必要字段，其余走默认值） */
function makeTask(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  const base: Task = {
    id: partial.id,
    title: partial.title,
    tenantId: 'tenant-001',
    projectId: null,
    parentId: null,
    description: null,
    status: 'todo',
    priority: 'medium',
    assigneeId: null,
    dueAt: null,
    estimatedHours: null,
    actualHours: null,
    completedAt: null,
    startedAt: null,
    createdBy: ME,
    tags: [],
    sortOrder: 0,
    workflowColumnId: null,
    isAiGenerated: false,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
  return { ...base, ...partial }
}

beforeEach(() => {
  resetDatabase()
})

// ── ① 派生纯函数 ───────────────────────────────────────────────────────────

describe('deriveApprovalStatus —— 映射移动端字段 → web 四值', () => {
  it('评审子任务恒为 none（即便 submissionStatus=pending）', () => {
    expect(
      deriveApprovalStatus(makeTask({ id: 'x', title: 'x', isReviewTask: true, submissionStatus: 'pending' })),
    ).toBe('none')
  })

  it('pending / approved / rejected 逐值映射', () => {
    expect(deriveApprovalStatus(makeTask({ id: 'x', title: 'x', submissionStatus: 'pending' }))).toBe('pending')
    expect(deriveApprovalStatus(makeTask({ id: 'x', title: 'x', submissionStatus: 'approved' }))).toBe('approved')
    expect(deriveApprovalStatus(makeTask({ id: 'x', title: 'x', submissionStatus: 'rejected' }))).toBe('rejected')
  })

  it('null / undefined / draft / withdrawn 均归 none', () => {
    for (const value of [null, undefined, 'draft', 'withdrawn'] as const) {
      expect(deriveApprovalStatus(makeTask({ id: 'x', title: 'x', submissionStatus: value }))).toBe('none')
    }
  })
})

describe('deriveApprovalType —— 仅 D2 两类', () => {
  it('source=submission 且 submissionKind 非空 ⇒ proposal（project / task 同）', () => {
    expect(deriveApprovalType(makeTask({ id: 'x', title: 'x', source: 'submission', submissionKind: 'project' }))).toBe('proposal')
    expect(deriveApprovalType(makeTask({ id: 'x', title: 'x', source: 'submission', submissionKind: 'task' }))).toBe('proposal')
  })

  it('其余（含完成提报 / 正式任务）⇒ completion', () => {
    expect(deriveApprovalType(makeTask({ id: 'x', title: 'x', source: 'submission' }))).toBe('completion')
    expect(deriveApprovalType(makeTask({ id: 'x', title: 'x', source: 'published' }))).toBe('completion')
  })
})

describe('derivePendingReview —— 待评审语义（严格对齐后端 needsReview）', () => {
  it('reviewRequired=true ∧ 非评审子任务 ∧ submissionStatus=pending ⇒ true', () => {
    expect(
      derivePendingReview(makeTask({ id: 'x', title: 'x', reviewRequired: true, submissionStatus: 'pending' })),
    ).toBe(true)
  })

  it('isReviewTask=true ⇒ false（评审子任务自身不走提报审核）', () => {
    expect(
      derivePendingReview(
        makeTask({ id: 'x', title: 'x', reviewRequired: true, isReviewTask: true, submissionStatus: 'pending' }),
      ),
    ).toBe(false)
  })

  it('reviewRequired 非 true 或 submissionStatus 非 pending ⇒ false', () => {
    expect(derivePendingReview(makeTask({ id: 'x', title: 'x', submissionStatus: 'pending' }))).toBe(false)
    expect(
      derivePendingReview(makeTask({ id: 'x', title: 'x', reviewRequired: true, submissionStatus: 'approved' })),
    ).toBe(false)
  })
})

describe('canApproveMainTask —— 审批门禁（M2，UI 层）', () => {
  const main = { id: 'main-1' }

  it('无评审子任务 ⇒ true', () => {
    expect(canApproveMainTask(main, [])).toBe(true)
  })

  it('存在未 done 的评审子任务 ⇒ false；全部 done ⇒ true', () => {
    const children = [
      { parentId: 'main-1', isReviewTask: true as const, status: 'todo' as const },
      { parentId: 'main-1', isReviewTask: true as const, status: 'done' as const },
    ]
    expect(canApproveMainTask(main, children)).toBe(false)
    expect(canApproveMainTask(main, children.map((c) => ({ ...c, status: 'done' as const })))).toBe(true)
  })

  it('非评审子任务 / 他父任务 不参与门禁', () => {
    expect(
      canApproveMainTask(main, [
        { parentId: 'main-1', isReviewTask: false, status: 'todo' },
        { parentId: 'other', isReviewTask: true, status: 'todo' },
      ]),
    ).toBe(true)
  })
})

describe('isTaskRelated —— 相关任务口径（对齐 AuditPage.tsx:65-70）', () => {
  it('manager ⇒ 全部相关', () => {
    expect(isTaskRelated(makeTask({ id: 'x', title: 'x' }), ME, true)).toBe(true)
  })

  it('member ⇒ assigneeId 或 createdBy 命中', () => {
    expect(isTaskRelated(makeTask({ id: 'x', title: 'x', assigneeId: LINA }), LINA, false)).toBe(true)
    expect(isTaskRelated(makeTask({ id: 'x', title: 'x', createdBy: LINA }), LINA, false)).toBe(true)
    expect(isTaskRelated(makeTask({ id: 'x', title: 'x', assigneeId: ME, createdBy: ME }), LINA, false)).toBe(false)
  })
})

// ── ② 四栏筛选 ─────────────────────────────────────────────────────────────

describe('四栏筛选 —— 纯函数（含 D6 宽口径 / 日志流倒序）', () => {
  it('filterPendingReport：排除评审子任务 / 完成 / 取消 / 待审；**包含**已通过未完成（D6 宽口径）', () => {
    const tasks = [
      makeTask({ id: 'a', title: 'a', status: 'in_progress' }),
      makeTask({ id: 'b', title: 'b', status: 'done' }),
      makeTask({ id: 'c', title: 'c', status: 'cancelled' }),
      makeTask({ id: 'd', title: 'd', status: 'in_progress', submissionStatus: 'pending' }),
      makeTask({ id: 'e', title: 'e', isReviewTask: true, status: 'todo' }),
      // 已通过但未完成 ⇒ D6 宽口径：应同时出现在「待提报」与「审核通过」
      makeTask({ id: 'f', title: 'f', status: 'in_progress', submissionStatus: 'approved' }),
    ]
    expect(filterPendingReport(tasks).map((t) => t.id)).toEqual(['a', 'f'])
  })

  it('filterPendingAudit：仅 submissionStatus=pending，按 updatedAt 降序', () => {
    const tasks = [
      makeTask({ id: 'a', title: 'a', submissionStatus: 'pending', updatedAt: '2026-01-01T00:00:00.000Z' }),
      makeTask({ id: 'b', title: 'b', submissionStatus: 'pending', updatedAt: '2026-02-01T00:00:00.000Z' }),
      makeTask({ id: 'c', title: 'c', submissionStatus: 'approved' }),
    ]
    expect(filterPendingAudit(tasks).map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('filterApproved：submissionStatus=approved，受日期区间筛选（取最后一条 approve 日志）', () => {
    const approved = makeTask({
      id: 'a',
      title: 'a',
      submissionStatus: 'approved',
      auditLogs: [
        {
          id: 'l1',
          taskId: 'a',
          action: 'approve',
          opinion: 'agree',
          reason: '',
          operatorId: ME,
          operatorName: '张伟',
          createdAt: '2026-03-01T00:00:00.000Z',
        },
      ],
    })
    expect(filterApproved([approved], null).map((t) => t.id)).toEqual(['a'])
    expect(filterApproved([approved], { from: '2026-02-01T00:00:00.000Z', to: '2026-04-01T00:00:00.000Z' }).map((t) => t.id)).toEqual(['a'])
    expect(filterApproved([approved], { from: '2026-05-01T00:00:00.000Z', to: null })).toEqual([])
    expect(lastApproveLog(approved)?.id).toBe('l1')
  })

  it('filterWithdrawnLogs：日志流（action !== approve），createdAt 降序', () => {
    const task = makeTask({
      id: 'a',
      title: 'a',
      auditLogs: [
        { id: 'l1', taskId: 'a', action: 'approve', opinion: 'agree', reason: '', operatorId: ME, operatorName: '张伟', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'l2', taskId: 'a', action: 'reject', opinion: 'reject', reason: '不合格', operatorId: MANAGER, operatorName: '陈明', createdAt: '2026-02-01T00:00:00.000Z' },
        { id: 'l3', taskId: 'a', action: 'withdraw', opinion: 'other', reason: '', operatorId: ME, operatorName: '张伟', createdAt: '2026-03-01T00:00:00.000Z' },
      ],
    })
    const logs = filterWithdrawnLogs([task], null)
    expect(logs.map((l) => l.id)).toEqual(['l3', 'l2']) // 排除 approve + 降序
    expect(logs[0].task.id).toBe('a')
    expect(filterWithdrawnLogs([task], { from: '2026-02-15T00:00:00.000Z', to: null }).map((l) => l.id)).toEqual(['l3'])
  })
})

// ── ③ 评审子任务生成 / 复用（对齐 tasks.service.ts:353-385） ─────────────────

describe('ensureReviewSubtask —— 生成 / 复用', () => {
  it('completeTask(需评审) ⇒ 生成评审子任务（承接人 = project.ownerId，字段齐全）', async () => {
    const before = findTask('task-004')!
    await taskService.completeTask('task-004', { version: before.version })

    const child = db.tasks.find((t) => t.parentId === 'task-004' && t.isReviewTask === true)
    expect(child).toBeDefined()
    expect(child?.title).toBe('项目评审 — 首页原型设计')
    expect(child?.status).toBe('todo')
    expect(child?.priority).toBe('high')
    expect(child?.source).toBe('published')
    expect(child?.reviewRequired).toBe(false)
    expect(child?.assigneeId).toBe(ME) // project-001.ownerId = user-001
    expect(child?.reviewerIds).toEqual([ME])
    // 承接人收到 task.review.pending 通知
    expect(
      db.notifications.some((n) => n.type === 'task.review.pending' && n.userId === ME),
    ).toBe(true)
  })

  it('驳回后重新提报 ⇒ 复用未完成评审子任务（不重复创建）', async () => {
    const before = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { version: before.version })
    const childId = db.tasks.find((t) => t.parentId === 'task-004' && t.isReviewTask === true)!.id

    const rejected = await taskService.reviewSubmission('task-004', 'reject', done.version, '说明不充分')
    await taskService.completeTask('task-004', { version: rejected.version })

    const children = db.tasks.filter((t) => t.parentId === 'task-004' && t.isReviewTask === true)
    expect(children).toHaveLength(1)
    expect(children[0].id).toBe(childId)
  })

  it('门禁：评审子任务未完成 ⇒ canApproveMainTask=false；完成后 = true', async () => {
    const before = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { version: before.version })
    const child = db.tasks.find((t) => t.parentId === 'task-004' && t.isReviewTask === true)!
    expect(canApproveMainTask(done, db.tasks)).toBe(false)

    await taskService.moveTask(child.id, { status: 'in_progress', version: child.version })
    await taskService.completeTask(child.id, { version: findTask(child.id)!.version })
    expect(canApproveMainTask(findTask('task-004')!, db.tasks)).toBe(true)
  })
})

// ── ④ 审核日志（结构化留痕） ────────────────────────────────────────────────

describe('审核日志 —— Task.auditLogs', () => {
  it('approve 写 1 条 approve 日志（真实操作人 = actorId，opinion 仅留痕）', async () => {
    const before = findTask('task-014')!
    const approved = await taskService.reviewSubmission('task-014', 'approve', before.version, '同意', MANAGER, 'rework')

    expect(approved.submissionStatus).toBe('approved')
    expect(approved.auditLogs).toHaveLength(1)
    expect(approved.auditLogs?.[0]).toMatchObject({
      taskId: 'task-014',
      action: 'approve',
      opinion: 'rework',
      reason: '同意',
      operatorId: MANAGER,
      operatorName: '陈明',
    })
  })

  it('reject 写 1 条 reject 日志（reason 落库）', async () => {
    const before = findTask('task-014')!
    const rejected = await taskService.reviewSubmission('task-014', 'reject', before.version, '说明不充分')
    expect(rejected.auditLogs?.[0]).toMatchObject({
      action: 'reject',
      opinion: 'reject',
      reason: '说明不充分',
      operatorId: ME, // 缺省 actorId ⇒ 回落 reviewerIds[0]
    })
  })

  it('withdraw（withdrawCompletionAndNotify）写 1 条 withdraw 日志', async () => {
    const before = findTask('task-014')!
    const withdrawn = await taskService.withdrawCompletionAndNotify(
      'task-014',
      { version: before.version, actorId: LINA },
      'other',
    )
    expect(withdrawn.auditLogs?.[0]).toMatchObject({
      action: 'withdraw',
      opinion: 'other',
      operatorId: LINA,
      operatorName: '李娜',
    })
  })

  it('auditService.submitAudit 编排 approve → 状态 + 日志', async () => {
    const before = findTask('task-014')!
    const result = await auditService.submitAudit({
      taskId: 'task-014',
      action: 'approve',
      opinion: 'agree',
      reason: '',
      version: before.version,
      actorId: MANAGER,
    })
    expect(result.status).toBe('done')
    expect(result.auditLogs?.[0].action).toBe('approve')
    expect(result.auditLogs?.[0].operatorId).toBe(MANAGER)
  })

  it('auditService.listAuditTasks：manager 全量；member 仅本人相关', async () => {
    const asManager = await auditService.listAuditTasks(MANAGER, true)
    expect(asManager.length).toBe(db.tasks.length)
    const asMember = await auditService.listAuditTasks(LINA, false)
    expect(asMember.every((t) => t.assigneeId === LINA || t.createdBy === LINA)).toBe(true)
  })
})

// ── ⑤ M1 完成分流（reviewRequired 由创建期决定） ─────────────────────────────

describe('M1 —— createTask(reviewRequired) 决定完成分流', () => {
  /** 创建并推进到 in_progress（todo 无 done / pending_review 出边） */
  async function createInProgress(reviewRequired: boolean): Promise<Task> {
    const created = await taskService.createTask(
      { projectId: 'project-001', title: `M1-${reviewRequired}`, reviewRequired },
      ME,
    )
    return taskService.moveTask(created.id, { status: 'in_progress', version: created.version })
  }

  it('reviewRequired=false ⇒ 完成直落 done，不写提报态 / 不生成评审子任务 / 不发 review.pending', async () => {
    const live = await createInProgress(false)
    expect(live.reviewRequired).toBe(false)

    const done = await taskService.completeTask(live.id, { version: live.version })

    expect(done.status).toBe('done')
    expect(done.submissionStatus ?? null).toBeNull()
    expect(done.reviewRequired).toBe(false)
    expect(db.tasks.some((t) => t.parentId === live.id && t.isReviewTask === true)).toBe(false)
    expect(db.notifications.some((n) => n.type === 'review.pending' && n.data?.taskId === live.id)).toBe(false)
  })

  it('reviewRequired=true ⇒ 完成落 pending_review，写提报态 + 生成评审子任务 + 发 review.pending', async () => {
    const live = await createInProgress(true)
    expect(live.reviewRequired).toBe(true)

    const done = await taskService.completeTask(live.id, { version: live.version })

    expect(done.status).toBe('pending_review')
    expect(done.submissionStatus).toBe('pending')
    expect(done.reviewerIds).toEqual(allManagerIds())
    expect(db.tasks.some((t) => t.parentId === live.id && t.isReviewTask === true)).toBe(true)
    expect(db.notifications.filter((n) => n.type === 'review.pending' && n.data?.taskId === live.id)).toHaveLength(
      allManagerIds().length,
    )
  })
})

// ── ⑥ M3「待评审」看板列 ────────────────────────────────────────────────────

describe('M3 —— 看板新增「待评审」列', () => {
  it('listBoardColumns 含 pending_review 列（位于 blocked 与 done 之间）', async () => {
    const columns = await projectService.listBoardColumns('project-001')
    expect(columns.map((c) => c.status)).toEqual([
      'todo',
      'in_progress',
      'blocked',
      'pending_review',
      'done',
    ])
    expect(columns.find((c) => c.status === 'pending_review')?.label).toBe('待评审')
  })

  it('完成提报后，任务进入 pending_review 列（不进 done 列）', async () => {
    const before = findTask('task-004')!
    await taskService.completeTask('task-004', { version: before.version })

    const columns = await projectService.listBoardColumns('project-001')
    const reviewColumn = columns.find((c) => c.status === 'pending_review')!
    const doneColumn = columns.find((c) => c.status === 'done')!
    expect(reviewColumn.tasks.map((t) => t.id)).toContain('task-004')
    expect(doneColumn.tasks.map((t) => t.id)).not.toContain('task-004')
  })
})

// ── ⑦ 评审子任务生命周期 —— 孤儿消除（增量 7.1 · 分类 R，Route 2） ─────────────

/** 主任务下全部评审子任务（活引用） */
function reviewChildren(mainId: string): Task[] {
  return db.tasks.filter((task) => task.parentId === mainId && task.isReviewTask === true)
}

/** 是否存在「未完成」评审子任务（status ∉ {done, cancelled}） */
function hasOpenReviewChild(mainId: string): boolean {
  return reviewChildren(mainId).some((task) => task.status !== 'done' && task.status !== 'cancelled')
}

describe('评审子任务生命周期 —— 孤儿消除（增量 7.1 · 分类 R）', () => {
  it('R-1 撤回完成提报 ⇒ 未完成评审子任务被关闭（cancelled），无孤儿残留', async () => {
    const before = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { version: before.version })
    expect(reviewChildren('task-004')).toHaveLength(1)
    expect(hasOpenReviewChild('task-004')).toBe(true)

    await taskService.withdrawCompletion('task-004', { version: done.version, actorId: LINA })

    const children = reviewChildren('task-004')
    expect(children).toHaveLength(1)
    expect(children[0].status).toBe('cancelled')
    expect(hasOpenReviewChild('task-004')).toBe(false)
  })

  it('R-2 撤销完成提报（submissionStatus: null）⇒ 评审子任务被关闭', async () => {
    const before = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { version: before.version })

    await taskService.undoCompletion('task-004', {
      status: 'in_progress',
      submissionStatus: null,
      version: done.version,
    })

    expect(reviewChildren('task-004')[0].status).toBe('cancelled')
    expect(hasOpenReviewChild('task-004')).toBe(false)
  })

  it('R-3 moveTask 离开完成态（pending_review → in_progress）⇒ 评审子任务被关闭', async () => {
    const before = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { version: before.version })

    await taskService.moveTask('task-004', { status: 'in_progress', version: done.version })

    expect(reviewChildren('task-004')[0].status).toBe('cancelled')
  })

  it('R-4 reopenTask（pending_review → todo）⇒ 评审子任务被关闭', async () => {
    const before = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { version: before.version })

    await taskService.reopenTask('task-004', { reason: '需求变更', version: done.version })

    expect(reviewChildren('task-004')[0].status).toBe('cancelled')
  })

  it('R-5 反向：驳回后评审子任务必须存活，且再次完成复用同一子任务（不重复创建）', async () => {
    const before = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { version: before.version })
    const childId = reviewChildren('task-004')[0].id

    const rejected = await taskService.reviewSubmission('task-004', 'reject', done.version, '说明不充分')
    // 驳回 ≠ 清除评审需求（reviewRequired 保持 true）⇒ 子任务必须存活供复用
    expect(findTask('task-004')!.reviewRequired).toBe(true)
    expect(reviewChildren('task-004')[0].status).not.toBe('cancelled')

    await taskService.completeTask('task-004', { version: rejected.version })

    const children = reviewChildren('task-004')
    expect(children).toHaveLength(1)
    expect(children[0].id).toBe(childId)
  })

  it('R-6 反向·守门：审核轮回态（submissionStatus: pending）⇒ 子任务必须存活（防无条件关闭）', async () => {
    const before = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { version: before.version })

    const undone = await taskService.undoCompletion('task-004', {
      status: 'in_progress',
      submissionStatus: 'pending',
      version: done.version,
    })

    // 审核轮回态：resolveUndoReviewReset('pending') === null ⇒ 不清理审核态 ⇒ 子任务不得被关闭
    expect(undone.reviewRequired).toBe(true)
    expect(undone.submissionStatus).toBe('pending')
    expect(reviewChildren('task-004')[0].status).not.toBe('cancelled')
    expect((await taskService.listPendingReview(ME)).some((t) => t.id === 'task-004')).toBe(true)
  })
})

// ── ⑧ 「取消评审子任务 → 驳回 → 重新提报」链（增量 7.1 · 分类 S：C + E） ────────

describe('取消评审子任务 → 驳回 → 重新提报（增量 7.1 · 分类 S：C 复用过滤 + E 门禁）', () => {
  it('S-1（C）：已 cancelled 的评审子任务不得复用 ⇒ 重新提报时新建（计数 2、id 不同、status=todo）', async () => {
    const before = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { version: before.version })
    const stale = reviewChildren('task-004')[0]

    // 模拟「用户在 UI 里取消该评审子任务」（todo → cancelled，合法迁移）
    stale.status = 'cancelled'
    expect(reviewChildren('task-004')).toHaveLength(1)

    // 驳回（reviewRequired 保持 true）→ 重新提报
    const rejected = await taskService.reviewSubmission('task-004', 'reject', done.version, '说明不充分')
    await taskService.completeTask('task-004', { version: rejected.version })

    const children = reviewChildren('task-004')
    expect(children).toHaveLength(2)
    const fresh = children.find((child) => child.id !== stale.id)!
    expect(fresh).toBeDefined()
    expect(fresh.status).toBe('todo')
    expect(children.filter((child) => child.status === 'todo')).toHaveLength(1)
  })

  it('S-2（E）：cancelled 评审子任务视为不阻塞 ⇒ canApproveMainTask 由 false 变 true', async () => {
    const before = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { version: before.version })
    const child = reviewChildren('task-004')[0]

    // 子任务未完成 ⇒ 门禁关闭（改前行为，保持不变）
    expect(canApproveMainTask(done, db.tasks)).toBe(false)

    // 取消该子任务（放弃评审项）⇒ 不再阻塞
    child.status = 'cancelled'
    expect(canApproveMainTask(findTask('task-004')!, db.tasks)).toBe(true)

    // 纯函数对照：cancelled + done 组合 ⇒ true；含 todo ⇒ false
    const main = { id: 'main-1' }
    expect(
      canApproveMainTask(main, [
        { parentId: 'main-1', isReviewTask: true, status: 'cancelled' },
        { parentId: 'main-1', isReviewTask: true, status: 'done' },
      ]),
    ).toBe(true)
    expect(
      canApproveMainTask(main, [
        { parentId: 'main-1', isReviewTask: true, status: 'cancelled' },
        { parentId: 'main-1', isReviewTask: true, status: 'todo' },
      ]),
    ).toBe(false)
  })
})
