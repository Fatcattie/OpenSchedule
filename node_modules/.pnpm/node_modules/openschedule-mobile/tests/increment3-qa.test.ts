/**
 * 职责：增量 3 QA 独立验证补充测试（严过关）。
 *
 * 定位：**只做交叉验证与盲点补强**，不改动任何既有套件的断言（含
 * `tests/increment3-dedup-notify.test.ts` 与其余 28 个既有套件）。
 *
 * 相对工程师测试文件（`increment3-dedup-notify.test.ts`）的独立补强点：
 * 1. 独立复算「三分组 id 清单 + 并集基数」（AC-02 / AC-10 的原始推导证据）；
 * 2. 条件①（`status !== 'done'`）的**前后对照**验证（先证明任务本会进「今日到期」，
 *    再仅改 `status='done'` 观察其消失），排除「整表异常导致误判通过」；
 * 3. **「未读」判定字段是 `readAt === null` 而非 `status === 'sent'`** 的双向反证
 *    （构造 `status='sent' + readAt≠null` 与 `status='read' + readAt=null` 两个反例）；
 * 4. **AC-05 接收人来源 = `task.reviewerIds`（而非二次 `allManagerIds()`）** 的
 *    spy 级反证（令两次 `allManagerIds()` 返回值不同，观察实际接收人）；
 * 5. 偏差-1 前提的**行为级**复核：`completeTask('task-001')` 实际抛 40902；
 * 6. K15 有意差异的**确定性**验证（把待审任务的 `dueAt` 锚定到当日 23:59，消除时刻漂移）；
 * 7. `undoCompletion` 零通知操作的**行为级**验证（而非仅源码文本断言）；
 * 8. 边界与异常：40901 / 40902 / 42202 未被本次改动破坏。
 */
/// <reference types="node" />
import {
  DEMO_USER_IDS,
  allManagerIds,
  db,
  demoDayAt,
  findTask,
  pushNotification,
  pushNotificationOnce,
  resetDatabase,
} from '@/data'
import * as dataModule from '@/data'
import { ERR_ILLEGAL_TRANSITION, ERR_OPTIMISTIC_LOCK, type NotificationItem } from '@/types'
import * as taskService from '@/services/task.service'
import * as focusService from '@/services/focus.service'
import { ERR_SUBMISSION_INVALID } from '@/utils/submission'
import { toDateKey } from '@/utils/date'
import { countVisibleFocusTasks } from '@/utils/focus'

const ME = DEMO_USER_IDS.me
const SH = 'Asia/Shanghai'
/** 偏差-1 复核：`task-004` 是 `in_progress` + `dueAt` 为今天，可合法迁往 done */
const DUE_TASK_ID = 'task-004'

function pendingNotifsOfTask(taskId: string): NotificationItem[] {
  return db.notifications.filter((n) => n.type === 'review.pending' && n.data?.taskId === taskId)
}

function ids(tasks: { id: string }[]): string[] {
  return tasks.map((t) => t.id).sort()
}

beforeEach(() => {
  resetDatabase()
})

// ── ① 独立复算：三组 id 清单 + 并集基数（AC-01 / AC-02 / AC-10） ──────────────

describe('QA · 独立复算三分组与并集（AC-02 / AC-10 原始推导）', () => {
  it('种子态：三组 id 清单与并集基数 = 10', async () => {
    // 时刻鲁棒（QA 自修 · 照本文件 K15 用例 `:305-316` 与姊妹文件
    // `increment3-dedup-notify.test.ts` 的既有姿势：**锚定 dueAt 消除运行时刻漂移**，语义不变）：
    // 「朴素相加严格大于并集」的去重证明**依赖**「临期预警 ∩ 待我审核」的重叠（= task-014 / task-015）。
    // 二者种子 dueAt 为「当日 17:00 / 19:00」，当运行时刻偏晚（如深夜 23:00 之后）时，
    // 它们会漂出 `listDeadlineApproaching` 的 `[now−1h, now+24h]` 滑动窗口 ⇒ 重叠消失 ⇒ naive === union。
    // 把二者锚定到「当日 23:59」⇒ 与 now 的时差恒 ∈ (0, 24h] ⇒ **确定性地**落在窗口内，
    // 使去重语义（naive > union）恒定成立（不改动本用例其它任何断言的语义）。
    findTask('task-014')!.dueAt = demoDayAt(0, 23, 59)
    findTask('task-015')!.dueAt = demoDayAt(0, 23, 59)

    const focus = await focusService.getTodayFocus(ME, SH)
    const due = ids(focus.dueToday)
    const review = ids(focus.pendingReview)
    const approaching = ids(focus.approaching)
    const union = [...new Set([...due, ...review, ...approaching])].sort()
    const naive = due.length + review.length + approaching.length

    // eslint-disable-next-line no-console
    console.log('[QA] dueToday      =', JSON.stringify(due))
    // eslint-disable-next-line no-console
    console.log('[QA] pendingReview =', JSON.stringify(review))
    // eslint-disable-next-line no-console
    console.log('[QA] approaching   =', JSON.stringify(approaching))
    // eslint-disable-next-line no-console
    console.log('[QA] union         =', union.length, JSON.stringify(union))
    // eslint-disable-next-line no-console
    console.log('[QA] naive sum     =', naive)

    // 「今日到期」精确 5 条（AC-01）
    expect(due).toEqual(['task-001', 'task-004', 'task-005', 'task-016', 'task-017'])
    // 消失清单恰为 task-014 / task-015
    expect(due).not.toContain('task-014')
    expect(due).not.toContain('task-015')
    // 「待我审核」4 条（既有口径，本次未改）
    expect(review).toEqual(['task-014', 'task-015', 'task-019', 'task-020'])
    // 并集基数：稳定部分 9 条 + 「临期预警」窗口内的 task-018（见下一条用例的时间相关性实证）
    const base = [
      'task-001',
      'task-004',
      'task-005',
      'task-014',
      'task-015',
      'task-016',
      'task-017',
      'task-019',
      'task-020',
    ]
    const expected = approaching.includes('task-018') ? [...base, 'task-018'].sort() : base
    expect(union).toEqual(expected)
    expect(countVisibleFocusTasks(focus, { includeReview: true })).toBe(expected.length)
    // 逐任务对并集的贡献恒为 1（INV-7 / MUT-4）
    expect(union.length).toBe(new Set(union).size)
    // 朴素相加严格大于并集（证明去重确实生效）
    expect(naive).toBeGreaterThan(union.length)
  })

  it('⚠️ 时间相关性实证：把系统时间拨到「当日 08:00」⇒ 并集为 9（task-018 漂出 24h 窗口）', async () => {
    // 目的：证明 AC-02 的「10」是**当日 12:00 之后**的取值，而非恒真值。
    // 依据：task-018 的 dueAt = demoDayAt(1, 12, 0)（次日 12:00），
    //       而 listDeadlineApproaching 的窗口 = [now − 1h, now + 24h]（task.service.ts:208-215）
    //       ⇒ 仅当 now ≥ 当日 12:00 时它才落在窗口内。
    jest.useFakeTimers({ doNotFake: ['setTimeout', 'setInterval', 'setImmediate', 'nextTick', 'queueMicrotask'] })
    jest.setSystemTime(new Date(demoDayAt(0, 8, 0))) // 当日 08:00（Asia/Shanghai）
    try {
      const focus = await focusService.getTodayFocus(ME, SH)
      const union = [...new Set([...ids(focus.dueToday), ...ids(focus.pendingReview), ...ids(focus.approaching)])].sort()
      // eslint-disable-next-line no-console
      console.log('[QA] @08:00 approaching =', JSON.stringify(ids(focus.approaching)), 'union =', union.length)
      expect(ids(focus.approaching)).not.toContain('task-018')
      expect(union).toHaveLength(9)
      // 「今日到期」不受时刻影响（AC-01 恒定成立）
      expect(ids(focus.dueToday)).toEqual(['task-001', 'task-004', 'task-005', 'task-016', 'task-017'])
    } finally {
      jest.useRealTimers()
    }
  })
})

// ── ② 条件① 的独立验证（前后对照，排除整表异常） ─────────────────────────────

describe('QA · 条件①（status !== done）独立验证', () => {
  it('done + dueAt 今天 + submissionStatus 非 pending ⇒ 被精确排除', async () => {
    const task = findTask('task-016')!
    // 前置：证明该任务「本来」满足「今日到期」的其余全部条件
    expect(task.dueAt).not.toBeNull()
    expect(toDateKey(task.dueAt!, SH)).toBe(toDateKey(new Date().toISOString(), SH))
    expect(task.status).not.toBe('cancelled')
    expect(task.submissionStatus ?? null).not.toBe('pending')
    expect(task.source === 'submission' && task.submissionKind != null).toBe(false)

    const before = ids(await taskService.listTodayDue(ME, SH))
    expect(before).toContain('task-016')

    // 唯一变化：status → done（submissionStatus 保持非 pending）
    task.status = 'done'

    const after = ids(await taskService.listTodayDue(ME, SH))
    expect(after).not.toContain('task-016')
    // 精确命中：只少这一条，其余任务不受影响（排除「整表异常导致误判」）
    expect(after).toEqual(before.filter((id) => id !== 'task-016'))
    expect(after).toHaveLength(before.length - 1)
  })

  it('INV-8：done 任务（task-007 / task-008）不在「今日到期」', async () => {
    expect(findTask('task-007')!.status).toBe('done')
    expect(findTask('task-008')!.status).toBe('done')
    const dueIds = ids(await taskService.listTodayDue(ME, SH))
    expect(dueIds).not.toContain('task-007')
    expect(dueIds).not.toContain('task-008')
  })
})

// ── ③ 偏差-1 行为级复核（task-001 前提不可行） ────────────────────────────────

describe('QA · 偏差-1 复核：completeTask(task-001) 的物理可行性', () => {
  it('task-001 种子状态为 todo，completeTask 抛 40902（todo → done 非法迁移）', async () => {
    const task = findTask('task-001')!
    expect(task.status).toBe('todo')
    await expect(
      taskService.completeTask('task-001', { version: task.version }),
    ).rejects.toMatchObject({ code: ERR_ILLEGAL_TRANSITION })
    // 失败后任务未被改写（无副作用）
    expect(findTask('task-001')!.status).toBe('todo')
    expect(findTask('task-001')!.submissionStatus ?? null).not.toBe('pending')
  })

  it('task-004（in_progress）可合法完成，AC-04 语义在替代任务上完整成立', async () => {
    const task = findTask(DUE_TASK_ID)!
    expect(task.status).toBe('in_progress')
    expect(toDateKey(task.dueAt!, SH)).toBe(toDateKey(new Date().toISOString(), SH))

    const done = await taskService.completeTask(DUE_TASK_ID, { version: task.version })
    expect(done.status).toBe('pending_review')
    expect(done.submissionStatus).toBe('pending')

    const dueIds = ids(await taskService.listTodayDue(ME, SH))
    const reviewIds = ids(await taskService.listPendingReview(ME))
    expect(dueIds).not.toContain(DUE_TASK_ID) // 离开「今日到期」
    expect(reviewIds).toContain(DUE_TASK_ID) // 进入「待我审核」
  })
})

// ── ④ 「未读」判定字段 = readAt === null（双向反证） ──────────────────────────

describe('QA · 去重键与「未读」判定字段的反证', () => {
  it('反证 A：status=sent 但 readAt 非 null ⇒ 不命中去重（说明未按 status 判未读）', () => {
    const seeded = pushNotification({
      userId: ME,
      type: 'review.pending',
      title: '待你审核',
      data: { taskId: 'task-001' },
    })
    seeded.status = 'sent' // 故意保留「已发送」这一易被误用的信号
    seeded.readAt = demoDayAt(0, 9, 0) // 但实际已读

    const before = db.notifications.length
    const created = pushNotificationOnce({
      userId: ME,
      type: 'review.pending',
      title: '待你审核',
      data: { taskId: 'task-001' },
    })
    expect(created).not.toBeNull()
    expect(db.notifications.length).toBe(before + 1)
  })

  it('反证 B：status=read 但 readAt === null ⇒ 命中去重（说明确实按 readAt 判未读）', () => {
    const seeded = pushNotification({
      userId: ME,
      type: 'review.pending',
      title: '待你审核',
      data: { taskId: 'task-002' },
    })
    seeded.status = 'read' // 故意置为「已读」这一易被误用的信号
    seeded.readAt = null // 但实际未读

    const before = db.notifications.length
    const created = pushNotificationOnce({
      userId: ME,
      type: 'review.pending',
      title: '待你审核',
      data: { taskId: 'task-002' },
    })
    expect(created).toBeNull()
    expect(db.notifications.length).toBe(before)
  })

  it('三元组逐维区分：userId / type / data.taskId 任一不同即各自写入', () => {
    const base = { userId: ME, type: 'review.pending', title: '待你审核', data: { taskId: 'task-003' } }
    expect(pushNotificationOnce(base)).not.toBeNull()
    expect(pushNotificationOnce({ ...base })).toBeNull() // 完全相同 ⇒ 去重
    expect(pushNotificationOnce({ ...base, userId: 'user-004' })).not.toBeNull()
    expect(pushNotificationOnce({ ...base, type: 'review.result' })).not.toBeNull()
    expect(pushNotificationOnce({ ...base, data: { taskId: 'task-005' } })).not.toBeNull()
  })

  it('data.taskId 缺省 ⇒ 退化为无条件写入', () => {
    const before = db.notifications.length
    expect(pushNotificationOnce({ userId: ME, type: 'review.pending', title: 'x', data: null })).not.toBeNull()
    expect(pushNotificationOnce({ userId: ME, type: 'review.pending', title: 'x', data: null })).not.toBeNull()
    expect(db.notifications.length).toBe(before + 2)
  })

  it('去重命中不消耗 nextId 序号（id 序列连续）', () => {
    const first = pushNotificationOnce({
      userId: ME,
      type: 'review.pending',
      title: '待你审核',
      data: { taskId: 'task-006' },
    })!
    expect(pushNotificationOnce({ userId: ME, type: 'review.pending', title: '待你审核', data: { taskId: 'task-006' } })).toBeNull()
    expect(pushNotificationOnce({ userId: ME, type: 'review.pending', title: '待你审核', data: { taskId: 'task-006' } })).toBeNull()
    const next = pushNotificationOnce({
      userId: ME,
      type: 'review.pending',
      title: '待你审核',
      data: { taskId: 'task-007' },
    })!
    expect(Number(next.id.split('-')[1])).toBe(Number(first.id.split('-')[1]) + 1)
  })
})

// ── ⑤ AC-05：接收人来源 = task.reviewerIds（非二次 allManagerIds） ────────────

describe('QA · AC-05 接收人来源反证（spy 令两次 allManagerIds 返回值不同）', () => {
  it('通知接收人取自 task.reviewerIds，而非二次调用 allManagerIds()', async () => {
    const spy = jest.spyOn(dataModule, 'allManagerIds')
    spy.mockReturnValueOnce([ME]) // 第 1 次调用：写入 task.reviewerIds
    spy.mockReturnValue(['user-004']) // 任何后续调用返回不同值（若被二次调用即暴露）
    try {
      const live = findTask(DUE_TASK_ID)!
      const done = await taskService.completeTask(DUE_TASK_ID, { version: live.version })

      expect(done.reviewerIds).toEqual([ME])
      const recipients = [...new Set(pendingNotifsOfTask(DUE_TASK_ID).map((n) => n.userId))].sort()
      expect(recipients).toEqual([ME])
      expect(recipients).not.toContain('user-004')
      expect(pendingNotifsOfTask(DUE_TASK_ID)).toHaveLength(1)
    } finally {
      spy.mockRestore()
    }
  })

  it('正常路径：通知 userId 集合 === task.reviewerIds === allManagerIds()', async () => {
    const live = findTask(DUE_TASK_ID)!
    const done = await taskService.completeTask(DUE_TASK_ID, { version: live.version })
    const created = pendingNotifsOfTask(DUE_TASK_ID)
    expect(created).toHaveLength(allManagerIds().length)
    expect(new Set(created.map((n) => n.userId))).toEqual(new Set(done.reviewerIds ?? []))
    expect(new Set(created.map((n) => n.userId))).toEqual(new Set(allManagerIds()))
  })
})

// ── ⑥ K15 有意差异（确定性验证，消除时刻漂移） ───────────────────────────────

describe('QA · K15 有意口径差异（listDeadlineApproaching 不排除 pending）', () => {
  it('待审中任务（task-014）离开「今日到期」但仍在「临期预警」', async () => {
    const task = findTask('task-014')!
    expect(task.submissionStatus).toBe('pending')
    // 锚定到当日 23:59 ⇒ 恒落在 24h 窗口内（消除运行时刻漂移）
    task.dueAt = demoDayAt(0, 23, 59)

    const dueIds = ids(await taskService.listTodayDue(ME, SH))
    const approachingIds = ids(await taskService.listDeadlineApproaching(ME, SH))
    expect(dueIds).not.toContain('task-014')
    expect(approachingIds).toContain('task-014')
  })

  it('listDeadlineApproaching 对 done 的排除未被破坏（task-007 为 done）', async () => {
    const task = findTask('task-007')!
    task.dueAt = demoDayAt(0, 23, 59)
    expect(task.status).toBe('done')
    const approachingIds = ids(await taskService.listDeadlineApproaching(ME, SH))
    expect(approachingIds).not.toContain('task-007')
  })
})

// ── ⑦ undoCompletion 零通知操作（行为级） ────────────────────────────────────

describe('QA · undoCompletion 不触碰通知（Q4-3 / §3.6 行为级验证）', () => {
  it('撤销「审核通过」前后 db.notifications 长度与内容均不变', async () => {
    const before = findTask('task-014')!
    const approved = await taskService.reviewSubmission('task-014', 'approve', before.version)
    const snapshot = JSON.stringify(db.notifications)

    await taskService.undoCompletion('task-014', {
      status: 'in_progress',
      submissionStatus: 'pending',
      version: approved.version,
    })

    expect(JSON.stringify(db.notifications)).toBe(snapshot)
  })

  it('撤销「完成」前后 db.notifications 长度不变', async () => {
    const live = findTask(DUE_TASK_ID)!
    const done = await taskService.completeTask(DUE_TASK_ID, { version: live.version })
    const lenAfterComplete = db.notifications.length

    await taskService.undoCompletion(DUE_TASK_ID, {
      status: 'in_progress',
      submissionStatus: null,
      version: done.version,
    })

    expect(db.notifications.length).toBe(lenAfterComplete)
  })
})

// ── ⑧ 边界与异常（未被本次改动破坏） ─────────────────────────────────────────

describe('QA · 边界与异常码回归', () => {
  it('陈旧 version → 40901（completeTask）', async () => {
    const live = findTask(DUE_TASK_ID)!
    await expect(
      taskService.completeTask(DUE_TASK_ID, { version: live.version + 5 }),
    ).rejects.toMatchObject({ code: ERR_OPTIMISTIC_LOCK })
  })

  it('非法目标状态 → 40902（undoCompletion 到 blocked）', async () => {
    const task = findTask('task-007')!
    await expect(
      taskService.undoCompletion('task-007', { status: 'blocked', version: task.version }),
    ).rejects.toMatchObject({ code: ERR_ILLEGAL_TRANSITION })
  })

  it('驳回原因 < 4 字 → 42202，且不产生任何通知', async () => {
    const before = findTask('task-014')!
    const lenBefore = db.notifications.length
    await expect(
      taskService.reviewSubmission('task-014', 'reject', before.version, '短'),
    ).rejects.toMatchObject({ code: ERR_SUBMISSION_INVALID })
    expect(db.notifications.length).toBe(lenBefore)
  })

  it('INV-9：反复「完成 → 撤销 → 完成」3 轮后，每位审核人未读 review.pending ≤ 1', async () => {
    let version = findTask(DUE_TASK_ID)!.version
    for (let round = 0; round < 3; round += 1) {
      const done = await taskService.completeTask(DUE_TASK_ID, { version })
      const undone = await taskService.undoCompletion(DUE_TASK_ID, {
        status: 'in_progress',
        submissionStatus: null,
        version: done.version,
      })
      version = undone.version
    }
    await taskService.completeTask(DUE_TASK_ID, { version })

    for (const reviewerId of allManagerIds()) {
      const unread = pendingNotifsOfTask(DUE_TASK_ID).filter(
        (n) => n.userId === reviewerId && n.readAt === null,
      )
      expect(unread.length).toBeLessThanOrEqual(1)
    }
    expect(pendingNotifsOfTask(DUE_TASK_ID)).toHaveLength(allManagerIds().length)
  })

  it('AC-12（增量 7 修正）：操作人本人也收到通知，未读数 4 → 6（含评审子任务承接人通知 +1）', async () => {
    expect(await focusService.getUnreadCount(ME)).toBe(4)
    const live = findTask(DUE_TASK_ID)!
    await taskService.completeTask(DUE_TASK_ID, { version: live.version })
    expect(await focusService.getUnreadCount(ME)).toBe(6)
  })
})
