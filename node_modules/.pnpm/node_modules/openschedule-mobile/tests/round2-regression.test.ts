/**
 * 职责：第 2 轮回归验证 —— 撤销语义（建议 1）/ 撤销竞态（建议 2）/ 时区同源（D-06）。
 * 由 QA 独立编写，仅测试代码，不改动业务源码。
 * 关键点：断言「行为」而非「返回结构非空」——回滚到原状态、复位提报态、陈旧 version 抛 40901。
 */
import { DEMO_USER_IDS, db, findTask, resetDatabase } from '@/data'
import { ERR_ILLEGAL_TRANSITION, ERR_OPTIMISTIC_LOCK } from '@/types'
import * as taskService from '@/services/task.service'
import * as focusService from '@/services/focus.service'
import { minutesFromMidnight, toDateKey } from '@/utils/date'

const ME = DEMO_USER_IDS.me

beforeEach(() => {
  resetDatabase()
})

describe('undoCompletion —— 撤销语义（建议 1）', () => {
  it('撤销「完成」回到操作前状态（in_progress），而非一律 todo', async () => {
    const task = findTask('task-007')
    expect(task?.status).toBe('done')
    const version = task?.version ?? 0

    const undone = await taskService.undoCompletion('task-007', { status: 'in_progress', version })

    expect(undone.status).toBe('in_progress')
    expect(undone.completedAt).toBeNull()
    expect(undone.version).toBe(version + 1)
    // 落审计（可追溯）
    expect(db.auditFeed[0].action).toBe('task.undo')
  })

  it('撤销「完成」也可回到 todo（按传入目标状态，语义由调用方决定）', async () => {
    const task = findTask('task-007')
    const undone = await taskService.undoCompletion('task-007', {
      status: 'todo',
      version: task?.version ?? 0,
    })
    expect(undone.status).toBe('todo')
    expect(undone.completedAt).toBeNull()
  })

  it('撤销「审核通过」复位 submissionStatus 为 pending 且状态回到 in_progress', async () => {
    const before = findTask('task-014')
    expect(before?.submissionStatus).toBe('pending')

    const approved = await taskService.reviewSubmission('task-014', 'approve', before?.version ?? 0)
    expect(approved.status).toBe('done')
    expect(approved.submissionStatus).toBe('approved')

    const undone = await taskService.undoCompletion('task-014', {
      status: 'in_progress',
      submissionStatus: 'pending',
      version: approved.version,
    })

    expect(undone.status).toBe('in_progress')
    expect(undone.submissionStatus).toBe('pending')
    expect(undone.completedAt).toBeNull()
  })

  it('不传 submissionStatus 时 service 保持原值（调用方须显式传 null 才能回滚）', async () => {
    const before = findTask('task-007')
    const undone = await taskService.undoCompletion('task-007', {
      status: 'in_progress',
      version: before?.version ?? 0,
    })
    expect(undone.submissionStatus).toBe(before?.submissionStatus)
  })
})

describe('undoCompletion —— 撤销竞态（建议 2：catch 路径可达）', () => {
  it('陈旧 version 撤销抛 40901（handleUndo 的 catch 可接住并提示）', async () => {
    const task = findTask('task-007')
    await expect(
      taskService.undoCompletion('task-007', { status: 'in_progress', version: (task?.version ?? 0) + 5 }),
    ).rejects.toMatchObject({ code: ERR_OPTIMISTIC_LOCK })
  })

  it('非法目标状态被拒绝（done 只能回 todo / in_progress，40902）', async () => {
    const task = findTask('task-007')
    await expect(
      taskService.undoCompletion('task-007', { status: 'blocked', version: task?.version ?? 0 }),
    ).rejects.toMatchObject({ code: ERR_ILLEGAL_TRANSITION })
  })
})

describe('时间容器 —— 空闲时段与任务块同源（D-06 时区一致性）', () => {
  const TIMEZONES = ['Asia/Shanghai', 'America/New_York', 'Europe/London']

  it.each(TIMEZONES)('时区 %s：空闲时段始终落在目标时区 08:00–20:00 窗口内', async (timezone) => {
    const day = await focusService.getCalendarDay(ME, timezone, 0)
    expect(day.freeSlots.length).toBeGreaterThan(0)
    day.freeSlots.forEach((slot) => {
      const start = minutesFromMidnight(slot.startAt, timezone)
      const end = minutesFromMidnight(slot.endAt, timezone)
      expect(start).toBeGreaterThanOrEqual(8 * 60)
      expect(end).toBeLessThanOrEqual(20 * 60)
      expect(end).toBeGreaterThan(start)
    })
  })

  it.each(TIMEZONES)('时区 %s：空闲时段与任务块在同一时区下互不重叠（不再错位）', async (timezone) => {
    const day = await focusService.getCalendarDay(ME, timezone, 0)
    // 与 service 内部一致：把任务块裁剪到 08:00–20:00 窗口后作为「占用区间」
    const occupied = day.blocks
      .map((block) => {
        const rawStart = minutesFromMidnight(block.startAt, timezone)
        const rawEnd = minutesFromMidnight(block.endAt, timezone)
        const safeEnd = rawEnd > rawStart ? rawEnd : rawStart + 60
        return { start: Math.max(8 * 60, rawStart), end: Math.min(20 * 60, safeEnd) }
      })
      .filter((range) => range.end > range.start)

    day.freeSlots.forEach((slot) => {
      const slotStart = minutesFromMidnight(slot.startAt, timezone)
      const slotEnd = minutesFromMidnight(slot.endAt, timezone)
      occupied.forEach((range) => {
        const overlaps = slotStart < range.end && slotEnd > range.start
        expect(overlaps).toBe(false)
      })
    })
  })

  it.each(TIMEZONES)('时区 %s：空闲时段锚定在目标时区的「当天」（与任务块同一日键）', async (timezone) => {
    const day = await focusService.getCalendarDay(ME, timezone, 0)
    day.freeSlots.forEach((slot) => {
      expect(toDateKey(slot.startAt, timezone)).toBe(day.dateKey)
      expect(toDateKey(slot.endAt, timezone)).toBe(day.dateKey)
    })
    // 任务块同样归属目标时区当天
    day.blocks.forEach((block) => {
      expect(toDateKey(block.startAt, timezone)).toBe(day.dateKey)
    })
  })
})
