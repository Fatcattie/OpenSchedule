/**
 * 职责：增量 2 —— 接通 `completeTask` → 待我审核 断链（ARCH §8.2）。
 *
 * 本文件为**独立新增套件**，不修改既有 25 套件的任何断言（K11）。
 * 覆盖：纯函数全分支（`resolveUndoReviewReset` / `createClearedReviewState` /
 * `shouldClearReviewOnLeaveDone` / `resolveReviewItemView`）+ service 全链路
 * （`completeTask` / `undoCompletion` / `reviewSubmission` / `reopenTask` / `moveTask`），
 * 对应 AC-01~AC-07、AC-10、AC-11、AC-13 与 INV-1~INV-4。
 */
import {
  DEMO_MANAGER_IDS,
  DEMO_USER_IDS,
  allManagerIds,
  db,
  findTask,
  resetDatabase,
} from '@/data'
import * as taskService from '@/services/task.service'
import {
  createClearedReviewState,
  resolveApproveBranch,
  resolveReviewItemView,
  resolveUndoReviewReset,
  shouldClearReviewOnLeaveDone,
} from '@/utils/submission'

const ME = DEMO_USER_IDS.me
const MANAGER2 = DEMO_USER_IDS.manager
const LINA = DEMO_USER_IDS.lina

/** 断言 `reviewerIds` 与 `allManagerIds()` 集合一致（顺序无关，AC-10） */
function expectSameManagerSet(actual: string[] | undefined): void {
  expect(actual).toBeDefined()
  expect([...(actual ?? [])].sort()).toEqual([...allManagerIds()].sort())
  expect((actual ?? []).length).toBeGreaterThan(0)
}

beforeEach(() => {
  resetDatabase()
})

describe('resolveUndoReviewReset —— 三态判定（AC-05 / D1）', () => {
  it('next === null → 返回清理包（6 字段全清），与 createClearedReviewState() 同型同值', () => {
    const reset = resolveUndoReviewReset(null)
    expect(reset).not.toBeNull()
    expect(reset).toEqual(createClearedReviewState())
    expect(reset).toEqual({
      submissionStatus: null,
      reviewRequired: false,
      reviewerIds: [],
      reviewNote: null,
      reviewedBy: null,
      reviewedAt: null,
    })
  })

  it.each([undefined, 'pending', 'approved', 'rejected', 'withdrawn', 'draft'] as const)(
    'next === %p → 返回 null（不清理审核态）',
    (next) => {
      expect(resolveUndoReviewReset(next)).toBeNull()
    },
  )
})

describe('createClearedReviewState —— 审核态清理字段包唯一构造点（v1.1）', () => {
  it('每次返回新对象（避免共享可变引用）且字段包为 6 字段全清', () => {
    const a = createClearedReviewState()
    const b = createClearedReviewState()
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
    expect(Object.keys(a).sort()).toEqual(
      ['reviewNote', 'reviewRequired', 'reviewedAt', 'reviewedBy', 'reviewerIds', 'submissionStatus'].sort(),
    )
  })

  it('返回的 reviewerIds 为独立数组（改动互不影响）', () => {
    const a = createClearedReviewState()
    const b = createClearedReviewState()
    a.reviewerIds.push('user-x')
    expect(b.reviewerIds).toEqual([])
  })
})

describe('shouldClearReviewOnLeaveDone —— 离开 done 判定（AC-13 / INV-4）', () => {
  it.each(['todo', 'in_progress'] as const)(
    '当前 done + pending + 目标 %s → true',
    (next) => {
      expect(shouldClearReviewOnLeaveDone({ status: 'done', submissionStatus: 'pending' }, next)).toBe(true)
    },
  )

  it('目标仍为 done → false（迁往 done 不得清理）', () => {
    expect(shouldClearReviewOnLeaveDone({ status: 'done', submissionStatus: 'pending' }, 'done')).toBe(false)
  })

  it('当前非 done（in_progress + pending，即 task-014 形态）→ false（不在守卫约束内）', () => {
    expect(shouldClearReviewOnLeaveDone({ status: 'in_progress', submissionStatus: 'pending' }, 'todo')).toBe(
      false,
    )
  })

  it.each([undefined, 'approved', 'rejected', null] as const)(
    'submissionStatus 为 %p（非 pending）→ false',
    (submissionStatus) => {
      expect(shouldClearReviewOnLeaveDone({ status: 'done', submissionStatus }, 'todo')).toBe(false)
    },
  )
})

describe('resolveReviewItemView —— 分叉视图（AC-09）', () => {
  it('种子 task-014（完成提报）→ completion + 「完成待审」+ submitterId === assigneeId', () => {
    const task = findTask('task-014')!
    const view = resolveReviewItemView(task)
    expect(resolveApproveBranch(task)).toBe('completion')
    expect(view.branch).toBe('completion')
    expect(view.label).toBe('完成待审')
    expect(view.submitterId).toBe(task.assigneeId)
    expect(view.actionText).toBe('提交了完成提报')
    expect(view.tagStatus).toBe('done')
  })

  it('submissionKind = task → 「提报待审 · 新任务」+ submitterId === createdBy', () => {
    const view = resolveReviewItemView({
      source: 'submission',
      submissionKind: 'task',
      assigneeId: LINA,
      createdBy: ME,
    })
    expect(view.branch).toBe('task')
    expect(view.label).toBe('提报待审 · 新任务')
    expect(view.submitterId).toBe(ME)
    expect(view.actionText).toBe('提报了新任务')
    expect(view.tagStatus).toBe('in_progress')
  })

  it('submissionKind = project → 「提报待审 · 新项目」+ submitterId === createdBy', () => {
    const view = resolveReviewItemView({
      source: 'submission',
      submissionKind: 'project',
      assigneeId: MANAGER2,
      createdBy: LINA,
    })
    expect(view.branch).toBe('project')
    expect(view.label).toBe('提报待审 · 新项目')
    expect(view.submitterId).toBe(LINA)
    expect(view.actionText).toBe('提报了新项目')
    expect(view.tagStatus).toBe('in_progress')
  })

  it('source 非 submission 但 submissionStatus 概念上为完成提报时仍走 completion（不改 source，K4）', () => {
    const view = resolveReviewItemView({
      source: undefined,
      submissionKind: null,
      assigneeId: LINA,
      createdBy: ME,
    })
    expect(view.branch).toBe('completion')
    expect(view.submitterId).toBe(LINA)
  })
})

describe('reopenTask / moveTask —— 离开 done 清理审核态（AC-13 / INV-4）', () => {
  /** 造出「已完成待审」任务（task-004 由 in_progress 完成） */
  async function makeCompletedPending(taskId = 'task-004') {
    const before = findTask(taskId)!
    const done = await taskService.completeTask(taskId, { version: before.version })
    expect(done.submissionStatus).toBe('pending')
    expect((await taskService.listPendingReview(ME)).some((t) => t.id === taskId)).toBe(true)
    return done
  }

  it('reopenTask：已完成待审任务重开为 todo ⇒ 审核态六字段全清且退出待审队列', async () => {
    const done = await makeCompletedPending()
    const reopened = await taskService.reopenTask('task-004', { reason: '需求变更', version: done.version })

    expect(reopened.status).toBe('todo')
    expect(reopened.submissionStatus).toBeNull()
    expect(reopened.reviewRequired).toBe(false)
    expect(reopened.reviewerIds).toEqual([])
    expect(reopened.reviewNote).toBeNull()
    expect(reopened.reviewedBy).toBeNull()
    expect(reopened.reviewedAt).toBeNull()
    expect(reopened.completedAt).toBeNull()
    expect(reopened.version).toBe(done.version + 1)
    expect(db.auditFeed[0].action).toBe('task.reopen')
    expect((await taskService.listPendingReview(ME)).some((t) => t.id === 'task-004')).toBe(false)
    expect((await taskService.listPendingReview(MANAGER2)).some((t) => t.id === 'task-004')).toBe(false)
  })

  it('moveTask：已完成待审任务迁往 in_progress ⇒ 审核态六字段全清且退出待审队列', async () => {
    const done = await makeCompletedPending()
    const moved = await taskService.moveTask('task-004', { status: 'in_progress', version: done.version })

    expect(moved.status).toBe('in_progress')
    expect(moved.submissionStatus).toBeNull()
    expect(moved.reviewRequired).toBe(false)
    expect(moved.reviewerIds).toEqual([])
    expect(moved.reviewNote).toBeNull()
    expect(moved.reviewedBy).toBeNull()
    expect(moved.reviewedAt).toBeNull()
    expect(moved.completedAt).toBeNull()
    expect(moved.version).toBe(done.version + 1)
    expect(db.auditFeed[0].action).toBe('task.move')
    expect((await taskService.listPendingReview(ME)).some((t) => t.id === 'task-004')).toBe(false)
  })

  it('否决：in_progress（+ pending）迁往 done 时不清理（守卫①假，task-014 形态）', async () => {
    const before = findTask('task-014')!
    expect(before.status).toBe('in_progress')
    expect(before.submissionStatus).toBe('pending')

    const moved = await taskService.moveTask('task-014', { status: 'done', version: before.version })

    expect(moved.status).toBe('done')
    expect(moved.submissionStatus).toBe('pending')
    expect(moved.reviewRequired).toBe(true)
    expect((await taskService.listPendingReview(ME)).some((t) => t.id === 'task-014')).toBe(true)
  })

  it('否决：非 pending 的 done 任务重开时不清理（守卫③假，task-007）', async () => {
    const before = findTask('task-007')!
    expect(before.status).toBe('done')
    expect(before.submissionStatus).toBeUndefined()

    const reopened = await taskService.reopenTask('task-007', { reason: '误操作', version: before.version })

    expect(reopened.status).toBe('todo')
    expect(reopened.submissionStatus).toBeUndefined()
    expect(reopened.completedAt).toBeNull()
  })

  it('INV-4：由 done 迁出后不存在 pending 残留（reopen 与 move 两条路径）', async () => {
    const doneA = await makeCompletedPending('task-004')
    const reopened = await taskService.reopenTask('task-004', { reason: '需求变更', version: doneA.version })
    expect(reopened.status).toBe('todo')
    expect(reopened.submissionStatus).not.toBe('pending')

    const doneB = await makeCompletedPending('task-005')
    const moved = await taskService.moveTask('task-005', { status: 'in_progress', version: doneB.version })
    expect(moved.status).toBe('in_progress')
    expect(moved.submissionStatus).not.toBe('pending')
  })
})

describe('completeTask —— 待我审核 断链接通（AC-01 / AC-02 / AC-10 / AC-11 / INV-1 / INV-2）', () => {
  it('完成任务写入提报态六字段且 source 未被改写', async () => {
    const before = findTask('task-004')!
    // findTask 返回内存库活引用，须先快照迁移前取值
    const versionBefore = before.version
    const sourceBefore = before.source
    const done = await taskService.completeTask('task-004', { version: versionBefore })

    expect(done.status).toBe('pending_review')
    expect(done.completedAt).not.toBeNull()
    expect(done.submissionStatus).toBe('pending')
    expect(done.reviewRequired).toBe(true)
    expectSameManagerSet(done.reviewerIds)
    expect(done.reviewNote).toBeNull()
    expect(done.reviewedBy).toBeNull()
    expect(done.reviewedAt).toBeNull()
    expect(done.source).toBe(sourceBefore) // 不改写 source（K4）
    expect(done.version).toBe(versionBefore + 1)
    expect(db.auditFeed[0].action).toBe('task.complete')
    // INV-1（增量 7 放宽）/ INV-2
    expect(done.completedAt !== null).toBe(done.status === 'done' || done.status === 'pending_review')
    expect(done.reviewRequired).toBe(true)
    expect((done.reviewerIds ?? []).length).toBeGreaterThan(0)
  })

  it('完成后任务进入全部 manager 的「待我审核」队列（AC-02）', async () => {
    const before = findTask('task-004')!
    await taskService.completeTask('task-004', { version: before.version })

    for (const managerId of allManagerIds()) {
      expect((await taskService.listPendingReview(managerId)).some((t) => t.id === 'task-004')).toBe(true)
    }
  })

  it('reviewerIds 集合等于 allManagerIds()（顺序无关，AC-10）', async () => {
    expect([...allManagerIds()].sort()).toEqual([...DEMO_MANAGER_IDS].sort())
    const before = findTask('task-006')!
    const done = await taskService.completeTask('task-006', { version: before.version })
    expectSameManagerSet(done.reviewerIds)
  })

  it('manager（张伟本人）完成任务同样入队，不自审豁免（AC-11 / R8）', async () => {
    const before = findTask('task-006')!
    expect(before.assigneeId).toBe(ME)
    const done = await taskService.completeTask('task-006', { version: before.version })

    expect(done.submissionStatus).toBe('pending')
    expect(done.reviewRequired).toBe(true)
    expect((done.reviewerIds ?? []).includes(ME)).toBe(true)
    expect((await taskService.listPendingReview(ME)).some((t) => t.id === 'task-006')).toBe(true)
  })

  it('上一轮驳回原因被复位为 null（避免展示陈旧原因）', async () => {
    const t15 = findTask('task-015')!
    const rejected = await taskService.reviewSubmission('task-015', 'reject', t15.version, '说明不充分')
    expect(rejected.reviewNote).toBe('说明不充分')

    const done = await taskService.completeTask('task-015', { version: rejected.version })
    expect(done.submissionStatus).toBe('pending')
    expect(done.reviewNote).toBeNull()
  })
})

describe('undoCompletion —— 审核态清理（AC-05 / AC-06 / INV-1 / INV-3）', () => {
  it('撤销完成后六字段同时复位且任务完全退出待审队列', async () => {
    const before = findTask('task-004')!
    const prevStatus = before.status // 快照：findTask 为活引用
    const done = await taskService.completeTask('task-004', { version: before.version })

    const undone = await taskService.undoCompletion('task-004', {
      status: prevStatus,
      submissionStatus: null,
      version: done.version,
    })

    expect(undone.status).toBe(prevStatus)
    expect(undone.submissionStatus).toBeNull()
    expect(undone.reviewRequired).toBe(false)
    expect(undone.reviewerIds).toEqual([])
    expect(undone.reviewNote).toBeNull()
    expect(undone.reviewedBy).toBeNull()
    expect(undone.reviewedAt).toBeNull()
    expect(undone.completedAt).toBeNull()
    expect(undone.version).toBe(done.version + 1)
    expect(db.auditFeed[0].action).toBe('task.undo')
    // INV-1 / INV-3
    expect(undone.completedAt !== null).toBe(undone.status === 'done')
    expect((await taskService.listPendingReview(ME)).some((t) => t.id === 'task-004')).toBe(false)
  })

  it('撤销后再完成（增量 7 M1：撤销清 reviewRequired ⇒ 第二次完成直落 done，不再入队）', async () => {
    const before = findTask('task-004')!
    const prevStatus = before.status // 快照：findTask 为活引用
    const done = await taskService.completeTask('task-004', { version: before.version })
    const undone = await taskService.undoCompletion('task-004', {
      status: prevStatus,
      submissionStatus: null,
      version: done.version,
    })

    const again = await taskService.completeTask('task-004', { version: undone.version })
    expect(again.status).toBe('done')
    expect(again.submissionStatus).toBeNull()
    expect(again.reviewRequired).toBe(false)
    expect((await taskService.listPendingReview(ME)).some((t) => t.id === 'task-004')).toBe(false)
  })

  it('撤销「审核通过」传 pending 时不得复位 reviewRequired / reviewerIds（K3 / Q3-9）', async () => {
    const before = findTask('task-014')!
    expect(before.reviewRequired).toBe(true)
    expect(before.reviewerIds).toEqual([ME])

    const approved = await taskService.reviewSubmission('task-014', 'approve', before.version)
    expect(approved.status).toBe('done')

    const undone = await taskService.undoCompletion('task-014', {
      status: 'in_progress',
      submissionStatus: 'pending',
      version: approved.version,
    })

    expect(undone.submissionStatus).toBe('pending')
    expect(undone.reviewRequired).toBe(true) // 未被复位
    expect(undone.reviewerIds).toEqual([ME]) // 未被复位
    expect(undone.completedAt).toBeNull()
    // 任务仍在待审队列（否则审核人再也看不到）
    expect((await taskService.listPendingReview(ME)).some((t) => t.id === 'task-014')).toBe(true)
  })

  it('不传 submissionStatus 时保持原值不动（三态之 undefined）', async () => {
    const before = findTask('task-007')!
    expect(before.submissionStatus).toBeUndefined()
    const undone = await taskService.undoCompletion('task-007', {
      status: 'in_progress',
      version: before.version,
    })
    expect(undone.submissionStatus).toBeUndefined()
    expect(undone.reviewRequired).toBeUndefined()
  })
})

describe('reviewSubmission —— 完成提报通过 / 驳回（AC-03 / AC-04 / INV-1）', () => {
  it('通过：approved + done + completedAt 非空 + reviewNote 清空 + 1 条 review.result 通知', async () => {
    const before = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { version: before.version })
    const notificationCount = db.notifications.filter((n) => n.type === 'review.result').length

    const approved = await taskService.reviewSubmission('task-004', 'approve', done.version)

    expect(approved.submissionStatus).toBe('approved')
    expect(approved.status).toBe('done')
    expect(approved.completedAt).not.toBeNull()
    expect(approved.reviewNote).toBeNull()
    expect(db.notifications.filter((n) => n.type === 'review.result').length).toBe(notificationCount + 1)
    // INV-1 / INV-3
    expect(approved.completedAt !== null).toBe(approved.status === 'done')
    expect((await taskService.listPendingReview(ME)).some((t) => t.id === 'task-004')).toBe(false)
  })

  it('驳回：rejected + in_progress + completedAt 清空 + reviewNote 为原因 + 通知正文含原因', async () => {
    const before = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { version: before.version })
    expect(done.completedAt).not.toBeNull()

    const rejected = await taskService.reviewSubmission('task-004', 'reject', done.version, '说明不充分')

    expect(rejected.submissionStatus).toBe('rejected')
    expect(rejected.status).toBe('in_progress')
    expect(rejected.completedAt).toBeNull() // S3 本次新增
    expect(rejected.reviewNote).toBe('说明不充分')
    expect(rejected.version).toBe(done.version + 1)
    // INV-1 / INV-3
    expect(rejected.completedAt !== null).toBe(rejected.status === 'done')
    expect((await taskService.listPendingReview(ME)).some((t) => t.id === 'task-004')).toBe(false)

    const latest = db.notifications.find((n) => n.type === 'review.result')
    expect(latest?.body ?? '').toContain('说明不充分')
  })

  it('新事项提报驳回（非 completion）不受 S3 影响：status=cancelled', async () => {
    const before = findTask('task-019')!
    const rejected = await taskService.reviewSubmission('task-019', 'reject', before.version, '暂不立项')
    expect(resolveApproveBranch(before)).toBe('project')
    expect(rejected.submissionStatus).toBe('rejected')
    expect(rejected.status).toBe('cancelled')
    expect(rejected.reviewNote).toBe('暂不立项')
  })

  it('退回重改（opinion=rework）：文案分叉「退回重改」+ pushAudit 含「退回了」，状态机不变', async () => {
    const before = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { version: before.version })

    const rejected = await taskService.reviewSubmission(
      'task-004', 'reject', done.version, '请补充验收标准', ME, 'rework',
    )

    // 文案分叉：站内通知 title / body
    const latest = db.notifications.find((n) => n.type === 'review.result')
    expect(latest?.title).toBe('提报已退回重改')
    expect(latest?.body ?? '').toContain('被退回重改：')
    expect(latest?.body ?? '').toContain('请补充验收标准')
    // 团队动态摘要分叉
    expect(db.auditFeed[0].summary).toContain('退回了')
    // 审核留痕：reject 路径必须落 opinion='rework'（审核中心琥珀色标签的唯一数据源）
    expect(rejected.auditLogs?.at(-1)?.opinion).toBe('rework')
    // 状态机不变（红线：只改文案，四行赋值一个字不动）
    expect(rejected.submissionStatus).toBe('rejected')
    expect(rejected.status).toBe('in_progress')
    expect(rejected.completedAt).toBeNull()
    expect(rejected.reviewNote).toBe('请补充验收标准')
  })

  it('对照组 · 不通过（opinion=reject）：文案仍为「被驳回」，pushAudit 含「驳回了」，状态机与退回重改逐字段一致', async () => {
    const before = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { version: before.version })

    const rejected = await taskService.reviewSubmission(
      'task-004', 'reject', done.version, '请补充验收标准', ME, 'reject',
    )

    const latest = db.notifications.find((n) => n.type === 'review.result')
    expect(latest?.title).toBe('提报已驳回')
    expect(latest?.body ?? '').toContain('被驳回：')
    expect(latest?.body ?? '').toContain('请补充验收标准')
    expect(db.auditFeed[0].summary).toContain('驳回了')
    // 审核留痕：显式 opinion='reject' 必须原样落库（防止缺省值被改坏）
    expect(rejected.auditLogs?.at(-1)?.opinion).toBe('reject')
    // 状态机与「退回重改」完全一致（证明状态机未受影响）
    expect(rejected.submissionStatus).toBe('rejected')
    expect(rejected.status).toBe('in_progress')
    expect(rejected.completedAt).toBeNull()
    expect(rejected.reviewNote).toBe('请补充验收标准')
  })

  it('对照组 · 缺省 opinion：文案回落「被驳回」，状态机同型', async () => {
    const before = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { version: before.version })

    const rejected = await taskService.reviewSubmission('task-004', 'reject', done.version, '说明不充分')

    const latest = db.notifications.find((n) => n.type === 'review.result')
    expect(latest?.title).toBe('提报已驳回')
    expect(latest?.body ?? '').toContain('被驳回：')
    expect(db.auditFeed[0].summary).toContain('驳回了')
    expect(rejected.submissionStatus).toBe('rejected')
    expect(rejected.status).toBe('in_progress')
    expect(rejected.completedAt).toBeNull()
    expect(rejected.reviewNote).toBe('说明不充分')
  })
})

describe('回归红线（本文件内复述，不改既有套件 · AC-07）', () => {
  it('task-014 approve → done；task-015 reject → in_progress + reviewNote', async () => {
    const t14 = findTask('task-014')!
    const approved = await taskService.reviewSubmission('task-014', 'approve', t14.version)
    expect(approved.status).toBe('done')

    const t15 = findTask('task-015')!
    const rejected = await taskService.reviewSubmission('task-015', 'reject', t15.version, '说明不充分')
    expect(rejected.status).toBe('in_progress')
    expect(rejected.reviewNote).toBe('说明不充分')
  })
})
