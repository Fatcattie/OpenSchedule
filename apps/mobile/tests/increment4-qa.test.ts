/**
 * 职责：增量 4 QA 独立验证（严过关）——「提报 / 审核状态机收口」交叉验证与盲点补强。
 *
 * 定位：**只做独立复算与对抗性验证**，不改动任何既有套件的断言（含工程师新增的
 * `tests/increment4-withdraw.test.ts`）。所有用例写在本独立新文件内（M4-P1-01 落点规则）。
 *
 * 相对工程师测试（`increment4-withdraw.test.ts`）的独立补强点：
 * 1. **种子事实前置核对**（不照抄转述）：实读 `task-014/015/004/007/009/019/020` 的
 *    `assigneeId` / `createdBy` / `submissionStatus` / `source` 后再构造用例；
 * 2. **主体错位双向对照**：提报人（李娜）与「从未提报的 createdBy」（张伟）分别实测，
 *    并核对**校验顺序**（version → pending → 主体，用错误文案区分）；
 * 3. **INV-1 全量遍历**：遍历 `db.tasks` 断言 `completedAt != null ⟺ status === 'done'`，
 *    且在「撤回 done→in_progress」后**再次全量遍历**；
 * 4. **审核态六字段清理的强证明**：手工把五个字段置为**非空**后再撤回，证明是「清理」
 *    而非「本来就是 null」；
 * 5. **幂等 / 重复撤回**：第二次 40302 且 auditFeed 不再增长；
 * 6. **零通知**：`JSON.stringify(db.notifications)` 逐字节相等 + 长度不变；
 * 7. **非 `done` 分支不改 `status`**（task-014：撤回后仍 `in_progress`，不落 `todo`，不抛 40902）；
 * 8. **`blocked` 来源**：`blocked → done` 后撤回落 `in_progress`（阻塞标记丢失，ARCH §10-5 已登记）；
 * 9. **`isWithdrawable` 的 `task` / `project` 分支主体仍为 `createdBy`**（project 分支
 *    `assigneeId` 是「拟负责人」，**不得**被当成提报人）；
 * 10. **唯一构造点复核**：源码级断言 `withdrawCompletion` 复用 `applyClearedReviewState`
 *     且无第二份手写字段清单；全仓 `createClearedReviewState()` 仅一处定义；
 * 11. **AC-14 源码锚点**：`shouldClearReviewOnLeaveDone` 判据行 / `listTodayDue` /
 *     `listDeadlineApproaching` 过滤条件逐条未变；
 * 12. **「重开为进行中」分支**（M5-P1-04）：源码文本断言 + **服务层**直接验证
 *     `moveTask(done → in_progress)` 与 `reopenTask(done → todo)` 两条路径，
 *     并如实登记 `startedAt ??= now()` / audit `actorId` 的可观测差异。
 */
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DEMO_USER_IDS, db, demoDayAt, findTask, resetDatabase } from '@/data'
import { ERR_ILLEGAL_TRANSITION, ERR_OPTIMISTIC_LOCK, TASK_TRANSITION_ACTIONS } from '@/types'
import * as taskService from '@/services/task.service'
import * as focusService from '@/services/focus.service'
import {
  ERR_SUBMISSION_FORBIDDEN,
  SUBMISSION_TRANSITIONS,
  canTransition,
  isWithdrawable,
  shouldClearReviewOnLeaveDone,
} from '@/utils/submission'
import { countVisibleFocusTasks } from '@/utils/focus'

/** user-001（张伟）：演示账号 / 多种子任务的 `createdBy`（但**不是**完成提报的提报人） */
const ME = DEMO_USER_IDS.me
/** user-002（李娜）：`task-004` / `task-014` 的 `assigneeId`（= 完成提报的提报人） */
const LINA = DEMO_USER_IDS.lina
/** user-003（王强）：`task-009` / `task-015` 的 `assigneeId` */
const WANGQIANG = DEMO_USER_IDS.wangqiang
/** user-004（陈明）：`task-019` 的 `assigneeId`（project 分支的「拟负责人」） */
const MANAGER = DEMO_USER_IDS.manager
const SH = 'Asia/Shanghai'

function ids(tasks: { id: string }[]): string[] {
  return tasks.map((task) => task.id).sort()
}

/** INV-1 判定（全量遍历用，增量 7 放宽）：`completedAt != null ⟺ status ∈ {done, pending_review}` */
function inv1Violations(): string[] {
  return db.tasks
    .filter((task) => (task.completedAt != null) !== (task.status === 'done' || task.status === 'pending_review'))
    .map((task) => task.id)
}

beforeEach(() => {
  resetDatabase()
})

// ── 0. 种子事实前置核对（不照抄转述，先证明前提）────────────────────────────

describe('QA · 种子事实核对（用例前提的独立取证）', () => {
  it('task-014：in_progress + pending，assigneeId=李娜 / createdBy=张伟，reviewerIds=[张伟]', () => {
    const task = findTask('task-014')!
    expect(task.status).toBe('in_progress')
    expect(task.submissionStatus).toBe('pending')
    expect(task.assigneeId).toBe(LINA) // user-002
    expect(task.createdBy).toBe(ME) // user-001
    expect(task.reviewerIds).toEqual([ME])
    expect(task.source).toBe('submission')
    // 完成提报（无 submissionKind）⇒ isSubmissionRecord === false ⇒ 不在「我的提报」列表
    expect(task.submissionKind ?? null).toBeNull()
    expect(task.completedAt).toBeNull()
  })

  it('task-015：in_progress + pending，assigneeId=王强 / createdBy=张伟', () => {
    const task = findTask('task-015')!
    expect(task.status).toBe('in_progress')
    expect(task.submissionStatus).toBe('pending')
    expect(task.assigneeId).toBe(WANGQIANG) // user-003
    expect(task.createdBy).toBe(ME) // user-001
  })

  it('task-004：in_progress + assigneeId=李娜 + dueAt 为今日（今日到期候选）', () => {
    const task = findTask('task-004')!
    expect(task.status).toBe('in_progress')
    expect(task.assigneeId).toBe(LINA)
    expect(task.dueAt).not.toBeNull()
  })

  it('task-007：done + submissionStatus=undefined（非 pending）', () => {
    const task = findTask('task-007')!
    expect(task.status).toBe('done')
    expect(task.submissionStatus).toBeUndefined()
  })

  it('task-009：blocked + assigneeId=王强（blocked → done 合法的来源）', () => {
    const task = findTask('task-009')!
    expect(task.status).toBe('blocked')
    expect(task.assigneeId).toBe(WANGQIANG)
  })

  it('task-019（project 分支）：assigneeId 承载「拟负责人」= 陈明，createdBy = 李娜', () => {
    const task = findTask('task-019')!
    expect(task.source).toBe('submission')
    expect(task.submissionKind).toBe('project')
    expect(task.createdBy).toBe(LINA) // user-002
    expect(task.assigneeId).toBe(MANAGER) // user-004（拟负责人）
  })
})

// ── 1. 主体错位双向对照（本次修复核心）──────────────────────────────────────

describe('QA · 主体错位双向对照（AC-01 / AC-02 强对照）', () => {
  it('提报人（李娜 = assigneeId）能撤回；从未提报的 createdBy（张伟）不能（40302）', async () => {
    // 对照 A：真正的提报人 —— 成功
    const beforeA = findTask('task-014')!
    const ok = await taskService.withdrawCompletion('task-014', {
      version: beforeA.version,
      actorId: LINA,
    })
    expect(ok.submissionStatus).toBe('withdrawn')
    expect(ok.status).toBe('in_progress')

    // 对照 B：createdBy（张伟）但非提报人 —— 40302 且零副作用
    resetDatabase()
    const beforeB = findTask('task-014')!
    const auditLen = db.auditFeed.length
    await expect(
      taskService.withdrawCompletion('task-014', { version: beforeB.version, actorId: ME }),
    ).rejects.toMatchObject({ code: ERR_SUBMISSION_FORBIDDEN })

    const afterB = findTask('task-014')!
    expect(afterB.submissionStatus).toBe('pending')
    expect(afterB.status).toBe('in_progress')
    expect(afterB.version).toBe(beforeB.version)
    expect(db.auditFeed.length).toBe(auditLen) // 守卫失败不写团队动态
  })

  it('isWithdrawable 纯函数：completion 分支主体 = assigneeId ?? createdBy', () => {
    const task = findTask('task-014')!
    expect(isWithdrawable(task, LINA)).toBe(true) // 提报人
    expect(isWithdrawable(task, ME)).toBe(false) // createdBy ≠ 提报人
  })

  it('isWithdrawable：task 分支（新任务提报）主体仍为 createdBy', () => {
    const record = findTask('task-020')!
    expect(record.submissionKind).toBe('task')
    expect(record.createdBy).toBe(WANGQIANG)
    expect(record.assigneeId).toBeNull()
    expect(isWithdrawable(record, WANGQIANG)).toBe(true)
    expect(isWithdrawable(record, ME)).toBe(false)
  })

  it('isWithdrawable：project 分支主体仍为 createdBy（assigneeId 是拟负责人，不算提报人）', () => {
    const record = findTask('task-019')!
    expect(record.submissionKind).toBe('project')
    // 若误把 assigneeId 当提报人，则 MANAGER 会被判为可撤回 ⇒ 本断言会失败
    expect(isWithdrawable(record, LINA)).toBe(true) // createdBy
    expect(isWithdrawable(record, MANAGER)).toBe(false) // 拟负责人 ≠ 提报人
  })

  it('校验顺序：version 优先于主体（陈旧 version + 错误 actor ⇒ 40901 而非 40302）', async () => {
    const task = findTask('task-014')!
    await expect(
      taskService.withdrawCompletion('task-014', { version: task.version - 1, actorId: ME }),
    ).rejects.toMatchObject({ code: ERR_OPTIMISTIC_LOCK })
  })

  it('校验顺序：pending 门禁优先于主体（非 pending + 错误 actor ⇒ 40302「仅待审核」文案）', async () => {
    // task-007：done + submissionStatus undefined（非 pending）
    const task = findTask('task-007')!
    await expect(
      taskService.withdrawCompletion('task-007', { version: task.version, actorId: ME }),
    ).rejects.toMatchObject({ code: ERR_SUBMISSION_FORBIDDEN, message: '仅待审核的完成提报可撤回' })
  })

  it('校验顺序：pending 通过但主体不符 ⇒ 40302「只能撤回本人」文案', async () => {
    const task = findTask('task-014')!
    await expect(
      taskService.withdrawCompletion('task-014', { version: task.version, actorId: ME }),
    ).rejects.toMatchObject({ code: ERR_SUBMISSION_FORBIDDEN, message: '只能撤回本人提交的完成提报' })
  })
})

// ── 2. AC-01 / AC-03 / AC-05 / AC-08 / AC-09 / AC-10 / AC-11 独立复算 ─────────

describe('QA · AC-01 · task-014 撤回（非 done 分支）', () => {
  it('withdrawn + status 不变 + 六字段 + version+1 + 退出待审队列', async () => {
    const before = findTask('task-014')!
    const version = before.version
    // 前提：撤回前在「待我审核」队列中
    expect(ids(await taskService.listPendingReview(ME))).toContain('task-014')

    const result = await taskService.withdrawCompletion('task-014', { version, actorId: LINA })

    expect(result.submissionStatus).toBe('withdrawn')
    expect(result.status).toBe('in_progress') // 非 done ⇒ 不改 status
    expect(result.status).not.toBe('cancelled')
    expect(result.reviewRequired).toBe(false)
    expect(result.reviewerIds).toEqual([])
    expect(result.reviewNote).toBeNull()
    expect(result.reviewedBy).toBeNull()
    expect(result.reviewedAt).toBeNull()
    expect(result.version).toBe(version + 1)
    expect(ids(await taskService.listPendingReview(ME))).not.toContain('task-014')
  })

  it('撤回清理「非空」审核态字段（构造非空值 ⇒ 证明是清理而非本来为 null）', async () => {
    const task = findTask('task-014')!
    // 人为构造「有审核历史」的轮回态
    task.reviewNote = '上一轮审核备注'
    task.reviewedBy = ME
    task.reviewedAt = demoDayAt(0, 10, 0)
    task.reviewerIds = [ME, MANAGER]

    const result = await taskService.withdrawCompletion('task-014', {
      version: task.version,
      actorId: LINA,
    })

    expect(result.submissionStatus).toBe('withdrawn')
    expect(result.reviewRequired).toBe(false)
    expect(result.reviewerIds).toEqual([])
    expect(result.reviewNote).toBeNull()
    expect(result.reviewedBy).toBeNull()
    expect(result.reviewedAt).toBeNull()
  })
})

describe('QA · AC-03 · task-004 先完成提报（done+pending）再撤回', () => {
  it('done → in_progress，completedAt 置空，退出待审队列', async () => {
    const before = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { version: before.version })
    expect(done.status).toBe('pending_review')
    expect(done.submissionStatus).toBe('pending')
    expect(done.completedAt).not.toBeNull()
    expect(ids(await taskService.listPendingReview(ME))).toContain('task-004')

    const result = await taskService.withdrawCompletion('task-004', {
      version: done.version,
      actorId: LINA,
    })

    expect(result.status).toBe('in_progress')
    expect(result.completedAt).toBeNull() // INV-1
    expect(result.submissionStatus).toBe('withdrawn')
    expect(result.reviewRequired).toBe(false)
    expect(result.reviewerIds).toEqual([])
    expect(result.version).toBe(done.version + 1)
    expect(ids(await taskService.listPendingReview(ME))).not.toContain('task-004')
  })
})

describe('QA · AC-05 · 幂等 / 重复撤回', () => {
  it('连续撤回两次 ⇒ 第二次 40302，submissionStatus 仍 withdrawn，audit 不再增长', async () => {
    const before = findTask('task-014')!
    const first = await taskService.withdrawCompletion('task-014', {
      version: before.version,
      actorId: LINA,
    })
    expect(first.submissionStatus).toBe('withdrawn')
    const auditLen = db.auditFeed.length

    await expect(
      taskService.withdrawCompletion('task-014', { version: first.version, actorId: LINA }),
    ).rejects.toMatchObject({ code: ERR_SUBMISSION_FORBIDDEN })

    expect(findTask('task-014')!.submissionStatus).toBe('withdrawn')
    expect(findTask('task-014')!.version).toBe(first.version)
    expect(db.auditFeed.length).toBe(auditLen)
  })
})

describe('QA · AC-08 · 非 pending 不可撤回（task-007）', () => {
  it('40302 且任务零变化（含 version / status / audit）', async () => {
    const before = findTask('task-007')!
    const version = before.version
    const auditLen = db.auditFeed.length

    await expect(
      taskService.withdrawCompletion('task-007', { version, actorId: ME }),
    ).rejects.toMatchObject({ code: ERR_SUBMISSION_FORBIDDEN })

    const after = findTask('task-007')!
    expect(after.status).toBe('done')
    expect(after.submissionStatus).toBeUndefined()
    expect(after.version).toBe(version)
    expect(db.auditFeed.length).toBe(auditLen)
  })
})

describe('QA · AC-09 / INV-6 · 零通知（硬约束）', () => {
  it('撤回前后 db.notifications 逐字节相等，且 auditFeed +1（action 正确）', async () => {
    const before = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { version: before.version })
    const snapshot = JSON.stringify(db.notifications)
    const notifLen = db.notifications.length
    const auditLen = db.auditFeed.length

    const result = await taskService.withdrawCompletion('task-004', {
      version: done.version,
      actorId: LINA,
    })

    expect(JSON.stringify(db.notifications)).toBe(snapshot) // 逐字节相等
    expect(db.notifications.length).toBe(notifLen)
    expect(db.auditFeed.length).toBe(auditLen + 1)
    expect(db.auditFeed[0].action).toBe('submission.withdraw.completion')
    expect(db.auditFeed[0].summary).toContain(result.title)
    expect(db.auditFeed[0].actorId).toBe(LINA)
  })

  it('非 done 分支（task-014）撤回亦零通知', async () => {
    const before = findTask('task-014')!
    const snapshot = JSON.stringify(db.notifications)
    await taskService.withdrawCompletion('task-014', { version: before.version, actorId: LINA })
    expect(JSON.stringify(db.notifications)).toBe(snapshot)
  })
})

describe('QA · AC-10 / INV-5 · 正式任务永不被撤回动作写成 cancelled', () => {
  it('task-014 撤回后 status 保持撤回前原值（in_progress）', async () => {
    const before = findTask('task-014')!
    const statusBefore = before.status
    const result = await taskService.withdrawCompletion('task-014', {
      version: before.version,
      actorId: LINA,
    })
    expect(result.status).toBe(statusBefore)
    expect(result.status).not.toBe('cancelled')
  })

  it('task-015 撤回后仍 in_progress（非 cancelled / 非 todo）', async () => {
    const before = findTask('task-015')!
    const result = await taskService.withdrawCompletion('task-015', {
      version: before.version,
      actorId: WANGQIANG,
    })
    expect(result.status).toBe('in_progress')
    expect(result.submissionStatus).toBe('withdrawn')
  })

  it('全量：对每个可撤回的完成提报撤回后，无任何正式任务 status === cancelled 新增', async () => {
    // 增量 7.1（ARCH §2.4.2 / 分类 R）：只统计「**正式任务**」—— 评审子任务被撤回动作关闭是**有意**行为
    const cancelledBefore = ids(
      db.tasks.filter((task) => task.status === 'cancelled' && task.isReviewTask !== true),
    )
    // task-004 / task-009 走 done 分支；task-014 / task-015 走非 done 分支
    const done004 = await taskService.completeTask('task-004', {
      version: findTask('task-004')!.version,
    })
    await taskService.withdrawCompletion('task-004', { version: done004.version, actorId: LINA })
    await taskService.withdrawCompletion('task-014', {
      version: findTask('task-014')!.version,
      actorId: LINA,
    })
    await taskService.withdrawCompletion('task-015', {
      version: findTask('task-015')!.version,
      actorId: WANGQIANG,
    })
    const cancelledAfter = ids(
      db.tasks.filter((task) => task.status === 'cancelled' && task.isReviewTask !== true),
    )
    expect(cancelledAfter).toEqual(cancelledBefore)
  })
})

describe('QA · AC-11 · 撤回让任务重新可见于「今日到期」', () => {
  it('task-004 完成提报后从「今日到期」消失；撤回后重新出现', async () => {
    const before = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { version: before.version })

    const dueBefore = ids(await taskService.listTodayDue(ME, SH))
    expect(dueBefore).not.toContain('task-004')

    await taskService.withdrawCompletion('task-004', { version: done.version, actorId: LINA })

    const dueAfter = ids(await taskService.listTodayDue(ME, SH))
    expect(dueAfter).toContain('task-004')
  })
})

// ── 3. AC-06 / AC-07 · 审核通过 / 驳回后不可撤回 ─────────────────────────────

describe('QA · AC-06 / AC-07 · 审核结论为终态后不可撤回', () => {
  it('AC-06：approve 后（approved + done）撤回被拒 ⇒ 40302，状态不变', async () => {
    const before = findTask('task-014')!
    const approved = await taskService.reviewSubmission('task-014', 'approve', before.version)
    expect(approved.submissionStatus).toBe('approved')
    expect(approved.status).toBe('done')

    await expect(
      taskService.withdrawCompletion('task-014', { version: approved.version, actorId: LINA }),
    ).rejects.toMatchObject({ code: ERR_SUBMISSION_FORBIDDEN })

    const after = findTask('task-014')!
    expect(after.submissionStatus).toBe('approved')
    expect(after.status).toBe('done')
    expect(after.version).toBe(approved.version)
  })

  it('AC-07：reject 后（rejected）撤回被拒 ⇒ 40302，状态不变', async () => {
    const before = findTask('task-015')!
    const rejected = await taskService.reviewSubmission('task-015', 'reject', before.version, '说明不充分')
    expect(rejected.submissionStatus).toBe('rejected')

    await expect(
      taskService.withdrawCompletion('task-015', { version: rejected.version, actorId: WANGQIANG }),
    ).rejects.toMatchObject({ code: ERR_SUBMISSION_FORBIDDEN })

    expect(findTask('task-015')!.submissionStatus).toBe('rejected')
  })
})

// ── 4. INV-1 全量遍历 ───────────────────────────────────────────────────────

describe('QA · INV-1 · completedAt != null ⟺ status === done（全量遍历）', () => {
  it('种子态：全部任务满足 INV-1（无违例）', () => {
    expect(db.tasks.length).toBeGreaterThan(0)
    expect(inv1Violations()).toEqual([])
  })

  it('撤回 done→in_progress 后：全部任务仍满足 INV-1', async () => {
    const before = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { version: before.version })
    expect(inv1Violations()).toEqual([]) // done + completedAt 非空
    await taskService.withdrawCompletion('task-004', { version: done.version, actorId: LINA })
    expect(inv1Violations()).toEqual([]) // in_progress + completedAt 已置空
    expect(findTask('task-004')!.completedAt).toBeNull()
  })

  it('批量「完成→撤回」后：全部任务仍满足 INV-1', async () => {
    for (const id of ['task-004', 'task-005', 'task-006']) {
      const task = findTask(id)!
      const done = await taskService.completeTask(id, { version: task.version })
      await taskService.withdrawCompletion(id, { version: done.version, actorId: task.assigneeId! })
    }
    expect(inv1Violations()).toEqual([])
  })
})

// ── 5. INV-3 / INV-7 · 待审队列与「审核轮回态」保护 ─────────────────────────

describe('QA · INV-3 / INV-7 · 待审可见性与轮回态保护', () => {
  it('INV-3：pending ∧ reviewRequired ∧ reviewerIds∋me ⟺ 出现在 listPendingReview(me)', async () => {
    const reviewBefore = ids(await taskService.listPendingReview(ME))
    expect(reviewBefore).toContain('task-014')
    expect(reviewBefore).toContain('task-015')

    const before = findTask('task-014')!
    await taskService.withdrawCompletion('task-014', { version: before.version, actorId: LINA })

    const reviewAfter = ids(await taskService.listPendingReview(ME))
    expect(reviewAfter).not.toContain('task-014')
    expect(reviewAfter).toContain('task-015') // 其他待审不受影响
  })

  it('INV-7：审核轮回态（in_progress + pending）经 moveTask 迁往 todo 时审核态不被清理', async () => {
    const task = findTask('task-014')!
    // 判据函数：非 done 的 pending 离开状态 ⇒ 不清理
    expect(shouldClearReviewOnLeaveDone(task, 'todo')).toBe(false)

    const moved = await taskService.moveTask('task-014', { status: 'todo', version: task.version })
    expect(moved.status).toBe('todo')
    expect(moved.submissionStatus).toBe('pending') // 未被清理
    expect(moved.reviewRequired).toBe(true)
    expect((moved.reviewerIds ?? []).length).toBeGreaterThan(0)
    // 仍在待审队列（K3 反向缺陷防护）
    expect(ids(await taskService.listPendingReview(ME))).toContain('task-014')
  })
})

// ── 6. INV-2 · 徽标 ≠ 头部（并集口径）────────────────────────────────────────

describe('QA · INV-2 · 徽标之和 ≥ 头部并集基数', () => {
  it('三分组长度之和 ≥ 并集基数，且并集基数 === countVisibleFocusTasks', async () => {
    const focus = await focusService.getTodayFocus(ME, SH)
    const badgeSum = focus.dueToday.length + focus.pendingReview.length + focus.approaching.length
    const union = new Set([...ids(focus.dueToday), ...ids(focus.pendingReview), ...ids(focus.approaching)])
    const header = countVisibleFocusTasks(focus, { includeReview: true })

    expect(header).toBe(union.size)
    expect(badgeSum).toBeGreaterThanOrEqual(header)
  })
})

// ── 7. INV-4 / INV-8 · 乐观锁、非法迁移与提报状态机表 ────────────────────────

describe('QA · INV-4 / INV-8 · 错误码与提报状态机表', () => {
  it('陈旧 version ⇒ 40901（任务状态不变）', async () => {
    const task = findTask('task-014')!
    await expect(
      taskService.withdrawCompletion('task-014', { version: task.version + 3, actorId: LINA }),
    ).rejects.toMatchObject({ code: ERR_OPTIMISTIC_LOCK })
    expect(findTask('task-014')!.submissionStatus).toBe('pending')
  })

  it('非法任务状态迁移 ⇒ 40902（details.allowed_transitions 存在）', async () => {
    // done → blocked 非法（TASK_TRANSITIONS.done = ['todo','in_progress']）
    const task = findTask('task-007')!
    await expect(
      taskService.moveTask('task-007', { status: 'blocked', version: task.version }),
    ).rejects.toMatchObject({ code: ERR_ILLEGAL_TRANSITION })
  })

  it('INV-8：SUBMISSION_TRANSITIONS 表内容未改（pending→withdrawn 合法，approved 终态）', () => {
    expect(SUBMISSION_TRANSITIONS).toEqual({
      draft: ['pending', 'published'],
      pending: ['approved', 'rejected', 'withdrawn'],
      approved: ['pending'],
      rejected: ['draft', 'pending'],
      withdrawn: ['draft', 'pending'],
    })
    expect(canTransition('pending', 'withdrawn')).toBe(true)
    expect(canTransition('approved', 'pending')).toBe(true) // 受保护断言同向
  })
})

// ── 8. blocked 来源（ARCH §10-5 已登记限制，确认行为与文档一致）─────────────

describe('QA · blocked 来源：blocked → done → 撤回 ⇒ in_progress（阻塞标记丢失）', () => {
  it('task-009（blocked）完成提报后撤回落 in_progress（不再 blocked）', async () => {
    const before = findTask('task-009')!
    expect(before.status).toBe('blocked')
    const done = await taskService.completeTask('task-009', { version: before.version })
    expect(done.status).toBe('pending_review')

    const result = await taskService.withdrawCompletion('task-009', {
      version: done.version,
      actorId: WANGQIANG, // assigneeId
    })

    // 与 ARCH §10-5 / R5-3 一致：done 无法回到 blocked ⇒ 落 in_progress
    expect(result.status).toBe('in_progress')
    expect(result.completedAt).toBeNull()
    expect(result.submissionStatus).toBe('withdrawn')
    expect(inv1Violations()).toEqual([])
  })
})

// ── 9. 唯一构造点复核（K19 / K20 / K24）─────────────────────────────────────

describe('QA · 源码级：唯一构造点与零通知（K19 / K20 / K24）', () => {
  const taskSrc = readFileSync(resolve(__dirname, '../src/services/task.service.ts'), 'utf8')
  const submissionSrc = readFileSync(resolve(__dirname, '../src/utils/submission.ts'), 'utf8')
  const withdrawBody = taskSrc.slice(
    taskSrc.indexOf('export async function withdrawCompletion'),
    taskSrc.indexOf('export async function reviewSubmission'),
  )

  it('withdrawCompletion 复用 applyClearedReviewState（不手写第二份字段清单）', () => {
    expect(withdrawBody).toContain('applyClearedReviewState(')
    expect(withdrawBody).not.toContain('reviewRequired: false')
    expect(withdrawBody).not.toContain('reviewerIds: []')
    expect(withdrawBody).not.toContain('reviewNote: null')
  })

  it('withdrawCompletion 真正引用 isWithdrawable（K20 唯一主体事实来源）', () => {
    expect(withdrawBody).toContain('isWithdrawable(')
    // 不得内联第二份主体判据（createdBy === actorId 形式）
    expect(withdrawBody).not.toContain('createdBy === input.actorId')
  })

  it('withdrawCompletion 零通知（无 pushNotification / db.notifications）', () => {
    expect(withdrawBody).not.toContain('pushNotification')
    expect(withdrawBody).not.toContain('db.notifications')
  })

  it('withdrawCompletion 永不把 status 写成 cancelled（INV-5）', () => {
    expect(withdrawBody).not.toContain("'cancelled'")
  })

  it('全仓 createClearedReviewState() 仅一处定义，且返回完整的六字段清理包', () => {
    const definitionCount = (submissionSrc.match(/export function createClearedReviewState\(\)/g) ?? []).length
    expect(definitionCount).toBe(1)

    const fnBody = submissionSrc.slice(
      submissionSrc.indexOf('export function createClearedReviewState()'),
      submissionSrc.indexOf('export function resolveUndoReviewReset'),
    )
    for (const field of [
      'submissionStatus: null',
      'reviewRequired: false',
      'reviewerIds: []',
      'reviewNote: null',
      'reviewedBy: null',
      'reviewedAt: null',
    ]) {
      expect(fnBody).toContain(field)
    }
  })

  it('withdrawSubmission 的既有内联判据未被改（R5-9：仍以 createdBy 为唯一主体）', () => {
    const withdrawSubmissionBody = taskSrc.slice(
      taskSrc.indexOf('export async function withdrawSubmission'),
      taskSrc.indexOf('export interface WithdrawCompletionInput'),
    )
    expect(withdrawSubmissionBody).toContain('task.createdBy !== actorId')
    expect(withdrawSubmissionBody).toContain("task.status = 'cancelled'")
  })
})

// ── 10. AC-14 源码锚点（①/② 未被动过）──────────────────────────────────────

describe('QA · AC-14 · 判据行与列表过滤条件逐条未变', () => {
  const taskSrc = readFileSync(resolve(__dirname, '../src/services/task.service.ts'), 'utf8')
  const submissionSrc = readFileSync(resolve(__dirname, '../src/utils/submission.ts'), 'utf8')

  it('shouldClearReviewOnLeaveDone 判据仍为四条件合取（完成态 = {done, pending_review}，未新增额外条件）', () => {
    expect(submissionSrc).toContain(
      "(task.status === 'done' || task.status === 'pending_review') && nextStatus !== 'done' && nextStatus !== 'pending_review' && task.submissionStatus === 'pending'",
    )
  })

  it('listTodayDue 过滤条件逐条不变（done 排除 / pending 排除 / 提报记录守卫）', () => {
    const body = taskSrc.slice(
      taskSrc.indexOf('export async function listTodayDue'),
      taskSrc.indexOf('export async function listPendingReview'),
    )
    expect(body).toContain("task.status !== 'done'")
    expect(body).toContain("task.submissionStatus !== 'pending'")
    expect(body).toContain('!isSubmissionRecord(task)')
  })

  it('listDeadlineApproaching 过滤条件逐条不变（done/cancelled/pending_review 排除 + 提报记录守卫）', () => {
    const body = taskSrc.slice(
      taskSrc.indexOf('export async function listDeadlineApproaching'),
      taskSrc.indexOf('export async function listTasksByProject'),
    )
    expect(body).toContain(
      "if (task.status === 'done' || task.status === 'cancelled' || task.status === 'pending_review') return false",
    )
    expect(body).toContain('if (isSubmissionRecord(task)) return false')
  })
})

// ── 11. (B) 「重开为进行中」分支拆分（M5-P1-04）─────────────────────────────

describe('QA · (B) TaskDetailScreen.runTransition 的 done 分支拆分', () => {
  const source = readFileSync(resolve(__dirname, '../src/screens/TaskDetailScreen.tsx'), 'utf8')
  const body = source.slice(
    source.indexOf('const runTransition = useCallback('),
    source.indexOf('const handleClaim', source.indexOf('const runTransition = useCallback(')),
  )

  it('done 分支内：in_progress 子分支走 moveTask + status: in_progress', () => {
    const doneIdx = body.indexOf("current.status === 'done'")
    expect(doneIdx).toBeGreaterThan(-1)
    const inProgressIdx = body.indexOf("action.to === 'in_progress'", doneIdx)
    const reopenIdx = body.indexOf('taskService.reopenTask', doneIdx)
    expect(inProgressIdx).toBeGreaterThan(doneIdx)
    expect(reopenIdx).toBeGreaterThan(inProgressIdx)

    const inProgressSegment = body.slice(inProgressIdx, reopenIdx)
    expect(inProgressSegment).toContain('taskService.moveTask')
    expect(inProgressSegment).toContain("status: 'in_progress'")
  })

  it('done → todo 子分支仍走 reopenTask（默认原因字符串逐字节不变）', () => {
    expect(body).toContain('taskService.reopenTask')
    expect(body).toContain("reason.trim() || '重开任务'")
  })

  it('非 done 分支仍走 moveTask（action.to 透传，未被 done 拆分影响）', () => {
    const elseIdx = body.indexOf("status: action.to")
    expect(elseIdx).toBeGreaterThan(-1)
    expect(body.slice(elseIdx - 200, elseIdx + 50)).toContain('taskService.moveTask')
  })

  it('requireReason 未被放宽：TASK_TRANSITION_ACTIONS.done 两项仍 requireReason=true', () => {
    const doneActions = TASK_TRANSITION_ACTIONS.done
    expect(doneActions).toHaveLength(2)
    expect(doneActions.map((action) => action.to).sort()).toEqual(['in_progress', 'todo'])
    expect(doneActions.every((action) => action.requireReason === true)).toBe(true)
  })
})

// ── 12. (B) 服务层直接验证两条重开路径的行为 + 可观测差异登记 ─────────────────

describe('QA · (B) 服务层：moveTask(done→in_progress) 与 reopenTask(done→todo)', () => {
  it('moveTask(done → in_progress)：落 in_progress + completedAt 置空 + 清审核态 + audit=task.move', async () => {
    const before = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { version: before.version })
    expect(done.submissionStatus).toBe('pending')

    const moved = await taskService.moveTask('task-004', {
      status: 'in_progress',
      version: done.version,
    })

    expect(moved.status).toBe('in_progress')
    expect(moved.completedAt).toBeNull()
    expect(moved.submissionStatus).toBeNull() // 离开 done 且 pending ⇒ 清理
    expect(moved.reviewRequired).toBe(false)
    expect(moved.reviewerIds).toEqual([])
    expect(db.auditFeed[0].action).toBe('task.move')
  })

  it('reopenTask(done → todo)：落 todo（逐字节不变）+ audit=task.reopen + actorId=createdBy', async () => {
    const before = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { version: before.version })

    const reopened = await taskService.reopenTask('task-004', {
      reason: '重开任务',
      version: done.version,
    })

    expect(reopened.status).toBe('todo')
    expect(reopened.completedAt).toBeNull()
    expect(db.auditFeed[0].action).toBe('task.reopen')
    expect(db.auditFeed[0].actorId).toBe(ME) // createdBy
  })

  it('可观测差异登记：moveTask 的 audit actorId = assigneeId ?? createdBy（≠ reopenTask 的 createdBy）', async () => {
    const before = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { version: before.version })

    await taskService.moveTask('task-004', { status: 'in_progress', version: done.version })
    const moveActor = db.auditFeed[0].actorId

    const done2 = await taskService.completeTask('task-004', {
      version: findTask('task-004')!.version,
    })
    await taskService.reopenTask('task-004', { reason: '重开任务', version: done2.version })
    const reopenActor = db.auditFeed[0].actorId

    expect(moveActor).toBe(LINA) // assigneeId（task-004 的负责人）
    expect(reopenActor).toBe(ME) // createdBy
    expect(moveActor).not.toBe(reopenActor) // 差异确实存在且已登记
  })

  it('可观测差异登记：moveTask 对 in_progress 目标补 startedAt ??= now()（startedAt 为空时被填充）', async () => {
    const before = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { version: before.version })
    // 构造「从未开始」的任务（startedAt 置空）
    findTask('task-004')!.startedAt = null

    const moved = await taskService.moveTask('task-004', {
      status: 'in_progress',
      version: done.version,
    })
    expect(moved.startedAt).not.toBeNull()
  })

  it('startedAt 已存在时保持不变（既有断言不受影响）', async () => {
    const before = findTask('task-004')!
    const startedAtBefore = before.startedAt
    expect(startedAtBefore).not.toBeNull()
    const done = await taskService.completeTask('task-004', { version: before.version })

    const moved = await taskService.moveTask('task-004', {
      status: 'in_progress',
      version: done.version,
    })
    expect(moved.startedAt).toBe(startedAtBefore)
  })
})

// ── 13. 撤回后 UI 入口的可见性谓词（与服务端同源）───────────────────────────

describe('QA · 撤回入口可见性谓词与服务端同源（M5-P0-03）', () => {
  it('可见性 = pending ∧ can(withdraw) ∧ isWithdrawable；撤回后即不可见', async () => {
    const task = findTask('task-014')!
    // 提报人视角：pending + 本人 ⇒ 可见
    expect(task.submissionStatus === 'pending' && isWithdrawable(task, LINA)).toBe(true)
    // 非提报人视角：不可见
    expect(task.submissionStatus === 'pending' && isWithdrawable(task, ME)).toBe(false)

    await taskService.withdrawCompletion('task-014', { version: task.version, actorId: LINA })
    const after = findTask('task-014')!
    expect(after.submissionStatus === 'pending' && isWithdrawable(after, LINA)).toBe(false)
  })
})
