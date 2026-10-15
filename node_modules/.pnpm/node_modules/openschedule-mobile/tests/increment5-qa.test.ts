/**
 * 职责：增量 5 QA 独立验证（严过关）——「提报 / 审核闭环补完」交叉验证 + 对抗性攻击。
 *
 * 定位：**只做独立复核与对抗性验证**，不改动任何既有套件的断言（含工程师新增的
 * `tests/increment5-closure.test.ts`）。全部用例写在本独立新文件内（K11 精神 / R6-10）。
 *
 * 相对工程师测试（`increment5-closure.test.ts`）的独立补强点：
 * 1. **K38 位置硬约束复刻**：独立重跑 2 处受保护切片的判定式（L1/L2），并验证包装函数
 *    定义位置在 `reviewSubmission` 之后；
 * 2. **撤回失败零副作用**三态（40302 主体不符 / 40901 陈旧版本 / 40401 不存在）；
 * 3. **接收人 = 撤回前快照**（2 位审核人 + 撤回后 reviewerIds 置空的双向证据）；
 * 4. **未读级去重的自然序列**（撤回 → 重新提报 → 再撤回）与 `readAt` 判定字段反证；
 * 5. **7 处守卫接入点逐条回归**（用与工程师不同的任务 id，扩大回归面）；
 * 6. **`from == null` 仅放行 `'pending'`** 的正反双向行为验证（走 `undoCompletion` 公开入口）；
 * 7. **守卫真拦截**：非法 `submissionStatus` 变化 ⇒ 40302（`approved → rejected`）；
 * 8. **④ 校验顺序**：404 → 40901 → 40302(新守卫) → 40302(主体) → 40302(pending) 逐条命中；
 * 9. **授权改动边界复核**（内容级）：确认除授权 3 处外，两文件其它断言一字未改、标题未改；
 * 10. **Feather glyphMap 实读校验**（`corner-up-left` 存在 / `undo` `reply` `ban` 不存在）。
 */
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DEMO_USER_IDS,
  allManagerIds,
  db,
  demoDayAt,
  findTask,
  pushNotificationOnce,
  resetDatabase,
} from '@/data'
import { ERR_OPTIMISTIC_LOCK, NOTIFICATION_EVENT_LABEL } from '@/types'
import { taskService } from '@/services'
import * as taskServiceDirect from '@/services/task.service'
import {
  ERR_SUBMISSION_FORBIDDEN,
  SUBMISSION_TRANSITIONS,
  canTransition,
  isSubmissionRecord,
  isWithdrawable,
} from '@/utils/submission'

const ME = DEMO_USER_IDS.me // user-001（张伟）：task-014 的 createdBy / 审核人（**非**提报人）
const MANAGER = DEMO_USER_IDS.manager // user-004（陈明）：第二个 manager / 审核人
const LINA = DEMO_USER_IDS.lina // user-002（李娜）：task-004 / task-014 的 assigneeId（提报人）
const WANGQIANG = DEMO_USER_IDS.wangqiang // user-003（王强）：task-005 / task-009 / task-015 的 assigneeId
const SH = 'Asia/Shanghai'

const TASK_SRC = readFileSync(resolve(__dirname, '../src/services/task.service.ts'), 'utf8')
const NOTIF_SCREEN_SRC = readFileSync(resolve(__dirname, '../src/screens/NotificationsScreen.tsx'), 'utf8')
const DOMAIN_SRC = readFileSync(resolve(__dirname, '../src/types/domain.ts'), 'utf8')
const SUB_FLOW_SRC = readFileSync(resolve(__dirname, './submission-flow.test.ts'), 'utf8')
const INC4_QA_SRC = readFileSync(resolve(__dirname, './increment4-qa.test.ts'), 'utf8')

/** id 升序（消除排序口径差异） */
function ids(tasks: { id: string }[]): string[] {
  return tasks.map((task) => task.id).sort()
}

function reviewWithdrawnOf(taskId: string) {
  return db.notifications.filter(
    (item) => item.type === 'review.withdrawn' && item.data?.taskId === taskId,
  )
}

beforeEach(() => {
  resetDatabase()
})

// ═══════════════════════════════════════════════════════════════════════════
// A. 🔴 K38 位置硬约束（源码切片）—— 独立复刻 2 处受保护断言
// ═══════════════════════════════════════════════════════════════════════════

describe('QA · K38 · 包装函数定义位置（源码切片对抗）', () => {
  it('定义顺序：withdrawCompletion < reviewSubmission < withdrawCompletionAndNotify', () => {
    const withdrawIdx = TASK_SRC.indexOf('export async function withdrawCompletion')
    const reviewIdx = TASK_SRC.indexOf('export async function reviewSubmission')
    const wrapperIdx = TASK_SRC.indexOf('export async function withdrawCompletionAndNotify')
    expect(withdrawIdx).toBeGreaterThan(-1)
    expect(reviewIdx).toBeGreaterThan(withdrawIdx)
    expect(wrapperIdx).toBeGreaterThan(reviewIdx)
  })

  it('L1/L2 复刻：[withdrawCompletion, reviewSubmission) 切片零通知、不含包装函数体', () => {
    const body = TASK_SRC.slice(
      TASK_SRC.indexOf('export async function withdrawCompletion'),
      TASK_SRC.indexOf('export async function reviewSubmission'),
    )
    expect(body.length).toBeGreaterThan(0)
    expect(body).not.toContain('pushNotification') // 亦覆盖 'pushNotificationOnce'（含子串）
    expect(body).not.toContain('pushNotificationOnce')
    expect(body).not.toContain('db.notifications')
    expect(body).not.toContain('withdrawCompletionAndNotify')
  })

  it('withdrawCompletion 引用唯一主体事实来源 / 唯一清理构造点，且永不写 cancelled', () => {
    const body = TASK_SRC.slice(
      TASK_SRC.indexOf('export async function withdrawCompletion'),
      TASK_SRC.indexOf('export async function reviewSubmission'),
    )
    expect(body).toContain('isWithdrawable(')
    expect(body).toContain('applyClearedReviewState(')
    expect(body).not.toContain("'cancelled'")
  })

  it('withdrawSubmission 内联主体判据与归档行未被移除（increment4-qa:598-605 仍成立）', () => {
    const body = TASK_SRC.slice(
      TASK_SRC.indexOf('export async function withdrawSubmission'),
      TASK_SRC.indexOf('export interface WithdrawCompletionInput'),
    )
    expect(body).toContain('task.createdBy !== actorId')
    expect(body).toContain("task.status = 'cancelled'")
  })

  it('包装函数经公开桶（@/services）可达（屏幕产品入口）', () => {
    expect(typeof taskService.withdrawCompletionAndNotify).toBe('function')
    expect(typeof taskServiceDirect.withdrawCompletionAndNotify).toBe('function')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// B. ① 撤回 + 通知链路（AC-01 / AC-02 / AC-03 / AC-05）
// ═══════════════════════════════════════════════════════════════════════════

describe('QA · ① 撤回 + 通知链路（AC-01 / AC-02 / AC-03 / AC-05）', () => {
  it('AC-01：撤回成功 ⇒ 每位审核人各 1 条 review.withdrawn（字段齐全）', async () => {
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
    expect(notif.body).toContain('无需审核')
    expect(updated.submissionStatus).toBe('withdrawn')
    expect(updated.status).toBe('in_progress')
    expect(updated.reviewerIds).toEqual([])
  })

  it('AC-02：接收人 = 撤回前的 reviewerIds（清理前快照，K28）', async () => {
    const task = findTask('task-015')!
    task.reviewerIds = [ME, MANAGER] // 人为扩为 2 位（构造非空值）
    const preReviewers = [...task.reviewerIds].sort()
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
    expect(added).toHaveLength(2)
    expect(receivers).toEqual(preReviewers)
    // 通知不依赖清理后的值：撤回后 reviewerIds 已被置空
    expect(findTask('task-015')!.reviewerIds).toEqual([])
  })

  it('AC-03a：主体不符 ⇒ 40302，零通知 / 零 audit / 零字段变更', async () => {
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

  it('AC-03b：陈旧 version ⇒ 40901，零通知', async () => {
    const before = findTask('task-004')!
    const done = await taskServiceDirect.completeTask('task-004', { version: before.version })
    const snapshot = JSON.stringify(db.notifications)

    await expect(
      taskService.withdrawCompletionAndNotify('task-004', {
        version: done.version - 1,
        actorId: LINA,
      }),
    ).rejects.toMatchObject({ code: ERR_OPTIMISTIC_LOCK })

    expect(JSON.stringify(db.notifications)).toBe(snapshot)
  })

  it('AC-03c：任务不存在 ⇒ 40401，零通知', async () => {
    const snapshot = JSON.stringify(db.notifications)
    await expect(
      taskService.withdrawCompletionAndNotify('task-999', { version: 1, actorId: ME }),
    ).rejects.toMatchObject({ code: 40401 })
    expect(JSON.stringify(db.notifications)).toBe(snapshot)
  })

  it('AC-05a（增量 7 M1 修正）：未读级去重（撤回 → 重设为需评审 → 重新提报 → 再撤回）', async () => {
    // 第 1 次撤回：task-014（reviewerIds=[me]）⇒ me 收到 1 条未读
    await taskService.withdrawCompletionAndNotify('task-014', {
      version: findTask('task-014')!.version,
      actorId: LINA,
    })
    expect(reviewWithdrawnOf('task-014')).toHaveLength(1)
    expect(reviewWithdrawnOf('task-014')[0].userId).toBe(ME)
    expect(reviewWithdrawnOf('task-014')[0].readAt).toBeNull()

    // M1：撤回经 createClearedReviewState 清 reviewRequired ⇒ 重新提报不再入队。
    // 为复现「重新提报」路径，显式恢复创建期标志（等价于「管理员创建任务时勾选需评审」）。
    findTask('task-014')!.reviewRequired = true
    const done = await taskServiceDirect.completeTask('task-014', {
      version: findTask('task-014')!.version,
    })
    expect(done.reviewerIds).toEqual(allManagerIds())

    // 第 2 次撤回：me 首条未读 ⇒ 去重跳过；manager 首次 ⇒ 新增
    await taskService.withdrawCompletionAndNotify('task-014', {
      version: done.version,
      actorId: LINA,
    })
    const after = reviewWithdrawnOf('task-014')
    expect(after).toHaveLength(2)
    expect(after.filter((item) => item.userId === ME)).toHaveLength(1) // 去重生效
    expect(after.filter((item) => item.userId === MANAGER)).toHaveLength(1)
  })

  it('AC-05b：未读判定字段 = readAt === null（已读 ⇒ 再派发成功）', async () => {
    await taskService.withdrawCompletionAndNotify('task-014', {
      version: findTask('task-014')!.version,
      actorId: LINA,
    })
    const first = reviewWithdrawnOf('task-014')[0]
    expect(first.readAt).toBeNull()

    // 同一三元组 + 未读 ⇒ 去重跳过
    expect(
      pushNotificationOnce({
        userId: ME,
        type: 'review.withdrawn',
        title: '提报已撤回',
        body: '重复',
        data: { taskId: 'task-014' },
      }),
    ).toBeNull()

    // 置为已读 ⇒ 再派发成功（说明未读判定确实按 readAt）
    first.readAt = demoDayAt(0, 9, 0)
    expect(
      pushNotificationOnce({
        userId: ME,
        type: 'review.withdrawn',
        title: '提报已撤回',
        body: '已读后再派发',
        data: { taskId: 'task-014' },
      }),
    ).not.toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// C. ③ 迁移表 + 唯一守卫（AC-10 ~ AC-14）
// ═══════════════════════════════════════════════════════════════════════════

describe('QA · ③ 迁移表（AC-10 / INV-6）', () => {
  it('AC-10 Then-1：表 = 实读反推的真实可写入集合', () => {
    expect(SUBMISSION_TRANSITIONS).toEqual({
      draft: ['pending', 'published'],
      pending: ['approved', 'rejected', 'withdrawn'],
      approved: ['pending'],
      rejected: ['draft', 'pending'],
      withdrawn: ['draft', 'pending'],
    })
  })

  it('AC-10 Then-2/3：修正后应为真 / 仍应为假', () => {
    expect(canTransition('approved', 'pending')).toBe(true)
    expect(canTransition('rejected', 'pending')).toBe(true)
    expect(canTransition('withdrawn', 'pending')).toBe(true)
    expect(canTransition('draft', 'approved')).toBe(false)
    expect(canTransition('pending', 'draft')).toBe(false)
    expect(canTransition('pending', 'published')).toBe(false)
    expect(canTransition('approved', 'rejected')).toBe(false)
    expect(canTransition('rejected', 'approved')).toBe(false)
    expect(canTransition('withdrawn', 'approved')).toBe(false)
  })

  it('INV-6：表中不含自环（to === from 由守卫放行，非表内容）', () => {
    for (const [from, targets] of Object.entries(SUBMISSION_TRANSITIONS)) {
      expect(targets).not.toContain(from)
    }
  })
})

describe('QA · ③ 守卫接入零回归（AC-11）—— 7 条链路逐条', () => {
  it('W1 completeTask：初始写入（task-006 in_progress，from = undefined）', async () => {
    const task = findTask('task-006')!
    expect(task.submissionStatus).toBeUndefined()
    const done = await taskServiceDirect.completeTask('task-006', { version: task.version })
    expect(done.status).toBe('pending_review')
    expect(done.submissionStatus).toBe('pending')
  })

  it('W2 undoCompletion：approved → pending（task-015 撤销审核通过）', async () => {
    const task = findTask('task-015')!
    const approved = await taskServiceDirect.reviewSubmission('task-015', 'approve', task.version)
    expect(approved.submissionStatus).toBe('approved')
    const undone = await taskServiceDirect.undoCompletion('task-015', {
      status: 'in_progress',
      submissionStatus: 'pending',
      version: approved.version,
    })
    expect(undone.submissionStatus).toBe('pending')
    expect(undone.reviewRequired).toBe(true) // 撤销审核通过不复位审核态（K3）
  })

  it('W4 landSubmissionRecord：manager 免审直落（pending → approved）', async () => {
    const record = await taskServiceDirect.submitItem({ kind: 'task', title: '免审直落' }, ME)
    expect(record.submissionStatus).toBe('approved')
    expect(record.status).toBe('cancelled')
  })

  it('W5 withdrawSubmission：提报记录 pending → withdrawn', async () => {
    const record = await taskServiceDirect.submitItem({ kind: 'task', title: 'W5' }, LINA)
    const withdrawn = await taskServiceDirect.withdrawSubmission(record.id, record.version, LINA)
    expect(withdrawn.submissionStatus).toBe('withdrawn')
    expect(withdrawn.status).toBe('cancelled')
  })

  it('W6 withdrawCompletion：清理前快照 from = pending（task-005）', async () => {
    const task = findTask('task-005')!
    const done = await taskServiceDirect.completeTask('task-005', { version: task.version })
    const withdrawn = await taskServiceDirect.withdrawCompletion('task-005', {
      version: done.version,
      actorId: WANGQIANG, // task-005.assigneeId
    })
    expect(withdrawn.submissionStatus).toBe('withdrawn')
    expect(withdrawn.status).toBe('in_progress')
  })

  it('W7 reviewSubmission approve：pending → approved（task-014）', async () => {
    const task = findTask('task-014')!
    const approved = await taskServiceDirect.reviewSubmission('task-014', 'approve', task.version)
    expect(approved.submissionStatus).toBe('approved')
    expect(approved.status).toBe('done')
  })

  it('W8 reviewSubmission reject：pending → rejected（task-015）', async () => {
    const task = findTask('task-015')!
    const rejected = await taskServiceDirect.reviewSubmission(
      'task-015',
      'reject',
      task.version,
      '说明不充分',
    )
    expect(rejected.submissionStatus).toBe('rejected')
  })
})

describe('QA · ③ 幂等 / 清理豁免 / 守卫强度（AC-12 / AC-13）', () => {
  it('AC-12：幂等重写放行（task-014 in_progress + pending ⇒ completeTask 写 pending）', async () => {
    const task = findTask('task-014')!
    const done = await taskServiceDirect.completeTask('task-014', { version: task.version })
    expect(done.status).toBe('pending_review')
    expect(done.submissionStatus).toBe('pending')
    expect(done.reviewerIds).toEqual(allManagerIds())
  })

  it('AC-13 Then-1：undoCompletion submissionStatus=null ⇒ 不抛错 + 六字段全清（复位豁免）', async () => {
    const task = findTask('task-004')!
    const done = await taskServiceDirect.completeTask('task-004', { version: task.version })
    const reset = await taskServiceDirect.undoCompletion('task-004', {
      status: 'in_progress',
      submissionStatus: null,
      version: done.version,
    })
    expect(reset.submissionStatus).toBeNull()
    expect(reset.reviewRequired).toBe(false)
    expect(reset.reviewerIds).toEqual([])
    expect(reset.reviewNote).toBeNull()
    expect(reset.reviewedBy).toBeNull()
    expect(reset.reviewedAt).toBeNull()
  })

  it('AC-13 Then-2：moveTask 离开 done（清理包路径）不抛错，六字段全清', async () => {
    const task = findTask('task-004')!
    const done = await taskServiceDirect.completeTask('task-004', { version: task.version })
    const moved = await taskServiceDirect.moveTask('task-004', {
      status: 'in_progress',
      version: done.version,
    })
    expect(moved.submissionStatus).toBeNull()
    expect(moved.reviewRequired).toBe(false)
    expect(moved.reviewerIds).toEqual([])
  })

  it('AC-13 Then-3：withdrawCompletion 内部先复位 null 再覆写 withdrawn ⇒ 不抛错', async () => {
    const out = await taskServiceDirect.withdrawCompletion('task-014', {
      version: findTask('task-014')!.version,
      actorId: LINA,
    })
    expect(out.submissionStatus).toBe('withdrawn')
  })

  it('from == null 仅放行 pending：to = pending 放行，to ≠ pending 抛 40302（走 undoCompletion 入口）', async () => {
    // task-007：done + submissionStatus undefined（from == null）
    const ok = await taskServiceDirect.undoCompletion('task-007', {
      status: 'in_progress',
      submissionStatus: 'pending',
      version: findTask('task-007')!.version,
    })
    expect(ok.submissionStatus).toBe('pending')

    resetDatabase()
    await expect(
      taskServiceDirect.undoCompletion('task-007', {
        status: 'in_progress',
        submissionStatus: 'approved',
        version: findTask('task-007')!.version,
      }),
    ).rejects.toMatchObject({ code: ERR_SUBMISSION_FORBIDDEN })
  })

  it('守卫真拦截：approved → rejected 非法变化 ⇒ 40302', async () => {
    const task = findTask('task-014')!
    const approved = await taskServiceDirect.reviewSubmission('task-014', 'approve', task.version)
    expect(approved.submissionStatus).toBe('approved')

    await expect(
      taskServiceDirect.undoCompletion('task-014', {
        status: 'in_progress',
        submissionStatus: 'rejected',
        version: approved.version,
      }),
    ).rejects.toMatchObject({ code: ERR_SUBMISSION_FORBIDDEN })
  })
})

describe('QA · ③ AC-14 / INV-7：守卫是唯一入口（源码级计数）', () => {
  it('submissionStatus 赋值语句恰 7 处，且每处前 200 字符窗口内含守卫调用', () => {
    const assignments = [...TASK_SRC.matchAll(/submissionStatus = [^=]/g)]
    expect(assignments).toHaveLength(7)
    for (const match of assignments) {
      const window = TASK_SRC.slice(Math.max(0, match.index! - 200), match.index!)
      expect(window).toContain('assertSubmissionTransition(')
    }
  })

  it('反向：清理路径（applyClearedReviewState）不含守卫调用（复位豁免，INV-8）', () => {
    const applyBody = TASK_SRC.slice(
      TASK_SRC.indexOf('function applyClearedReviewState'),
      TASK_SRC.indexOf('/** 我的待办'),
    )
    expect(applyBody.length).toBeGreaterThan(0)
    expect(applyBody).not.toContain('assertSubmissionTransition(')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// D. ④ withdrawSubmission 守卫（AC-08 / AC-09 + 顺序）
// ═══════════════════════════════════════════════════════════════════════════

describe('QA · ④ withdrawSubmission 守卫（AC-08 / AC-09 / 顺序）', () => {
  it('AC-08：正式任务（task-014 / task-015）不可经 withdrawSubmission 撤回 ⇒ 40302 零变化', async () => {
    for (const id of ['task-014', 'task-015']) {
      const task = findTask(id)!
      expect(isSubmissionRecord(task)).toBe(false)
      const v0 = task.version
      const before = { status: task.status, submissionStatus: task.submissionStatus }
      await expect(taskServiceDirect.withdrawSubmission(id, v0, ME)).rejects.toMatchObject({
        code: ERR_SUBMISSION_FORBIDDEN,
      })
      const after = findTask(id)!
      expect(after.status).toBe(before.status)
      expect(after.submissionStatus).toBe(before.submissionStatus)
      expect(after.version).toBe(v0)
    }
  })

  it('AC-09：提报记录路径零回归（本人成功 / 非本人 40302 / 非 pending 40302）', async () => {
    const record = await taskServiceDirect.submitItem({ kind: 'task', title: '守卫回归' }, LINA)
    expect(isSubmissionRecord(record)).toBe(true)
    expect(record.submissionStatus).toBe('pending')

    await expect(
      taskServiceDirect.withdrawSubmission(record.id, record.version, WANGQIANG),
    ).rejects.toMatchObject({ code: ERR_SUBMISSION_FORBIDDEN })

    const withdrawn = await taskServiceDirect.withdrawSubmission(record.id, record.version, LINA)
    expect(withdrawn.submissionStatus).toBe('withdrawn')
    expect(withdrawn.status).toBe('cancelled')
    expect(withdrawn.version).toBe(record.version + 1)

    await expect(
      taskServiceDirect.withdrawSubmission(record.id, withdrawn.version, LINA),
    ).rejects.toMatchObject({ code: ERR_SUBMISSION_FORBIDDEN })
  })

  it('④ 校验顺序：404 → 40901 → 40302(新守卫) → 40302(主体) → 40302(pending)', async () => {
    // 404
    await expect(taskServiceDirect.withdrawSubmission('task-999', 1, ME)).rejects.toMatchObject({
      code: 40401,
    })
    // 40901（先于新守卫）
    const t14 = findTask('task-014')!
    await expect(
      taskServiceDirect.withdrawSubmission('task-014', t14.version + 9, ME),
    ).rejects.toMatchObject({ code: ERR_OPTIMISTIC_LOCK })
    // 40302（新守卫，专属文案）
    await expect(
      taskServiceDirect.withdrawSubmission('task-014', t14.version, ME),
    ).rejects.toMatchObject({
      code: ERR_SUBMISSION_FORBIDDEN,
      message: '该入口仅用于撤回新事项提报',
    })
    // 40302（主体）
    const record = await taskServiceDirect.submitItem({ kind: 'task', title: '顺序-主体' }, LINA)
    await expect(
      taskServiceDirect.withdrawSubmission(record.id, record.version, WANGQIANG),
    ).rejects.toMatchObject({
      code: ERR_SUBMISSION_FORBIDDEN,
      message: '只能撤回本人的提报',
    })
    // 40302（pending 门禁）
    const withdrawn = await taskServiceDirect.withdrawSubmission(record.id, record.version, LINA)
    await expect(
      taskServiceDirect.withdrawSubmission(record.id, withdrawn.version, LINA),
    ).rejects.toMatchObject({
      code: ERR_SUBMISSION_FORBIDDEN,
      message: '仅待审核的提报可撤回',
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// E. ② 口径锚点（AC-16 / AC-17）
// ═══════════════════════════════════════════════════════════════════════════

describe('QA · ② 口径锚点（AC-16 / AC-17，零行为变更）', () => {
  it('AC-16 Then-1/2/3：今日到期精确 5 / 014·015 不在 due 而在 review / 交集为空', async () => {
    const due = ids(await taskServiceDirect.listTodayDue(ME, SH))
    expect(due).toEqual(['task-001', 'task-004', 'task-005', 'task-016', 'task-017'])
    expect(due).not.toContain('task-014')
    expect(due).not.toContain('task-015')

    const review = ids(await taskServiceDirect.listPendingReview(ME))
    expect(review).toContain('task-014')
    expect(review).toContain('task-015')

    const dueSet = new Set(due)
    expect(review.filter((id) => dueSet.has(id))).toEqual([])
  })

  it('AC-16 Then-4：task-014（dueAt 在 24h 窗内）仍在「临期预警」', async () => {
    findTask('task-014')!.dueAt = new Date(Date.now() + 2 * 3600 * 1000).toISOString()
    const approaching = ids(await taskServiceDirect.listDeadlineApproaching(ME, SH))
    expect(approaching).toContain('task-014')
  })

  it('AC-16 Then-5 / AC-17：两函数过滤条件逐条未变 + 语义归因注释在位', () => {
    const todayBody = TASK_SRC.slice(
      TASK_SRC.indexOf('export async function listTodayDue'),
      TASK_SRC.indexOf('export async function listPendingReview'),
    )
    expect(todayBody).toContain("task.status !== 'done'")
    expect(todayBody).toContain("task.submissionStatus !== 'pending'")
    expect(todayBody).toContain('!isSubmissionRecord(task)')
    expect(todayBody).toContain('审核轮回态') // AC-17 归因注释

    const approachingBody = TASK_SRC.slice(
      TASK_SRC.indexOf('export async function listDeadlineApproaching'),
      TASK_SRC.indexOf('export async function listTasksByProject'),
    )
    expect(approachingBody).toContain(
      "if (task.status === 'done' || task.status === 'cancelled' || task.status === 'pending_review') return false",
    )
    expect(approachingBody).toContain('if (isSubmissionRecord(task)) return false')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// F. 三处通知映射同步（AC-06 / AC-07）+ Feather glyph 实读
// ═══════════════════════════════════════════════════════════════════════════

describe('QA · 三处通知映射同步（AC-06 / AC-07）', () => {
  it('AC-06 Then-1：NOTIFICATION_EVENT_LABEL 含 review.withdrawn → 撤回提醒', () => {
    expect(NOTIFICATION_EVENT_LABEL['review.withdrawn']).toBe('撤回提醒')
  })

  it('AC-06 Then-2：NOTIFICATION_ICON 含 corner-up-left', () => {
    expect(NOTIF_SCREEN_SRC).toContain("'review.withdrawn': 'corner-up-left'")
  })

  it('AC-06 实读校验：corner-up-left ∈ Feather.glyphMap（且 undo/reply/ban 不存在）', () => {
    const glyphPath = resolve(
      __dirname,
      '../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Feather.json',
    )
    const glyphs = JSON.parse(readFileSync(glyphPath, 'utf8')) as Record<string, number>
    expect(Object.keys(glyphs).length).toBeGreaterThan(250)
    expect('corner-up-left' in glyphs).toBe(true)
    expect('undo' in glyphs).toBe(false)
    expect('reply' in glyphs).toBe(false)
    expect('ban' in glyphs).toBe(false)
  })

  it('AC-07：domain.ts 注释为单行完整清单（保留既有子串，K32/K36）', () => {
    const commentLine = DOMAIN_SRC.split('\n').find((line) =>
      line.includes('task.assigned / mention / deadline_approaching'),
    )
    expect(commentLine).toBeDefined()
    expect(commentLine).toContain('review.pending')
    expect(commentLine).toContain('review.withdrawn')
    const trimmed = commentLine!.trim()
    expect(trimmed.startsWith('/**')).toBe(true)
    expect(trimmed.endsWith('*/')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// G. INV 逐条（INV-1 / 3 / 4 / 5 / 9 / 11 / 12）
// ═══════════════════════════════════════════════════════════════════════════

describe('QA · INV 逐条', () => {
  it('INV-1：withdrawCompletion 函数体零通知（行为级逐字节相等）', async () => {
    const task = findTask('task-014')!
    const snapshot = JSON.stringify(db.notifications)
    await taskServiceDirect.withdrawCompletion('task-014', { version: task.version, actorId: LINA })
    expect(JSON.stringify(db.notifications)).toBe(snapshot)
  })

  it('INV-3：撤回失败 ⇒ 零通知 + 零 audit + 零字段变更', async () => {
    const task = findTask('task-014')!
    const v0 = task.version
    const snapshot = JSON.stringify(db.notifications)
    const auditLen = db.auditFeed.length
    await expect(
      taskServiceDirect.withdrawCompletion('task-014', { version: v0, actorId: ME }),
    ).rejects.toMatchObject({ code: ERR_SUBMISSION_FORBIDDEN })
    expect(JSON.stringify(db.notifications)).toBe(snapshot)
    expect(db.auditFeed.length).toBe(auditLen)
    expect(findTask('task-014')!.version).toBe(v0)
  })

  it('INV-4：submissionStatus === pending ⇒ reviewRequired 且 reviewerIds 非空', () => {
    const pending = db.tasks.filter((task) => task.submissionStatus === 'pending')
    expect(pending.length).toBeGreaterThan(0)
    for (const task of pending) {
      expect(task.reviewRequired).toBe(true)
      expect((task.reviewerIds ?? []).length).toBeGreaterThan(0)
    }
  })

  it('INV-5：completedAt != null ⟺ status ∈ {done, pending_review}（全量遍历，增量 7 放宽）', () => {
    const violations = db.tasks
      .filter(
        (task) =>
          (task.completedAt != null) !== (task.status === 'done' || task.status === 'pending_review'),
      )
      .map((task) => task.id)
    expect(violations).toEqual([])
  })

  it('INV-9：去重三元组（userId/type/data.taskId）+ 未读判定 readAt === null', () => {
    const base = { userId: ME, type: 'review.withdrawn', title: 'x', data: { taskId: 'task-014' } }
    expect(pushNotificationOnce(base)).not.toBeNull()
    expect(pushNotificationOnce({ ...base })).toBeNull() // 完全相同 ⇒ 去重
    expect(pushNotificationOnce({ ...base, userId: MANAGER })).not.toBeNull()
    expect(pushNotificationOnce({ ...base, type: 'review.pending' })).not.toBeNull()
    expect(pushNotificationOnce({ ...base, data: { taskId: 'task-015' } })).not.toBeNull()
  })

  it('INV-11：提报记录不进正式列表，仅进「待我审核」', async () => {
    const record = await taskServiceDirect.submitItem(
      { kind: 'task', title: 'INV-11 守卫', projectId: 'project-002', dueAt: demoDayAt(0, 18, 0) },
      LINA,
    )
    const live = findTask(record.id)!
    live.assigneeId = ME
    live.startAt = demoDayAt(0, 11, 0)
    live.endAt = demoDayAt(0, 12, 0)

    expect(ids(await taskServiceDirect.listTodayDue(ME, SH))).not.toContain(record.id)
    expect(ids(await taskServiceDirect.listDeadlineApproaching(ME, SH))).not.toContain(record.id)
    expect(ids(await taskServiceDirect.listMyTodos(ME))).not.toContain(record.id)
    expect(ids(await taskServiceDirect.listScheduledTasks(SH))).not.toContain(record.id)
    expect(ids(await taskServiceDirect.listPendingReview(ME))).toContain(record.id)
  })

  it('INV-12：withdrawCompletion 永不写 cancelled；withdrawSubmission 必写 cancelled', async () => {
    const before = findTask('task-014')!
    const w = await taskServiceDirect.withdrawCompletion('task-014', {
      version: before.version,
      actorId: LINA,
    })
    expect(w.status).not.toBe('cancelled')
    expect(w.submissionStatus).toBe('withdrawn')

    const record = await taskServiceDirect.submitItem({ kind: 'task', title: 'INV-12' }, LINA)
    const s = await taskServiceDirect.withdrawSubmission(record.id, record.version, LINA)
    expect(s.status).toBe('cancelled')
    expect(s.submissionStatus).toBe('withdrawn')
  })

  it('INV-2 补充：isWithdrawable 分叉主体（completion = assigneeId，task = createdBy）', () => {
    const t14 = findTask('task-014')!
    expect(isWithdrawable(t14, LINA)).toBe(true)
    expect(isWithdrawable(t14, ME)).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// H. 授权改动边界复核（内容级）—— 除 3 处授权 expect 外一字未改
// ═══════════════════════════════════════════════════════════════════════════

describe('QA · 授权改动边界复核（内容级）', () => {
  it('submission-flow.test.ts：:76 已改 true，7 条合法 / 6 条非法断言与标题未变', () => {
    // 授权处（唯一）
    expect(SUB_FLOW_SRC).toContain("expect(canTransition('approved', 'pending')).toBe(true)")
    expect(SUB_FLOW_SRC).not.toContain("expect(canTransition('approved', 'pending')).toBe(false)")

    // :63-69 七条合法迁移仍为 true
    const legal = [
      ['draft', 'pending'],
      ['draft', 'published'],
      ['pending', 'approved'],
      ['pending', 'rejected'],
      ['pending', 'withdrawn'],
      ['rejected', 'draft'],
      ['withdrawn', 'draft'],
    ] as const
    for (const [from, to] of legal) {
      expect(SUB_FLOW_SRC).toContain(`expect(canTransition('${from}', '${to}')).toBe(true)`)
    }

    // :73/:74/:75/:77/:78/:79 六条非法迁移仍为 false
    const illegal = [
      ['draft', 'approved'],
      ['pending', 'draft'],
      ['pending', 'published'],
      ['approved', 'rejected'],
      ['rejected', 'approved'],
      ['withdrawn', 'approved'],
    ] as const
    for (const [from, to] of illegal) {
      expect(SUB_FLOW_SRC).toContain(`expect(canTransition('${from}', '${to}')).toBe(false)`)
    }

    // 标题未改
    expect(SUB_FLOW_SRC).toContain("describe('SUBMISSION_TRANSITIONS —— 全组合合法 / 非法'")
    expect(SUB_FLOW_SRC).toContain("it('合法迁移'")
    expect(SUB_FLOW_SRC).toContain("it('非法迁移'")
  })

  it('increment4-qa.test.ts：:512-518 表 3 值 + :520 已改，:519 与标题未变', () => {
    expect(INC4_QA_SRC).toContain("approved: ['pending'],")
    expect(INC4_QA_SRC).toContain("rejected: ['draft', 'pending'],")
    expect(INC4_QA_SRC).toContain("withdrawn: ['draft', 'pending'],")
    expect(INC4_QA_SRC).toContain("expect(canTransition('pending', 'withdrawn')).toBe(true)") // :519 未变
    expect(INC4_QA_SRC).toContain(
      "expect(canTransition('approved', 'pending')).toBe(true) // 受保护断言同向",
    )
    expect(INC4_QA_SRC).not.toContain("expect(canTransition('approved', 'pending')).toBe(false)")
    // 标题未改（主理人裁定不改标题）
    expect(INC4_QA_SRC).toContain("it('INV-8：SUBMISSION_TRANSITIONS 表内容未改")
  })

  it('增量 5 只授权改 3 条 expect：全仓仅 3 处 canTransition(approved,pending) 且均为 true', () => {
    const occurrences = [
      ...SUB_FLOW_SRC.matchAll(/canTransition\('approved', 'pending'\)\)\.toBe\((\w+)\)/g),
    ]
    expect(occurrences).toHaveLength(1)
    expect(occurrences[0][1]).toBe('true')

    const occurrences4 = [
      ...INC4_QA_SRC.matchAll(/canTransition\('approved', 'pending'\)\)\.toBe\((\w+)\)/g),
    ]
    expect(occurrences4).toHaveLength(1)
    expect(occurrences4[0][1]).toBe('true')
  })
})
