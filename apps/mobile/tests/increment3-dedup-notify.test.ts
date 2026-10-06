/**
 * 职责：增量 3 独立测试文件 —— ① 双计去重（列表层 `listTodayDue` + 汇总层 `countVisibleFocusTasks`）；
 * ② 「待你审核」站内通知（`completeTask` 派发 + `pushNotificationOnce` 未读级去重）。
 *
 * 覆盖：AC-01 ~ AC-08 / AC-12 与 INV-5 ~ INV-9（PRD-mobile-increment-3 §6）。
 * 铁律：**不修改任何既有套件的断言**（本次新增用例一律落于本文件，M4-P1-01）。
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
  mockTasks,
  pushNotificationOnce,
  resetDatabase,
} from '@/data'
import { NOTIFICATION_EVENT_LABEL, type NotificationItem, type Task } from '@/types'
import * as taskService from '@/services/task.service'
import * as focusService from '@/services/focus.service'
import { countVisibleFocusTasks } from '@/utils/focus'

const ME = DEMO_USER_IDS.me
const OTHER_MANAGER = DEMO_USER_IDS.manager
const SH = 'Asia/Shanghai'

/**
 * 「完成提报」链路使用的种子任务。
 * ⚠️ 偏差说明：ARCH-3 §5-T07 / PRD AC-04 / AC-05 的草图写作 `completeTask('task-001')`，
 * 但 `TASK_TRANSITIONS.todo` **不含** `'done'`（`src/types/task.ts:107`），而 `completeTask` 会
 * `assertTransition(task.status, 'done')` ⇒ 对 `todo` 的 `task-001` 调用会抛 40902。
 * 故本文件统一改用同为「`dueAt` 为今天」的 `in_progress` 任务 `task-004`（与
 * `tests/increment2-completion.test.ts` 的既有姿势一致）；生产代码未做任何迁就性改动。
 */
const DUE_TASK_ID = 'task-004'
const DUE_TASK_TITLE = '首页原型设计'
const DUE_TASK_STATUS: Task['status'] = 'in_progress'

type PushNotificationOnceInput = Parameters<typeof pushNotificationOnce>[0]

/** 按 id 取种子任务（只读引用，不修改） */
function seedTask(id: string): Task {
  const found = mockTasks.find((task) => task.id === id)
  if (!found) throw new Error(`种子任务不存在：${id}`)
  return found
}

/** 三分组按 id 取并集（测试侧独立推导，与被测函数互为交叉验证） */
function unionIds(
  groups: { dueToday: Task[]; pendingReview: Task[]; approaching: Task[] },
  includeReview: boolean,
): string[] {
  const ids = new Set<string>()
  groups.dueToday.forEach((task) => ids.add(task.id))
  groups.approaching.forEach((task) => ids.add(task.id))
  if (includeReview) groups.pendingReview.forEach((task) => ids.add(task.id))
  return [...ids].sort()
}

/** 某审核人对某任务的 `review.pending` 通知（三元组过滤） */
function pendingNotifs(userId: string, taskId: string): NotificationItem[] {
  return db.notifications.filter(
    (item) => item.userId === userId && item.type === 'review.pending' && item.data?.taskId === taskId,
  )
}

/** 某任务的 `review.pending` 通知总数（全部审核人） */
function pendingNotifsOfTask(taskId: string): NotificationItem[] {
  return db.notifications.filter((item) => item.type === 'review.pending' && item.data?.taskId === taskId)
}

/** 去重写入器的标准入参（可覆盖任一维） */
function notifInput(overrides: Partial<PushNotificationOnceInput> = {}): PushNotificationOnceInput {
  return {
    userId: ME,
    type: 'review.pending',
    title: '待你审核',
    body: '「需求文档评审」已完成提报，等待你的审核',
    data: { taskId: 'task-001' },
    ...overrides,
  }
}

/** 通知三元组快照（用于断言「原通知未被改写」） */
function snapshot(items: NotificationItem[]): { id: string; createdAt: string; readAt: string | null }[] {
  return items
    .map((item) => ({ id: item.id, createdAt: item.createdAt, readAt: item.readAt }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

beforeEach(() => {
  resetDatabase()
})

// ── ① 汇总层：并集口径纯函数（AC-02 / INV-7 / K13 / K14） ──────────────────

describe('countVisibleFocusTasks —— 头部汇总并集口径（AC-02 / INV-7）', () => {
  it('groups 为 null / undefined ⇒ 0（取数未就绪的等价空口径）', () => {
    expect(countVisibleFocusTasks(null, { includeReview: true })).toBe(0)
    expect(countVisibleFocusTasks(undefined, { includeReview: false })).toBe(0)
  })

  it('三分组全空 ⇒ 0', () => {
    const empty = { dueToday: [], pendingReview: [], approaching: [] }
    expect(countVisibleFocusTasks(empty, { includeReview: true })).toBe(0)
  })

  it('manager（includeReview=true）⇒ 三分组并集大小（时刻鲁棒：稳定 9 条 + task-018 视窗口计入）', async () => {
    const focus = await focusService.getTodayFocus(ME, SH)
    expect(countVisibleFocusTasks(focus, { includeReview: true })).toBe(unionIds(focus, true).length)
    // 「临期预警」是 24h 滑动窗：task-018（dueAt = 次日 12:00）仅当运行时刻 ≥ 当日 12:00 才落入窗口。
    // 故以 9 条稳定 id 为基线，按实际是否命中窗口动态决定是否计入 task-018（消除对运行时刻的依赖）。
    const stableIds = [
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
    const approachingIds = focus.approaching.map((task) => task.id)
    const expected = approachingIds.includes('task-018') ? [...stableIds, 'task-018'].sort() : stableIds
    expect(countVisibleFocusTasks(focus, { includeReview: true })).toBe(expected.length)
  })

  it('同一 id 出现在多个分组 ⇒ 去重后只计 1（INV-7 / MUT-4）', () => {
    const task = seedTask('task-001')
    const groups = { dueToday: [task], pendingReview: [task], approaching: [task] }
    expect(countVisibleFocusTasks(groups, { includeReview: true })).toBe(1)
    expect(countVisibleFocusTasks(groups, { includeReview: false })).toBe(1)
  })

  it('同一分组内重复 id ⇒ 只计 1', () => {
    const task = seedTask('task-001')
    const groups = { dueToday: [task, task, task], pendingReview: [], approaching: [] }
    expect(countVisibleFocusTasks(groups, { includeReview: true })).toBe(1)
  })

  it('member（includeReview=false）⇒ pendingReview 整组不参与并集', () => {
    const groups = {
      dueToday: [seedTask('task-001')],
      pendingReview: [seedTask('task-019')],
      approaching: [seedTask('task-018')],
    }
    expect(countVisibleFocusTasks(groups, { includeReview: true })).toBe(3)
    expect(countVisibleFocusTasks(groups, { includeReview: false })).toBe(2)
  })

  it('member 下「同属 due 与 review」的任务仍计 1（整组剔除 ≠ 先并集再减 1）', () => {
    const task = seedTask('task-014')
    const groups = { dueToday: [task], pendingReview: [task], approaching: [] }
    expect(countVisibleFocusTasks(groups, { includeReview: false })).toBe(1)
  })

  it('member 口径 = 三分组并集剔除 review 独有项（种子形态交叉验证）', async () => {
    const focus = await focusService.getTodayFocus(ME, SH)
    const memberTotal = countVisibleFocusTasks(focus, { includeReview: false })
    expect(memberTotal).toBe(unionIds(focus, false).length)
    expect(memberTotal).toBeLessThanOrEqual(countVisibleFocusTasks(focus, { includeReview: true }))
  })
})

// ── ② 列表层：listTodayDue 两条新增排除条件（AC-01 / AC-03 / AC-04 / INV-5 / INV-6 / INV-8） ──

describe('listTodayDue —— 双计修正 · 列表层（AC-01 / INV-5 / INV-6 / INV-8）', () => {
  it('AC-01：种子数据下返回 5 条，且不含 done / 待审中', async () => {
    const list = await taskService.listTodayDue(ME, SH)
    expect(list.map((task) => task.id).sort()).toEqual([
      'task-001',
      'task-004',
      'task-005',
      'task-016',
      'task-017',
    ])
    list.forEach((task) => {
      expect(task.status).not.toBe('done')
      expect(task.status).not.toBe('cancelled')
      expect(task.submissionStatus).not.toBe('pending')
    })
  })

  it('INV-6：待审中任务（task-014 / task-015）不在「今日到期」，但仍在「待我审核」', async () => {
    const dueIds = (await taskService.listTodayDue(ME, SH)).map((task) => task.id)
    const reviewIds = (await taskService.listPendingReview(ME)).map((task) => task.id)

    expect(seedTask('task-014').submissionStatus).toBe('pending')
    expect(seedTask('task-015').submissionStatus).toBe('pending')
    expect(dueIds).not.toContain('task-014')
    expect(dueIds).not.toContain('task-015')
    expect(reviewIds).toContain('task-014')
    expect(reviewIds).toContain('task-015')
  })

  it('AC-03 / INV-5：种子态下「今日到期」与「待我审核」交集为空', async () => {
    const dueIds = new Set((await taskService.listTodayDue(ME, SH)).map((task) => task.id))
    const reviewIds = (await taskService.listPendingReview(ME)).map((task) => task.id)
    expect(reviewIds.filter((id) => dueIds.has(id))).toEqual([])
  })

  it('INV-8：done 任务（task-007 / task-008）不在「今日到期」', async () => {
    expect(seedTask('task-007').status).toBe('done')
    expect(seedTask('task-008').status).toBe('done')
    const dueIds = (await taskService.listTodayDue(ME, SH)).map((task) => task.id)
    expect(dueIds).not.toContain('task-007')
    expect(dueIds).not.toContain('task-008')
  })

  it('条件① 单独生效：人为构造「dueAt 为今天 + done + 非 pending」⇒ 被排除', async () => {
    const task = findTask('task-001')!
    task.status = 'done'
    task.submissionStatus = null // 仅条件① 能排除它（条件② 不命中）
    const dueIds = (await taskService.listTodayDue(ME, SH)).map((item) => item.id)
    expect(dueIds).not.toContain('task-001')
  })

  it('AC-04：完成任务后离开「今日到期」并进入「待我审核」（两条排除条件同时命中）', async () => {
    const before = findTask(DUE_TASK_ID)!
    expect(before.status).toBe(DUE_TASK_STATUS)
    expect((await taskService.listTodayDue(ME, SH)).map((t) => t.id)).toContain(DUE_TASK_ID)

    const done = await taskService.completeTask(DUE_TASK_ID, { version: before.version })
    expect(done.status).toBe('pending_review')
    expect(done.submissionStatus).toBe('pending')

    const dueIds = (await taskService.listTodayDue(ME, SH)).map((t) => t.id)
    const reviewIds = (await taskService.listPendingReview(ME)).map((t) => t.id)
    expect(dueIds).not.toContain(DUE_TASK_ID)
    expect(reviewIds).toContain(DUE_TASK_ID)
  })

  it('INV-5 三态：完成后 / 撤销后交集仍为空', async () => {
    const before = findTask(DUE_TASK_ID)!
    const done = await taskService.completeTask(DUE_TASK_ID, { version: before.version })

    const dueAfterDone = new Set((await taskService.listTodayDue(ME, SH)).map((t) => t.id))
    const reviewAfterDone = (await taskService.listPendingReview(ME)).map((t) => t.id)
    expect(reviewAfterDone.filter((id) => dueAfterDone.has(id))).toEqual([])

    await taskService.undoCompletion(DUE_TASK_ID, {
      status: DUE_TASK_STATUS,
      submissionStatus: null,
      version: done.version,
    })

    const dueAfterUndo = new Set((await taskService.listTodayDue(ME, SH)).map((t) => t.id))
    const reviewAfterUndo = (await taskService.listPendingReview(ME)).map((t) => t.id)
    expect(reviewAfterUndo.filter((id) => dueAfterUndo.has(id))).toEqual([])
    // 撤销后回到「今日到期」（任务重新变为需处理）
    expect([...dueAfterUndo]).toContain(DUE_TASK_ID)
  })

  it('listDeadlineApproaching 未同步排除 pending（有意保留的口径差异，K15 / §9-5）', async () => {
    // K15 口径差异的锚点：task-014 处于「待审中」（pending），却仍留在「临期预警」。
    const task = findTask('task-014')!
    expect(task.submissionStatus).toBe('pending')
    // 锚定 dueAt 到当日 23:59 ⇒ 恒落在 [now−1h, now+24h] 窗口内（消除运行时刻漂移）
    task.dueAt = demoDayAt(0, 23, 59)

    const approachingIds = (await taskService.listDeadlineApproaching(ME, SH)).map((t) => t.id)
    expect(approachingIds).toContain('task-014')
  })
})

// ── ③ 数据层：pushNotificationOnce 未读级去重（AC-06 / AC-07 / INV-9） ─────────

describe('pushNotificationOnce —— 未读级去重写入器（M4-P0-04 / K16）', () => {
  it('未命中 ⇒ 写入 1 条（readAt=null / channel=in_app / status=sent）', () => {
    const before = db.notifications.length
    const created = pushNotificationOnce(notifInput())
    expect(created).not.toBeNull()
    expect(db.notifications.length).toBe(before + 1)
    expect(created?.readAt).toBeNull()
    expect(created?.channel).toBe('in_app')
    expect(created?.status).toBe('sent')
    expect(db.notifications[0].id).toBe(created?.id)
  })

  it('命中未读同类 ⇒ 返回 null、不写入、且不消耗 nextId 序号', () => {
    const first = pushNotificationOnce(notifInput())!
    const before = db.notifications.length

    expect(pushNotificationOnce(notifInput())).toBeNull()
    expect(db.notifications.length).toBe(before)

    // 序号未被消耗：下一次成功写入的 id 紧跟首条（证明去重路径未推进 idSeq）
    const next = pushNotificationOnce(notifInput({ data: { taskId: 'task-002' } }))!
    const firstSeq = Number(first.id.split('-')[1])
    const nextSeq = Number(next.id.split('-')[1])
    expect(nextSeq).toBe(firstSeq + 1)
  })

  it('旧通知已读 ⇒ 再写入产生新的一条（AC-07 的写入器级）', async () => {
    const first = pushNotificationOnce(notifInput())!
    await focusService.markNotificationRead(first.id)

    const again = pushNotificationOnce(notifInput())
    expect(again).not.toBeNull()
    expect(again?.id).not.toBe(first.id)
    expect(again?.readAt).toBeNull()
    expect(pendingNotifs(ME, 'task-001')).toHaveLength(2)
    expect(pendingNotifs(ME, 'task-001').filter((n) => n.readAt === null)).toHaveLength(1)
  })

  it('三元组任一维不同 ⇒ 各自写入（userId / type / taskId 逐维区分）', () => {
    expect(pushNotificationOnce(notifInput())).not.toBeNull()
    expect(pushNotificationOnce(notifInput({ userId: OTHER_MANAGER }))).not.toBeNull()
    expect(pushNotificationOnce(notifInput({ type: 'review.result' }))).not.toBeNull()
    expect(pushNotificationOnce(notifInput({ data: { taskId: 'task-002' } }))).not.toBeNull()
  })

  it('data.taskId 缺省 ⇒ 退化为无条件写入（无法构成去重三元组）', () => {
    const before = db.notifications.length
    expect(pushNotificationOnce(notifInput({ data: null }))).not.toBeNull()
    expect(pushNotificationOnce(notifInput({ data: null }))).not.toBeNull()
    expect(db.notifications.length).toBe(before + 2)
  })
})

// ── ④ 全链路：completeTask 派发「待你审核」通知（AC-05 / AC-12） ───────────────

describe('completeTask —— 「待你审核」通知派发（AC-05 / AC-12 / K18）', () => {
  it('AC-05：向全部 reviewerIds 各写 1 条 review.pending，字段齐全', async () => {
    const before = db.notifications.length
    const beforePending = pendingNotifsOfTask(DUE_TASK_ID).length
    const live = findTask(DUE_TASK_ID)!

    const done = await taskService.completeTask(DUE_TASK_ID, { version: live.version })
    const created = pendingNotifsOfTask(DUE_TASK_ID)

    // 条数 = allManagerIds().length（集合比较，不硬编码「恰好 2 条」）
    expect(created).toHaveLength(beforePending + allManagerIds().length)
    // 增量 7：除审核人 review.pending 外，completeTask 还向评审子任务承接人（project-001 负责人 = ME）
    // 派发 1 条 `task.review.pending`（data.taskId = 子任务 id，不计入上面的 created）⇒ 总数 +1
    expect(db.notifications.length).toBe(before + allManagerIds().length + 1)
    // userId 集合 === task.reviewerIds
    expect(new Set(created.map((n) => n.userId))).toEqual(new Set(done.reviewerIds ?? []))
    expect(new Set(created.map((n) => n.userId))).toEqual(new Set(allManagerIds()))

    created.forEach((notification) => {
      expect(notification.type).toBe('review.pending')
      expect(notification.title).toBe('待你审核')
      expect(notification.body).toContain(DUE_TASK_TITLE)
      expect(notification.body).toContain('已完成提报')
      expect(notification.data?.taskId).toBe(DUE_TASK_ID)
      expect(notification.readAt).toBeNull()
      expect(notification.channel).toBe('in_app')
      expect(notification.status).toBe('sent')
    })
  })

  it('AC-05：审核人来源 = task.reviewerIds（未二次调用 allManagerIds）', async () => {
    const live = findTask(DUE_TASK_ID)!
    const done = await taskService.completeTask(DUE_TASK_ID, { version: live.version })
    expect(done.reviewerIds).toEqual(allManagerIds())
    expect(new Set(pendingNotifsOfTask(DUE_TASK_ID).map((n) => n.userId))).toEqual(
      new Set(done.reviewerIds),
    )
    // 与 listPendingReview 的可见性判定同源：每位通知接收人都能在待审列表看到该任务
    for (const reviewerId of done.reviewerIds ?? []) {
      const visible = (await taskService.listPendingReview(reviewerId)).map((t) => t.id)
      expect(visible).toContain(DUE_TASK_ID)
    }
  })

  it('AC-12（增量 7 修正）：操作人本人也收到通知，未读数 4 → 6（Q4-1 不排除本人；含评审子任务承接人通知 +1）', async () => {
    const unreadBefore = await focusService.getUnreadCount(ME)
    expect(unreadBefore).toBe(4)

    const live = findTask(DUE_TASK_ID)!
    await taskService.completeTask(DUE_TASK_ID, { version: live.version })

    // M1/增量 7：ME 既收到主任务的 review.pending（本人是审核人），又收到评审子任务的
    // task.review.pending（project-001 负责人 = ME）⇒ 未读 +2
    expect(await focusService.getUnreadCount(ME)).toBe(unreadBefore + 2)
    expect(pendingNotifs(ME, DUE_TASK_ID).filter((n) => n.readAt === null)).toHaveLength(1)
  })

  it('AC-06：完成 → 撤销 → 再完成 ⇒ 总数不增，原通知 id / createdAt / readAt 不变', async () => {
    const live = findTask(DUE_TASK_ID)!
    const done = await taskService.completeTask(DUE_TASK_ID, { version: live.version })
    const total = pendingNotifsOfTask(DUE_TASK_ID).length
    const before = snapshot(pendingNotifsOfTask(DUE_TASK_ID))
    expect(total).toBe(allManagerIds().length)

    const undone = await taskService.undoCompletion(DUE_TASK_ID, {
      status: DUE_TASK_STATUS,
      submissionStatus: null,
      version: done.version,
    })
    await taskService.completeTask(DUE_TASK_ID, { version: undone.version })

    expect(pendingNotifsOfTask(DUE_TASK_ID)).toHaveLength(total)
    expect(snapshot(pendingNotifsOfTask(DUE_TASK_ID))).toEqual(before)
  })

  it('AC-07（增量 7 M1 修正）：撤销清 reviewRequired ⇒ 再完成不派发新通知（原「已读后重新提交 +1」语义随 M1 失效）', async () => {
    const live = findTask(DUE_TASK_ID)!
    const done = await taskService.completeTask(DUE_TASK_ID, { version: live.version })
    const mine = pendingNotifs(ME, DUE_TASK_ID)[0]
    const otherBefore = pendingNotifs(OTHER_MANAGER, DUE_TASK_ID).map((n) => n.id)
    await focusService.markNotificationRead(mine.id)

    const undone = await taskService.undoCompletion(DUE_TASK_ID, {
      status: DUE_TASK_STATUS,
      submissionStatus: null,
      version: done.version,
    })
    await taskService.completeTask(DUE_TASK_ID, { version: undone.version })

    // M1：撤销经 createClearedReviewState 清 reviewRequired ⇒ 第二次完成 `needsReview === false`
    // ⇒ 不派发 review.pending ⇒ user-001 仍只有原 1 条（且已读），user-004 不增
    const mineAfter = pendingNotifs(ME, DUE_TASK_ID)
    expect(mineAfter).toHaveLength(1)
    expect(mineAfter.filter((n) => n.readAt === null)).toHaveLength(0)
    expect(pendingNotifs(OTHER_MANAGER, DUE_TASK_ID).map((n) => n.id)).toEqual(otherBefore)
  })

  it('INV-9：反复「完成 → 撤销 → 完成」3 轮 ⇒ 三元组未读条数恒 ≤ 1', async () => {
    let version = findTask(DUE_TASK_ID)!.version
    for (let round = 0; round < 3; round += 1) {
      const done = await taskService.completeTask(DUE_TASK_ID, { version })
      const undone = await taskService.undoCompletion(DUE_TASK_ID, {
        status: DUE_TASK_STATUS,
        submissionStatus: null,
        version: done.version,
      })
      version = undone.version
    }
    await taskService.completeTask(DUE_TASK_ID, { version })

    for (const reviewerId of allManagerIds()) {
      const unread = pendingNotifs(reviewerId, DUE_TASK_ID).filter((n) => n.readAt === null)
      expect(unread.length).toBeLessThanOrEqual(1)
    }
    expect(pendingNotifsOfTask(DUE_TASK_ID)).toHaveLength(allManagerIds().length)
  })

  it('undoCompletion 函数体内不含任何通知操作（Q4-3：通知不撤回）', () => {
    const source = readFileSync(resolve(__dirname, '../src/services/task.service.ts'), 'utf8')
    const body = source.slice(
      source.indexOf('export async function undoCompletion'),
      source.indexOf('/** 评论列表 */'),
    )
    expect(body.length).toBeGreaterThan(0)
    expect(body).not.toContain('pushNotification')
    expect(body).not.toContain('db.notifications')
  })
})

// ── ⑤ 映射同步三处（AC-08 / K17） ─────────────────────────────────────────

describe('review.pending 三处映射同步（AC-08 / K17）', () => {
  it('① NOTIFICATION_EVENT_LABEL 标签 = 待审核提醒', () => {
    expect(NOTIFICATION_EVENT_LABEL['review.pending']).toBe('待审核提醒')
  })

  it("② NOTIFICATION_ICON 图标 = 'inbox'（非 fallback 'bell'）", () => {
    const source = readFileSync(resolve(__dirname, '../src/screens/NotificationsScreen.tsx'), 'utf8')
    const start = source.indexOf('const NOTIFICATION_ICON')
    const iconBlock = source.slice(start, source.indexOf('}', start))
    expect(iconBlock).toContain("'review.pending': 'inbox'")
    // 图标名合法性由 tsc 兜底（该 map 取值类型为 keyof typeof Feather.glyphMap，强类型）
  })

  it('③ NotificationItem.type 注释已登记 review.pending', () => {
    const source = readFileSync(resolve(__dirname, '../src/types/domain.ts'), 'utf8')
    const commentLine = source
      .split('\n')
      .find((line) => line.includes('task.assigned / mention / deadline_approaching'))
    expect(commentLine).toBeDefined()
    expect(commentLine).toContain('review.pending')
  })
})
