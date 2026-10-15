/**
 * 职责：增量 2 —— **QA 独立验证套件**（与工程师的 `increment2-completion.test.ts` 相互独立）。
 *
 * 本文件只做两件事：
 *  1. **独立复核**工程师用例未覆盖或覆盖不足的判定（尤其是 AC-13 的守卫求值时机、AC-13 反向否决、
 *     K3 方向性、INV-1/2/3、边界异常码）；
 *  2. 用**不同的种子任务**复述关键结论，避免「同一用例自证」。
 *
 * 约束：不修改既有 25 套件的任何断言（K11）；不触碰 `src/` 源码。
 */
import { DEMO_USER_IDS, allManagerIds, findTask, resetDatabase } from '@/data'
import * as taskService from '@/services/task.service'
import { ERR_ILLEGAL_TRANSITION, ERR_OPTIMISTIC_LOCK, type Task } from '@/types'
import { ERR_SUBMISSION_INVALID, shouldClearReviewOnLeaveDone } from '@/utils/submission'

const ME = DEMO_USER_IDS.me
const MANAGER2 = DEMO_USER_IDS.manager

beforeEach(() => {
  resetDatabase()
})

/** INV-1（增量 7 放宽）：`completedAt != null ⟺ status ∈ {done, pending_review}` */
function expectInv1(task: Task): void {
  expect(task.completedAt !== null).toBe(task.status === 'done' || task.status === 'pending_review')
}

/** 完成任务（`in_progress → done`）并返回「已完成待审」快照 */
async function completeAndSnapshot(taskId: string): Promise<Task> {
  const before = findTask(taskId)!
  const done = await taskService.completeTask(taskId, { version: before.version })
  expect(done.submissionStatus).toBe('pending')
  expect(done.reviewRequired).toBe(true)
  expect((done.reviewerIds ?? []).length).toBeGreaterThan(0)
  expect((await taskService.listPendingReview(ME)).some((t) => t.id === taskId)).toBe(true)
  return done
}

describe('AC-13 —— 守卫求值时机（独立设计的时机证明）', () => {
  it('守卫是「顺序敏感」的：status 已被改写后再求值会恒假 —— 故「清理发生」本身即时机证据', () => {
    // 迁移前（status='done'）→ true；若在 `task.status = next` 之后求值（status 已是 todo）→ false
    expect(shouldClearReviewOnLeaveDone({ status: 'done', submissionStatus: 'pending' }, 'todo')).toBe(true)
    expect(shouldClearReviewOnLeaveDone({ status: 'todo', submissionStatus: 'pending' }, 'todo')).toBe(false)
  })

  it('moveTask 由 done 迁往 todo ⇒ 六字段全清且退出待审队列（engineer 只测了 in_progress 目标）', async () => {
    const done = await completeAndSnapshot('task-004')

    const moved = await taskService.moveTask('task-004', { status: 'todo', version: done.version })

    expect(moved.status).toBe('todo')
    expect(moved.submissionStatus).toBeNull()
    expect(moved.reviewRequired).toBe(false)
    expect(moved.reviewerIds).toEqual([])
    expect(moved.reviewNote).toBeNull()
    expect(moved.reviewedBy).toBeNull()
    expect(moved.reviewedAt).toBeNull()
    expect(moved.completedAt).toBeNull()
    expectInv1(moved)
    // 两名 manager 的待审队列均不含该任务
    for (const managerId of allManagerIds()) {
      expect((await taskService.listPendingReview(managerId)).some((t) => t.id === 'task-004')).toBe(false)
    }
  })

  it('reopenTask 由 done 迁出 ⇒ 六字段全清且退出待审队列（用 task-006 独立复述）', async () => {
    const done = await completeAndSnapshot('task-006')

    const reopened = await taskService.reopenTask('task-006', { reason: '需求变更', version: done.version })

    expect(reopened.status).toBe('todo')
    expect(reopened.submissionStatus).toBeNull()
    expect(reopened.reviewRequired).toBe(false)
    expect(reopened.reviewerIds).toEqual([])
    expect(reopened.reviewNote).toBeNull()
    expect(reopened.completedAt).toBeNull()
    expectInv1(reopened)
    expect((await taskService.listPendingReview(MANAGER2)).some((t) => t.id === 'task-006')).toBe(false)
  })
})

describe('AC-13 反向 —— 非「由 done 迁出」不得触发清理', () => {
  it('todo → in_progress（守卫①假）不清理、也不写入审核态', async () => {
    const before = findTask('task-001')!
    expect(before.status).toBe('todo')
    expect(before.submissionStatus).toBeUndefined()

    const moved = await taskService.moveTask('task-001', { status: 'in_progress', version: before.version })

    expect(moved.status).toBe('in_progress')
    expect(moved.submissionStatus).toBeUndefined() // 未被写入 pending
    expect(moved.reviewRequired).toBeUndefined()
    expect((await taskService.listPendingReview(ME)).some((t) => t.id === 'task-001')).toBe(false)
  })

  it('in_progress → done（守卫②假：目标为 done）不得清理、也不得自动入队', async () => {
    const before = findTask('task-006')!
    const moved = await taskService.moveTask('task-006', { status: 'done', version: before.version })

    expect(moved.status).toBe('done')
    expect(moved.completedAt).not.toBeNull()
    // moveTask 迁往 done 不承担「完成提报」职责（入队只由 completeTask 触发）
    expect(moved.submissionStatus).toBeUndefined()
    expect((await taskService.listPendingReview(ME)).some((t) => t.id === 'task-006')).toBe(false)
  })

  it('种子 task-014（in_progress + pending，非由 done 迁出）迁往 todo ⇒ 保持 pending（ARCH §9.2-P6 已知缺口，期望行为）', async () => {
    const before = findTask('task-014')!
    expect(before.status).toBe('in_progress')
    expect(before.submissionStatus).toBe('pending')

    const moved = await taskService.moveTask('task-014', { status: 'todo', version: before.version })

    expect(moved.status).toBe('todo')
    expect(moved.submissionStatus).toBe('pending') // 守卫①假 ⇒ 不清理（本次范围外，已登记）
    expect((await taskService.listPendingReview(ME)).some((t) => t.id === 'task-014')).toBe(true)
  })
})

describe('AC-05 / AC-06 —— 撤销完成（用 task-005 独立复述）', () => {
  it('AC-05：六字段同时复位、status 回原值、退出待审队列、INV-1/INV-3 成立', async () => {
    const before = findTask('task-005')!
    const prevStatus = before.status
    const done = await completeAndSnapshot('task-005')

    const undone = await taskService.undoCompletion('task-005', {
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
    expectInv1(undone)
    expect((await taskService.listPendingReview(ME)).some((t) => t.id === 'task-005')).toBe(false)
  })

  it('AC-06：撤销后再完成（增量 7 M1：撤销经 createClearedReviewState 清 reviewRequired ⇒ 直接落 done，不再入队）', async () => {
    const before = findTask('task-005')!
    const prevStatus = before.status
    const done = await completeAndSnapshot('task-005')
    const undone = await taskService.undoCompletion('task-005', {
      status: prevStatus,
      submissionStatus: null,
      version: done.version,
    })

    const again = await taskService.completeTask('task-005', { version: undone.version })

    // M1：`reviewRequired` 已由撤销清理为 false ⇒ 第二次完成 `needsReview === false` ⇒ 直落 done
    expect(again.status).toBe('done')
    expect(again.submissionStatus).toBeNull()
    expect(again.reviewRequired).toBe(false)
    expect((await taskService.listPendingReview(ME)).some((t) => t.id === 'task-005')).toBe(false)
  })

  it('三态之 undefined：撤销时不传 submissionStatus ⇒ 提报态保持 pending（K2 调用方契约，屏幕侧必须显式传 null）', async () => {
    const done = await completeAndSnapshot('task-004')

    const undone = await taskService.undoCompletion('task-004', {
      status: 'in_progress',
      version: done.version,
    })

    expect(undone.submissionStatus).toBe('pending') // 未被自动清理
    expect(undone.reviewRequired).toBe(true)
    expect((await taskService.listPendingReview(ME)).some((t) => t.id === 'task-004')).toBe(true)
  })
})

describe('K3 方向性 —— 撤销「审核通过」禁止复位审核态（否则任务从待审队列消失）', () => {
  it('撤销审核通过（传 pending）后 reviewRequired / reviewerIds 保持，审核人仍能在 listPendingReview 看到该任务', async () => {
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
    expectInv1(undone)
    // 关键：任务重新回到待审队列（反向缺陷会在此失败）
    expect((await taskService.listPendingReview(ME)).some((t) => t.id === 'task-014')).toBe(true)
  })
})

describe('INV 不变式逐条断言', () => {
  it('INV-1：四条写入路径后 `completedAt != null ⟺ status === done` 均成立', async () => {
    // 路径 A：completeTask
    const done = await completeAndSnapshot('task-004')
    expectInv1(done)
    // 路径 B：reviewSubmission reject
    const rejected = await taskService.reviewSubmission('task-004', 'reject', done.version, '说明不充分')
    expectInv1(rejected)
    // 路径 C：undoCompletion
    const done2 = await completeAndSnapshot('task-004')
    const undone = await taskService.undoCompletion('task-004', {
      status: 'in_progress',
      submissionStatus: null,
      version: done2.version,
    })
    expectInv1(undone)
    // 路径 D：reopenTask（task-007 为种子 done）
    const t7 = findTask('task-007')!
    const reopened = await taskService.reopenTask('task-007', { reason: '误操作', version: t7.version })
    expectInv1(reopened)
  })

  it('INV-2：`submissionStatus === pending ⇒ reviewRequired === true 且 reviewerIds 非空`', async () => {
    const done = await completeAndSnapshot('task-004')
    expect(done.submissionStatus).toBe('pending')
    expect(done.reviewRequired).toBe(true)
    expect((done.reviewerIds ?? []).length).toBeGreaterThan(0)

    // 撤销审核通过后重新回到 pending，同样成立
    const t14 = findTask('task-014')!
    const approved = await taskService.reviewSubmission('task-014', 'approve', t14.version)
    const back = await taskService.undoCompletion('task-014', {
      status: 'in_progress',
      submissionStatus: 'pending',
      version: approved.version,
    })
    expect(back.submissionStatus).toBe('pending')
    expect(back.reviewRequired).toBe(true)
    expect((back.reviewerIds ?? []).length).toBeGreaterThan(0)
  })

  it('INV-3：submissionStatus ∈ {null, approved, rejected} ⇒ 不在待审队列', async () => {
    // null：撤销完成（task-004）
    const done = await completeAndSnapshot('task-004')
    const undone = await taskService.undoCompletion('task-004', {
      status: 'in_progress',
      submissionStatus: null,
      version: done.version,
    })
    expect(undone.submissionStatus).toBeNull()
    expect((await taskService.listPendingReview(ME)).some((t) => t.id === 'task-004')).toBe(false)

    // approved：审核通过（task-005）
    const done2 = await completeAndSnapshot('task-005')
    const approved = await taskService.reviewSubmission('task-005', 'approve', done2.version)
    expect(approved.submissionStatus).toBe('approved')
    expect((await taskService.listPendingReview(ME)).some((t) => t.id === 'task-005')).toBe(false)

    // rejected：审核驳回（task-006）
    const done3 = await completeAndSnapshot('task-006')
    const rejected = await taskService.reviewSubmission('task-006', 'reject', done3.version, '说明不充分')
    expect(rejected.submissionStatus).toBe('rejected')
    expect((await taskService.listPendingReview(ME)).some((t) => t.id === 'task-006')).toBe(false)
  })
})

describe('AC-04 —— 分支隔离：仅 completion 分支清 completedAt', () => {
  it('completion 分支：reject ⇒ in_progress + completedAt === null', async () => {
    const done = await completeAndSnapshot('task-004')
    expect(done.completedAt).not.toBeNull()

    const rejected = await taskService.reviewSubmission('task-004', 'reject', done.version, '说明不充分')

    expect(rejected.status).toBe('in_progress')
    expect(rejected.completedAt).toBeNull()
    expectInv1(rejected)
  })

  it("'task' 分支：reject ⇒ status='cancelled'（归档），不落 in_progress（行为不变）", async () => {
    const t20 = findTask('task-020')!
    expect(t20.submissionKind).toBe('task')

    const rejected = await taskService.reviewSubmission('task-020', 'reject', t20.version, '暂不排期')

    expect(rejected.status).toBe('cancelled')
    expect(rejected.submissionStatus).toBe('rejected')
    // 说明：非 completion 分支的 completedAt 在种子中本就为 null，无法以数值区分「未清」与「清为 null」；
    // 分支差异由 status（cancelled vs in_progress）+ 源码 task.service.ts:975 的 resolveApproveBranch 守卫共同证明
    expect(rejected.completedAt).toBeNull()
  })

  it("'project' 分支：reject ⇒ status='cancelled'（归档），行为不变", async () => {
    const t19 = findTask('task-019')!
    expect(t19.submissionKind).toBe('project')

    const rejected = await taskService.reviewSubmission('task-019', 'reject', t19.version, '暂不立项')

    expect(rejected.status).toBe('cancelled')
    expect(rejected.submissionStatus).toBe('rejected')
    expect(rejected.reviewNote).toBe('暂不立项')
  })
})

describe('边界与异常码 —— 本次改动未破坏', () => {
  it('陈旧 version ⇒ 40901，且不触发任何审核态清理（moveTask / reopenTask）', async () => {
    const done = await completeAndSnapshot('task-004')

    await expect(
      taskService.moveTask('task-004', { status: 'todo', version: done.version + 5 }),
    ).rejects.toMatchObject({ code: ERR_OPTIMISTIC_LOCK })
    await expect(
      taskService.reopenTask('task-004', { reason: '需求变更', version: done.version + 5 }),
    ).rejects.toMatchObject({ code: ERR_OPTIMISTIC_LOCK })

    // 两次失败均不得产生副作用：任务仍是 done + pending
    const after = findTask('task-004')!
    expect(after.status).toBe('pending_review')
    expect(after.submissionStatus).toBe('pending')
    expect(after.version).toBe(done.version)
  })

  it('非法目标状态 ⇒ 40902（moveTask done→cancelled）', async () => {
    const t7 = findTask('task-007')!
    expect(t7.status).toBe('done')
    await expect(
      taskService.moveTask('task-007', { status: 'cancelled', version: t7.version }),
    ).rejects.toMatchObject({ code: ERR_ILLEGAL_TRANSITION })
  })

  it('驳回原因 < 4 字 ⇒ 42202，且任务未被部分修改（completion 分支）', async () => {
    const done = await completeAndSnapshot('task-004')

    for (const reason of ['说明不', '   ', 'ab']) {
      await expect(
        taskService.reviewSubmission('task-004', 'reject', done.version, reason),
      ).rejects.toMatchObject({ code: ERR_SUBMISSION_INVALID })
    }

    // 三次失败后任务状态完全未变（校验先于任何写入）
    const after = findTask('task-004')!
    expect(after.status).toBe('pending_review')
    expect(after.submissionStatus).toBe('pending')
    expect(after.completedAt).not.toBeNull()
    expect(after.reviewNote).toBeNull()
    expect(after.version).toBe(done.version)
    expect((await taskService.listPendingReview(ME)).some((t) => t.id === 'task-004')).toBe(true)
  })
})
