/**
 * 职责：增量 5 —— 提报 / 审核闭环补完（ARCH §8 T04 / PRD §4 AC）。
 *
 * 本文件为**独立新增套件**，不修改任何既有套件的断言（K11 精神 / R6-10）。
 * 覆盖：
 * - ① 撤回通知链路（AC-01 / AC-02 / AC-03 / AC-05）：包装函数 `withdrawCompletionAndNotify`；
 * - ② 口径锚点（AC-16 / AC-17）：三函数口径未变 + 语义归因注释（零行为变更）；
 * - ③ 迁移表 + 唯一守卫（AC-10 ~ AC-14）：表内容 + 7 处接入 + 幂等 / 清理包豁免 + 源码计数；
 * - ④ `withdrawSubmission` 的 `isSubmissionRecord` 守卫（AC-08 / AC-09）；
 * - `withdrawn → pending` 覆盖（AC-15，M6-P1-01）；
 * - 三处通知映射同步（AC-06 / AC-07）；
 * - 🔴 K38 位置断言：包装函数必须定义在 `reviewSubmission` 之后（否则打破 2 处源码切片断言）。
 *
 * ⚠️ 签名以 ARCH §4.2 / §4.3 为准：
 *    `withdrawCompletionAndNotify(taskId, { version, actorId, reason? })`。
 */
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DEMO_USER_IDS, db, findTask, pushNotificationOnce, resetDatabase } from '@/data'
import { ERR_OPTIMISTIC_LOCK, NOTIFICATION_EVENT_LABEL } from '@/types'
import * as taskService from '@/services/task.service'
import {
  ERR_SUBMISSION_FORBIDDEN,
  SUBMISSION_TRANSITIONS,
  canTransition,
  isSubmissionRecord,
} from '@/utils/submission'

/** user-001（张伟）：task-014 的 `createdBy`（**不是**提报人）/ 审核人 */
const ME = DEMO_USER_IDS.me
/** user-004（第二个 manager）：审核人来源构造用 */
const MANAGER = DEMO_USER_IDS.manager
/** user-002（李娜）：task-004 / task-014 的 `assigneeId`（= 完成提报的提报人） */
const LINA = DEMO_USER_IDS.lina
/** user-003（王强）：task-015 的 `assigneeId` */
const WANGQIANG = DEMO_USER_IDS.wangqiang
/** 时区 */
const SH = 'Asia/Shanghai'

const TASK_SRC = readFileSync(resolve(__dirname, '../src/services/task.service.ts'), 'utf8')

function ids(tasks: { id: string }[]): string[] {
  return tasks.map((task) => task.id)
}

beforeEach(() => {
  resetDatabase()
})

// ── ① 撤回 + 通知链路（M6-P0-01 ~ M6-P0-04）────────────────────────────────

describe('① 撤回 + 通知链路（AC-01 / AC-02 / AC-03 / AC-05）', () => {
  it('AC-01：撤回成功 ⇒ 每位审核人各得 1 条 review.withdrawn', async () => {
    const task = findTask('task-014')!
    const n0 = db.notifications.length

    const updated = await taskService.withdrawCompletionAndNotify('task-014', {
      version: task.version,
      actorId: LINA,
    })

    expect(db.notifications.length).toBe(n0 + 1)
    const notif = db.notifications[0]
    expect(notif.type).toBe('review.withdrawn')
    expect(notif.userId).toBe(ME)
    expect(notif.readAt).toBeNull()
    expect(notif.status).toBe('sent')
    expect(notif.channel).toBe('in_app')
    expect(notif.data?.taskId).toBe('task-014')
    expect(notif.title).toBe('提报已撤回')
    expect(notif.body).toContain('完成提报：首页原型评审')

    expect(updated.submissionStatus).toBe('withdrawn')
    expect(updated.status).toBe('in_progress')
    expect(updated.reviewerIds).toEqual([])
  })

  it('AC-02：接收人来源 = 撤回前的 reviewerIds（清理前快照，K28 / K34）', async () => {
    const task = findTask('task-015')!
    // 人为扩为 2 位审核人（照「构造非空值」姿势）
    task.reviewerIds = [ME, MANAGER]
    const preReviewers = [...task.reviewerIds]
    const n0 = db.notifications.length

    await taskService.withdrawCompletionAndNotify('task-015', {
      version: task.version,
      actorId: WANGQIANG,
    })

    const added = db.notifications.slice(0, db.notifications.length - n0)
    const receivers = added
      .filter((item) => item.type === 'review.withdrawn')
      .map((item) => item.userId)
      .sort()
    expect(receivers).toEqual([...preReviewers].sort())
    expect(added).toHaveLength(2)
    // 通知不依赖清理后的值：撤回后 reviewerIds 已被置空
    expect(findTask('task-015')!.reviewerIds).toEqual([])
  })

  it('AC-03 Given-1：主体不符 ⇒ 40302，零通知 / 零 audit / 零字段变更', async () => {
    const task = findTask('task-014')!
    const v0 = task.version
    const snapshot = JSON.stringify(db.notifications)
    const auditLen = db.auditFeed.length

    await expect(
      taskService.withdrawCompletionAndNotify('task-014', { version: v0, actorId: ME }),
    ).rejects.toMatchObject({ code: ERR_SUBMISSION_FORBIDDEN })

    expect(JSON.stringify(db.notifications)).toBe(snapshot)
    expect(db.auditFeed.length).toBe(auditLen)
    expect(findTask('task-014')!.submissionStatus).toBe('pending')
    expect(findTask('task-014')!.version).toBe(v0)
  })

  it('AC-03 Given-2：陈旧 version ⇒ 40901，零通知', async () => {
    const before = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { version: before.version })
    const snapshot = JSON.stringify(db.notifications)

    await expect(
      taskService.withdrawCompletionAndNotify('task-004', {
        version: done.version - 1,
        actorId: LINA,
      }),
    ).rejects.toMatchObject({ code: ERR_OPTIMISTIC_LOCK })

    expect(JSON.stringify(db.notifications)).toBe(snapshot)
  })

  it('AC-05：未读级去重（pushNotificationOnce）—— 未读 ⇒ 跳过；已读 ⇒ 写入', async () => {
    const task = findTask('task-014')!
    await taskService.withdrawCompletionAndNotify('task-014', {
      version: task.version,
      actorId: LINA,
    })
    const len = db.notifications.length
    const first = db.notifications.find((item) => item.type === 'review.withdrawn')!
    expect(first.readAt).toBeNull()

    // 同一 userId + type + taskId 且首条未读 ⇒ 去重跳过（返回 null，长度不变）
    const dup = pushNotificationOnce({
      userId: ME,
      type: 'review.withdrawn',
      title: '提报已撤回',
      body: '重复派发',
      data: { taskId: 'task-014' },
    })
    expect(dup).toBeNull()
    expect(db.notifications.length).toBe(len)

    // 首条置为已读 ⇒ 再次派发成功
    first.readAt = new Date().toISOString()
    const second = pushNotificationOnce({
      userId: ME,
      type: 'review.withdrawn',
      title: '提报已撤回',
      body: '已读后再派发',
      data: { taskId: 'task-014' },
    })
    expect(second).not.toBeNull()
    expect(db.notifications.length).toBe(len + 1)
  })
})

// ── ① 三处通知映射同步（AC-06 / AC-07）────────────────────────────────────

describe('① 三处通知映射同步（AC-06 / AC-07）', () => {
  it('AC-06 Then-1：NOTIFICATION_EVENT_LABEL 含 review.withdrawn → 撤回提醒', () => {
    expect(NOTIFICATION_EVENT_LABEL['review.withdrawn']).toBe('撤回提醒')
  })

  it('AC-06 Then-2：NotificationsScreen 的 NOTIFICATION_ICON 含 corner-up-left', () => {
    const src = readFileSync(resolve(__dirname, '../src/screens/NotificationsScreen.tsx'), 'utf8')
    expect(src).toContain("'review.withdrawn': 'corner-up-left'")
  })

  it('AC-07：domain.ts:98 注释为单行完整清单（保留既有子串）', () => {
    const src = readFileSync(resolve(__dirname, '../src/types/domain.ts'), 'utf8')
    const commentLine = src
      .split('\n')
      .find((line) => line.includes('task.assigned / mention / deadline_approaching'))
    expect(commentLine).toBeDefined()
    expect(commentLine).toContain('review.pending')
    expect(commentLine).toContain('review.withdrawn')
  })
})

// ── ③ 迁移表 + 唯一守卫（M6-P0-06 / M6-P0-07）──────────────────────────────

describe('③ 迁移表（AC-10）', () => {
  it('AC-10 Then-1：SUBMISSION_TRANSITIONS = 实读反推的真实可写入集合', () => {
    expect(SUBMISSION_TRANSITIONS).toEqual({
      draft: ['pending', 'published'],
      pending: ['approved', 'rejected', 'withdrawn'],
      approved: ['pending'],
      rejected: ['draft', 'pending'],
      withdrawn: ['draft', 'pending'],
    })
  })

  it('AC-10 Then-2/3：修正后应为真 / 仍应为假', () => {
    // 修正后应为真
    expect(canTransition('approved', 'pending')).toBe(true)
    expect(canTransition('rejected', 'pending')).toBe(true)
    expect(canTransition('withdrawn', 'pending')).toBe(true)
    // 仍应为假
    expect(canTransition('draft', 'approved')).toBe(false)
    expect(canTransition('pending', 'draft')).toBe(false)
    expect(canTransition('pending', 'published')).toBe(false)
    expect(canTransition('approved', 'rejected')).toBe(false)
    expect(canTransition('rejected', 'approved')).toBe(false)
    expect(canTransition('withdrawn', 'approved')).toBe(false)
  })
})

describe('③ 守卫接入零回归（AC-11 / AC-12 / AC-13）', () => {
  it('AC-11 W1：completeTask 初始写入（task-004 in_progress，from = undefined）', async () => {
    const task = findTask('task-004')!
    expect(task.submissionStatus).toBeUndefined()
    const done = await taskService.completeTask('task-004', { version: task.version })
    expect(done.status).toBe('pending_review')
    expect(done.submissionStatus).toBe('pending')
  })

  it('AC-11 W2：undoCompletion approved → pending（撤销审核通过）', async () => {
    const task = findTask('task-014')!
    const approved = await taskService.reviewSubmission('task-014', 'approve', task.version)
    expect(approved.submissionStatus).toBe('approved')

    const undone = await taskService.undoCompletion('task-014', {
      status: 'in_progress',
      submissionStatus: 'pending',
      version: approved.version,
    })
    expect(undone.submissionStatus).toBe('pending')
    // 撤销审核通过不复位审核态（K3）
    expect(undone.reviewRequired).toBe(true)
  })

  it('AC-11 W4：landSubmissionRecord manager 免审直落（pending → approved）', async () => {
    const record = await taskService.submitItem({ kind: 'project', title: '免审直落项目' }, ME)
    expect(record.submissionStatus).toBe('approved')
    expect(record.status).toBe('cancelled')
  })

  it('AC-11 W5：withdrawSubmission 提报记录 pending → withdrawn', async () => {
    const record = await taskService.submitItem({ kind: 'task', title: '守卫回归-撤回提报' }, LINA)
    const withdrawn = await taskService.withdrawSubmission(record.id, record.version, LINA)
    expect(withdrawn.submissionStatus).toBe('withdrawn')
    expect(withdrawn.status).toBe('cancelled')
  })

  it('AC-11 W6：withdrawCompletion（清理前快照 from = pending）', async () => {
    const task = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { version: task.version })
    const withdrawn = await taskService.withdrawCompletion('task-004', {
      version: done.version,
      actorId: LINA,
    })
    expect(withdrawn.submissionStatus).toBe('withdrawn')
    expect(withdrawn.status).toBe('in_progress')
  })

  it('AC-11 W7：reviewSubmission approve（pending → approved）', async () => {
    const task = findTask('task-014')!
    const approved = await taskService.reviewSubmission('task-014', 'approve', task.version)
    expect(approved.submissionStatus).toBe('approved')
  })

  it('AC-11 W8：reviewSubmission reject（pending → rejected）', async () => {
    const task = findTask('task-015')!
    const rejected = await taskService.reviewSubmission('task-015', 'reject', task.version, '说明不充分')
    expect(rejected.submissionStatus).toBe('rejected')
  })

  it('AC-12：幂等重写放行（task-014 in_progress + pending ⇒ completeTask 写 pending）', async () => {
    const task = findTask('task-014')!
    const done = await taskService.completeTask('task-014', { version: task.version })
    expect(done.status).toBe('pending_review')
    expect(done.submissionStatus).toBe('pending')
    expect(done.reviewerIds).toContain(ME)
  })

  it('AC-13 Then-1：undoCompletion submissionStatus=null ⇒ 不抛错 + 六字段全清', async () => {
    const task = findTask('task-004')!
    const done = await taskService.completeTask('task-004', { version: task.version })
    const reset = await taskService.undoCompletion('task-004', {
      status: 'in_progress',
      submissionStatus: null,
      version: done.version,
    })
    expect(reset.submissionStatus).toBeNull()
    expect(reset.reviewRequired).toBe(false)
    expect(reset.reviewerIds).toEqual([])
  })

  it('AC-13 Then-3：withdrawCompletion 内部先复位 null 再覆写 withdrawn ⇒ 不抛错', async () => {
    const task = findTask('task-014')!
    const out = await taskService.withdrawCompletion('task-014', {
      version: task.version,
      actorId: LINA,
    })
    expect(out.submissionStatus).toBe('withdrawn')
  })
})

describe('③ AC-14：守卫是唯一入口（源码级计数）', () => {
  it('submissionStatus 赋值语句恰 7 处，且每处紧邻前文（前 200 字符）含守卫调用', () => {
    const assignments = [...TASK_SRC.matchAll(/submissionStatus = [^=]/g)]
    expect(assignments).toHaveLength(7)
    for (const match of assignments) {
      const window = TASK_SRC.slice(Math.max(0, match.index! - 200), match.index!)
      expect(window).toContain('assertSubmissionTransition(')
    }
  })

  it('反向：清理路径（applyClearedReviewState）不含守卫调用（复位豁免）', () => {
    const applyBody = TASK_SRC.slice(
      TASK_SRC.indexOf('function applyClearedReviewState'),
      TASK_SRC.indexOf('/** 我的待办'),
    )
    expect(applyBody).not.toContain('assertSubmissionTransition(')
  })
})

// ── ④ withdrawSubmission 守卫（M6-P0-05）──────────────────────────────────

describe('④ withdrawSubmission 守卫（AC-08 / AC-09）', () => {
  it('AC-08：正式任务不可经 withdrawSubmission 撤回（40302，零字段变更）', async () => {
    const task = findTask('task-014')!
    const v0 = task.version
    expect(isSubmissionRecord(task)).toBe(false)

    await expect(taskService.withdrawSubmission('task-014', v0, ME)).rejects.toMatchObject({
      code: ERR_SUBMISSION_FORBIDDEN,
    })

    const after = findTask('task-014')!
    expect(after.status).toBe('in_progress')
    expect(after.submissionStatus).toBe('pending')
    expect(after.version).toBe(v0)
  })

  it('AC-09：提报记录路径零回归 + 非本人 / 非 pending 仍 40302', async () => {
    const record = await taskService.submitItem({ kind: 'task', title: '守卫回归用例' }, LINA)
    expect(isSubmissionRecord(record)).toBe(true)
    expect(record.submissionStatus).toBe('pending')

    // 非本人 ⇒ 40302
    await expect(
      taskService.withdrawSubmission(record.id, record.version, WANGQIANG),
    ).rejects.toMatchObject({ code: ERR_SUBMISSION_FORBIDDEN })

    // 本人撤回成功
    const withdrawn = await taskService.withdrawSubmission(record.id, record.version, LINA)
    expect(withdrawn.submissionStatus).toBe('withdrawn')
    expect(withdrawn.status).toBe('cancelled')
    expect(withdrawn.version).toBe(record.version + 1)

    // 撤回后再撤（非 pending）⇒ 40302
    await expect(
      taskService.withdrawSubmission(record.id, withdrawn.version, LINA),
    ).rejects.toMatchObject({ code: ERR_SUBMISSION_FORBIDDEN })
  })
})

// ── AC-15：withdrawn → pending（M6-P1-01）─────────────────────────────────

describe('AC-15：withdrawn → pending（撤回后重新完成提报）', () => {
  it('撤回 ⇒ withdrawn；再次 completeTask（增量 7 M1：撤回清 reviewRequired ⇒ 直落 done，不再入队）', async () => {
    const task = findTask('task-014')!
    const withdrawn = await taskService.withdrawCompletionAndNotify('task-014', {
      version: task.version,
      actorId: LINA,
    })
    expect(withdrawn.submissionStatus).toBe('withdrawn')

    const redo = await taskService.completeTask('task-014', { version: withdrawn.version })
    // M1：撤回经 createClearedReviewState 清 reviewRequired ⇒ 再完成 `needsReview === false`
    expect(redo.status).toBe('done')
    expect(redo.submissionStatus).toBe('withdrawn')
    expect(redo.reviewRequired).toBe(false)

    const pendingIds = ids(await taskService.listPendingReview(ME))
    expect(pendingIds).not.toContain('task-014')
  })
})

// ── ② 口径锚点（AC-16 / AC-17，零行为变更）────────────────────────────────

describe('② 口径锚点（AC-16 / AC-17）', () => {
  it('AC-16 Then-1/2/3：三函数口径未变（今日到期 / 待我审核 / 交集为空）', async () => {
    const dueIds = ids(await taskService.listTodayDue(ME, SH)).sort()
    expect(dueIds).toEqual(['task-001', 'task-004', 'task-005', 'task-016', 'task-017'])
    expect(dueIds).not.toContain('task-014')
    expect(dueIds).not.toContain('task-015')

    const reviewIds = ids(await taskService.listPendingReview(ME))
    expect(reviewIds).toContain('task-014')
    expect(reviewIds).toContain('task-015')

    const dueSet = new Set(dueIds)
    expect(reviewIds.filter((id) => dueSet.has(id))).toEqual([])
  })

  it('AC-16 Then-4：task-014（dueAt 在 24h 窗内）仍在「临期预警」', async () => {
    findTask('task-014')!.dueAt = new Date(Date.now() + 2 * 3600 * 1000).toISOString()
    const approachingIds = ids(await taskService.listDeadlineApproaching(ME, SH))
    expect(approachingIds).toContain('task-014')
  })

  it('AC-16 Then-5：源码级 —— 两函数过滤条件逐条未变', () => {
    const todayBody = TASK_SRC.slice(
      TASK_SRC.indexOf('export async function listTodayDue'),
      TASK_SRC.indexOf('export async function listPendingReview'),
    )
    expect(todayBody).toContain("task.status !== 'done'")
    expect(todayBody).toContain("task.submissionStatus !== 'pending'")
    expect(todayBody).toContain('!isSubmissionRecord(task)')

    const approachingBody = TASK_SRC.slice(
      TASK_SRC.indexOf('export async function listDeadlineApproaching'),
      TASK_SRC.indexOf('export async function listTasksByProject'),
    )
    expect(approachingBody).toContain(
      "if (task.status === 'done' || task.status === 'cancelled' || task.status === 'pending_review') return false",
    )
    expect(approachingBody).toContain('if (isSubmissionRecord(task)) return false')
  })

  it('AC-17：listTodayDue 语义归因入注释（纯注释，零行为变更）', () => {
    const todayBody = TASK_SRC.slice(
      TASK_SRC.indexOf('export async function listTodayDue'),
      TASK_SRC.indexOf('export async function listPendingReview'),
    )
    // 归因注释：status !== 'done' 已排除全部 done ⇒ submissionStatus !== 'pending' 唯一作用 = 排除审核轮回态
    expect(todayBody).toContain('审核轮回态')
  })
})

// ── 🔴 K38：包装函数定义位置（硬约束）─────────────────────────────────────

describe('🔴 K38：withdrawCompletionAndNotify 定义在 reviewSubmission 之后', () => {
  it('包装函数定义位置 > reviewSubmission（否则落入受保护切片）', () => {
    const withdrawIdx = TASK_SRC.indexOf('export async function withdrawCompletion')
    const reviewIdx = TASK_SRC.indexOf('export async function reviewSubmission')
    const wrapperIdx = TASK_SRC.indexOf('export async function withdrawCompletionAndNotify')

    expect(withdrawIdx).toBeGreaterThan(-1)
    expect(reviewIdx).toBeGreaterThan(withdrawIdx)
    expect(wrapperIdx).toBeGreaterThan(reviewIdx)

    // 受保护切片（withdrawCompletion 函数体）不含包装函数体
    const withdrawBody = TASK_SRC.slice(withdrawIdx, reviewIdx)
    expect(withdrawBody).not.toContain('withdrawCompletionAndNotify')
    expect(withdrawBody).not.toContain('pushNotification')
    expect(withdrawBody).not.toContain('db.notifications')
  })

  it('withdrawCompletion 函数体零通知（K24 / INV-1 原样通过）', () => {
    const withdrawBody = TASK_SRC.slice(
      TASK_SRC.indexOf('export async function withdrawCompletion'),
      TASK_SRC.indexOf('export async function reviewSubmission'),
    )
    expect(withdrawBody.length).toBeGreaterThan(0)
    expect(withdrawBody).not.toContain('pushNotification')
    expect(withdrawBody).not.toContain('db.notifications')
  })
})
