/**
 * 职责：增量 4 —— 「完成提报」撤回链路 + 「重开为进行中」分支修正（ARCH §5 T05）。
 *
 * 本文件为**独立新增套件**，不修改任何既有套件的断言（K11 精神 / M4-P1-01 落点规则）。
 * 覆盖：
 * - 纯函数 `isWithdrawable` 的**分叉主体**（M5-P0-02 / K20）；
 * - 服务入口 `withdrawCompletion` 全链路 AC-01~AC-11（40302 / 40901 / 零通知 / 幂等 /
 *   `listPendingReview` 收敛 / `listTodayDue` 复现）；
 * - 「重开为进行中」改走 `moveTask` 的**源码文本断言**（M5-P1-04，照增量 3 的 `readFileSync` 姿势）。
 *
 * ⚠️ 签名以 ARCH §3.1 为准：`withdrawCompletion(taskId, { version, actorId, reason? })`
 *    （PRD §5.1 的 positional 写法逐字段等价）。
 */
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DEMO_USER_IDS, db, findTask, resetDatabase } from '@/data'
import { ERR_OPTIMISTIC_LOCK } from '@/types'
import * as taskService from '@/services/task.service'
import { ERR_SUBMISSION_FORBIDDEN, isWithdrawable } from '@/utils/submission'

/** user-001（张伟）：task-014 的 `createdBy`（但**不是**提报人）/ 审核人 */
const ME = DEMO_USER_IDS.me
/** user-002（李娜）：task-004 / task-014 的 `assigneeId`（= 完成提报的提报人） */
const LINA = DEMO_USER_IDS.lina
/** user-003（王强）：task-015 的 `assigneeId` */
const WANGQIANG = DEMO_USER_IDS.wangqiang
/** 时区 */
const SH = 'Asia/Shanghai'

function ids(tasks: { id: string }[]): string[] {
  return tasks.map((task) => task.id)
}

beforeEach(() => {
  resetDatabase()
})

// ── isWithdrawable 分叉主体（M5-P0-02 / K20）────────────────────────────────

describe('isWithdrawable —— 分叉主体（M5-P0-02）', () => {
  it('completion 分支：提报人 = assigneeId ?? createdBy（task-014：assigneeId=user-002）', () => {
    const task = findTask('task-014')!
    expect(task.assigneeId).toBe(LINA)
    expect(task.createdBy).toBe(ME)
    // 提报人（李娜）可撤回
    expect(isWithdrawable(task, LINA)).toBe(true)
    // createdBy（张伟）不是提报人 ⇒ 不可撤回（主体错位修正的核心）
    expect(isWithdrawable(task, ME)).toBe(false)
  })

  it('非 completion 分支（新事项提报）：提报人 = createdBy', () => {
    const record = {
      source: 'submission' as const,
      submissionKind: 'task' as const,
      createdBy: ME,
      assigneeId: LINA,
      submissionStatus: 'pending' as const,
    }
    expect(isWithdrawable(record, ME)).toBe(true)
    expect(isWithdrawable(record, LINA)).toBe(false)
  })

  it('completion 分支且 assigneeId 为 null ⇒ 兜底 createdBy', () => {
    const record = {
      source: 'submission' as const,
      submissionKind: null,
      createdBy: ME,
      assigneeId: null,
      submissionStatus: 'pending' as const,
    }
    expect(isWithdrawable(record, ME)).toBe(true)
    expect(isWithdrawable(record, LINA)).toBe(false)
  })

  it.each(['draft', 'approved', 'rejected', 'withdrawn', null, undefined] as const)(
    'submissionStatus = %p（非 pending）⇒ 一律 false',
    (submissionStatus) => {
      expect(
        isWithdrawable(
          {
            source: 'submission',
            submissionKind: null,
            createdBy: ME,
            assigneeId: ME,
            submissionStatus,
          },
          ME,
        ),
      ).toBe(false)
    },
  )
})

// ── AC-01 ~ AC-11：withdrawCompletion 全链路 ─────────────────────────────────

describe('AC-01 · task-014（审核轮回态）撤回 ⇒ withdrawn + 状态不变 + 退出待审队列', () => {
  it('撤回成功：submissionStatus=withdrawn、status=in_progress（非 cancelled）、审核态清空、version+1', async () => {
    const before = findTask('task-014')!
    const version = before.version
    expect(before.status).toBe('in_progress')
    expect(before.submissionStatus).toBe('pending')

    const result = await taskService.withdrawCompletion('task-014', { version, actorId: LINA })

    expect(result.submissionStatus).toBe('withdrawn')
    expect(result.status).toBe('in_progress')
    expect(result.status).not.toBe('cancelled')
    expect(result.reviewRequired).toBe(false)
    expect(result.reviewerIds).toEqual([])
    expect(result.reviewNote).toBeNull()
    expect(result.reviewedBy).toBeNull()
    expect(result.reviewedAt).toBeNull()
    expect(result.version).toBe(version + 1)
    // INV-3：撤回后必然从「待我审核」消失
    expect((await taskService.listPendingReview(ME)).some((task) => task.id === 'task-014')).toBe(false)
  })
})

describe('AC-02 · 主体错位修正：createdBy 但非提报人 ⇒ 40302 且任务零变化', () => {
  it('withdrawCompletion(task-014, actorId=user-001) ⇒ 40302', async () => {
    const before = findTask('task-014')!
    const version = before.version

    await expect(
      taskService.withdrawCompletion('task-014', { version, actorId: ME }),
    ).rejects.toMatchObject({ code: ERR_SUBMISSION_FORBIDDEN })

    const after = findTask('task-014')!
    expect(after.submissionStatus).toBe('pending')
    expect(after.version).toBe(version)
  })
})

describe('AC-03 · task-004 先完成提报（done + pending）再撤回 ⇒ in_progress + completedAt 清空', () => {
  it('done → in_progress，六字段全清，退出待审队列', async () => {
    const before = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { version: before.version })
    expect(done.status).toBe('pending_review')
    expect(done.submissionStatus).toBe('pending')

    const result = await taskService.withdrawCompletion('task-004', {
      version: done.version,
      actorId: LINA,
    })

    expect(result.status).toBe('in_progress')
    expect(result.completedAt).toBeNull() // INV-1
    expect(result.submissionStatus).toBe('withdrawn')
    expect(result.reviewRequired).toBe(false)
    expect((result.reviewerIds ?? []).length).toBe(0)
    expect(result.version).toBe(done.version + 1)
    expect((await taskService.listPendingReview(ME)).some((task) => task.id === 'task-004')).toBe(false)
  })
})

describe('AC-04 · 陈旧 version ⇒ 40901 且任务状态不变', () => {
  it('withdrawCompletion(task-004, version-1) ⇒ 40901', async () => {
    const before = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { version: before.version })

    await expect(
      taskService.withdrawCompletion('task-004', { version: done.version - 1, actorId: LINA }),
    ).rejects.toMatchObject({ code: ERR_OPTIMISTIC_LOCK })

    const after = findTask('task-004')!
    expect(after.status).toBe('pending_review')
    expect(after.submissionStatus).toBe('pending')
    expect(after.version).toBe(done.version)
  })
})

describe('AC-05 · 幂等拒绝：已撤回再撤回 ⇒ 40302（非 500）', () => {
  it('第二次 withdrawCompletion ⇒ 40302，submissionStatus 仍 withdrawn', async () => {
    const before = findTask('task-014')!
    const first = await taskService.withdrawCompletion('task-014', {
      version: before.version,
      actorId: LINA,
    })
    expect(first.submissionStatus).toBe('withdrawn')

    await expect(
      taskService.withdrawCompletion('task-014', { version: first.version, actorId: LINA }),
    ).rejects.toMatchObject({ code: ERR_SUBMISSION_FORBIDDEN })

    expect(findTask('task-014')!.submissionStatus).toBe('withdrawn')
  })
})

describe('AC-06 · 审核通过后不可撤回 ⇒ 40302', () => {
  it('approve 后 submissionStatus=approved（终态），撤回被拒', async () => {
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
  })
})

describe('AC-07 · 驳回后不可撤回 ⇒ 40302', () => {
  it('reject 后 submissionStatus=rejected，撤回被拒', async () => {
    const before = findTask('task-015')!
    const rejected = await taskService.reviewSubmission('task-015', 'reject', before.version, '说明不充分')
    expect(rejected.submissionStatus).toBe('rejected')

    await expect(
      taskService.withdrawCompletion('task-015', { version: rejected.version, actorId: WANGQIANG }),
    ).rejects.toMatchObject({ code: ERR_SUBMISSION_FORBIDDEN })

    expect(findTask('task-015')!.submissionStatus).toBe('rejected')
  })
})

describe('AC-08 · 非 pending 不可撤回 ⇒ 40302（task-007：done + submissionStatus undefined）', () => {
  it('withdrawCompletion(task-007) ⇒ 40302 且任务零变化', async () => {
    const before = findTask('task-007')!
    expect(before.status).toBe('done')
    expect(before.submissionStatus).toBeUndefined()
    const version = before.version

    await expect(
      taskService.withdrawCompletion('task-007', { version, actorId: ME }),
    ).rejects.toMatchObject({ code: ERR_SUBMISSION_FORBIDDEN })

    const after = findTask('task-007')!
    expect(after.status).toBe('done')
    expect(after.version).toBe(version)
  })
})

describe('AC-09 · 撤回零通知 + 写团队动态（INV-6 / K24 / M5-P1-01）', () => {
  it('db.notifications 逐字节相等；auditFeed +1 且 action=submission.withdraw.completion', async () => {
    const before = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { version: before.version })
    const notificationSnapshot = JSON.stringify(db.notifications)
    const auditLength = db.auditFeed.length

    const result = await taskService.withdrawCompletion('task-004', {
      version: done.version,
      actorId: LINA,
    })

    expect(JSON.stringify(db.notifications)).toBe(notificationSnapshot)
    expect(db.auditFeed.length).toBe(auditLength + 1)
    expect(db.auditFeed[0].action).toBe('submission.withdraw.completion')
    expect(db.auditFeed[0].summary).toContain(result.title)
  })

  it('填写原因时并入 audit summary（M5-P1-02：原因可选）', async () => {
    const before = findTask('task-014')!
    await taskService.withdrawCompletion('task-014', {
      version: before.version,
      actorId: LINA,
      reason: '需求有变',
    })
    expect(db.auditFeed[0].summary).toContain('需求有变')
  })
})

describe('AC-10 · 正式任务永不被撤回动作写成 cancelled（INV-5）', () => {
  it('task-014（撤回前即非 done）⇒ status 保持原值（不改状态）', async () => {
    const before = findTask('task-014')!
    const statusBefore = before.status
    const result = await taskService.withdrawCompletion('task-014', {
      version: before.version,
      actorId: LINA,
    })
    expect(result.status).toBe(statusBefore)
    expect(result.status).not.toBe('cancelled')
  })

  it('task-015（in_progress + pending）⇒ 撤回后仍 in_progress', async () => {
    const before = findTask('task-015')!
    expect(before.status).toBe('in_progress')
    const result = await taskService.withdrawCompletion('task-015', {
      version: before.version,
      actorId: WANGQIANG,
    })
    expect(result.status).toBe('in_progress')
    expect(result.submissionStatus).toBe('withdrawn')
    expect(result.status).not.toBe('cancelled')
  })
})

describe('AC-11 · 撤回让任务重新可见于「今日到期」（listTodayDue 复现）', () => {
  it('完成提报后被排除（pending）；撤回后重新出现', async () => {
    const before = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { version: before.version })

    const dueBefore = ids(await taskService.listTodayDue(ME, SH))
    expect(dueBefore).not.toContain('task-004') // submissionStatus === 'pending' ⇒ 被排除

    await taskService.withdrawCompletion('task-004', { version: done.version, actorId: LINA })

    const dueAfter = ids(await taskService.listTodayDue(ME, SH))
    expect(dueAfter).toContain('task-004') // withdrawn ≠ pending ⇒ 重新可见
  })
})

// ── 源码文本断言：M5-P1-04「重开为进行中」改走 moveTask ──────────────────────

describe('M5-P1-04 · 「重开为进行中」改走 moveTask（源码文本断言）', () => {
  const source = readFileSync(resolve(__dirname, '../src/screens/TaskDetailScreen.tsx'), 'utf8')
  const start = source.indexOf('const runTransition = useCallback(')
  const body = source.slice(start, source.indexOf('const handleClaim', start))

  it('runTransition 已按 action.to 拆分 done 分支', () => {
    expect(start).toBeGreaterThan(-1)
    expect(body.length).toBeGreaterThan(0)

    const doneStart = body.indexOf("current.status === 'done'")
    expect(doneStart).toBeGreaterThan(-1)

    const inProgressIdx = body.indexOf("action.to === 'in_progress'", doneStart)
    const reopenIdx = body.indexOf('taskService.reopenTask', doneStart)
    expect(inProgressIdx).toBeGreaterThan(-1)
    expect(reopenIdx).toBeGreaterThan(inProgressIdx)

    // in_progress 子分支用 moveTask + status: 'in_progress'（标签与行为一致）
    const inProgressSegment = body.slice(inProgressIdx, reopenIdx)
    expect(inProgressSegment).toContain('taskService.moveTask')
    expect(inProgressSegment).toContain("status: 'in_progress'")
  })

  it('done → todo 仍走 reopenTask（默认原因字符串逐字节不变）', () => {
    expect(body).toContain('taskService.reopenTask')
    expect(body).toContain("reason.trim() || '重开任务'")
  })
})

// ── 源码文本断言：withdrawCompletion 的零通知 / 单一事实来源（K19 / K20 / K24）──

describe('K19 / K20 / K24 · withdrawCompletion 源码约束', () => {
  const source = readFileSync(resolve(__dirname, '../src/services/task.service.ts'), 'utf8')
  const body = source.slice(
    source.indexOf('export async function withdrawCompletion'),
    source.indexOf('export async function reviewSubmission'),
  )

  it('函数体切片非空', () => {
    expect(body.length).toBeGreaterThan(0)
  })

  it('函数体内不含任何通知操作（零通知，K24 / INV-6）', () => {
    expect(body).not.toContain('pushNotification')
    expect(body).not.toContain('db.notifications')
  })

  it('真正引用 isWithdrawable 纯函数（唯一主体事实来源，K20）', () => {
    expect(body).toContain('isWithdrawable(')
  })

  it('复用唯一清理构造点 applyClearedReviewState（不手写第二份字段清单，K19）', () => {
    expect(body).toContain('applyClearedReviewState(')
    expect(body).not.toContain('reviewRequired: false')
  })

  it('永不把 status 写成 cancelled（INV-5）', () => {
    expect(body).not.toContain("'cancelled'")
  })
})
