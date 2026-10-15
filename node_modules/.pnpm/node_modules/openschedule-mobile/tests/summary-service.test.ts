/**
 * 职责：M-P2-04 工作台数据卡片 —— 周期总结服务口径测试（对齐 Web `GET /me/summaries?period=week`）。
 *
 * 关键口径（用户已拍板 B 个人周期总结口径）：
 *  - 窗口 = **滚动 7 天**（非自然周）：`end = now`、`start = now - 7 * 86_400_000`；
 *  - 纳入 = 团队任务（`assigneeId === userId`）+ 个人任务（`userId === userId`）；
 *  - 完成条件：`status === 'done'` 且 `completedAt !== null` 且 `completedAt ∈ [start, end]`；
 *  - `actualHoursTotal` 四舍五入到 1 位小数；无命中 ⇒ `0`（不得 NaN / null）。
 *
 * 纯 service 层测试（USE_MOCK）：每个用例前 resetDatabase 并清空任务表，保证断言只反映本用例夹具。
 */
import { DEMO_USER_IDS, db, resetDatabase } from '@/data'
import * as summaryService from '@/services/summary.service'
import type { PersonalTask, Task } from '@/types'

const ME = DEMO_USER_IDS.me // user-001（演示账号）
const OTHER = DEMO_USER_IDS.lina // user-002

const DAY_MS = 86_400_000

/** 相对「现在」的 ISO 时间（正数=未来、负数=过去） */
function isoFromNow(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString()
}

/** 构造一条字段完整的团队任务（默认已完成、assigneeId = ME） */
function makeTeamTask(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  const base: Task = {
    id: '',
    tenantId: 'tenant-001',
    projectId: null,
    parentId: null,
    title: '',
    description: null,
    status: 'done',
    priority: 'medium',
    assigneeId: ME,
    startAt: null,
    dueAt: null,
    endAt: null,
    estimatedHours: null,
    actualHours: null,
    completedAt: isoFromNow(-DAY_MS),
    startedAt: null,
    createdBy: ME,
    tags: [],
    sortOrder: 0,
    workflowColumnId: null,
    isAiGenerated: false,
    version: 1,
    createdAt: isoFromNow(-2 * DAY_MS),
    updatedAt: isoFromNow(-DAY_MS),
  }
  return { ...base, ...partial }
}

/** 构造一条字段完整的个人任务（默认已完成、userId = ME） */
function makePersonalTask(
  partial: Partial<PersonalTask> & Pick<PersonalTask, 'id' | 'title'>,
): PersonalTask {
  const base: PersonalTask = {
    id: '',
    tenantId: 'tenant-001',
    userId: ME,
    parentId: null,
    title: '',
    description: null,
    status: 'done',
    priority: 'medium',
    startAt: null,
    endAt: null,
    dueAt: null,
    estimatedHours: null,
    actualHours: null,
    completedAt: isoFromNow(-DAY_MS),
    tags: [],
    sortOrder: 0,
    linkedTaskId: null,
    createdAt: isoFromNow(-2 * DAY_MS),
    updatedAt: isoFromNow(-DAY_MS),
  }
  return { ...base, ...partial }
}

beforeEach(() => {
  resetDatabase()
  // 清空种子任务，保证断言只反映本用例构造的夹具
  db.tasks = []
  db.personalTasks = []
})

describe('getWeekSummary —— 窗口为滚动 7 天（非自然周）', () => {
  it('距今 6 天完成 ⇒ 计入；距今 8 天完成 ⇒ 不计入', async () => {
    db.tasks = [
      makeTeamTask({ id: 't-6d', title: '6 天前完成', completedAt: isoFromNow(-6 * DAY_MS) }),
      makeTeamTask({ id: 't-8d', title: '8 天前完成', completedAt: isoFromNow(-8 * DAY_MS) }),
    ]
    const summary = await summaryService.getWeekSummary(ME)
    expect(summary.stats.completedCount).toBe(1)
    expect(summary.completedTasks.map((item) => item.id)).toEqual(['t-6d'])
  })

  it('距今 >7 天完成的数据不计入（钉死「非自然周」）', async () => {
    // 9 天前完成：若按自然周（周一~周日）很可能落在上一自然周而被误计入
    db.tasks = [
      makeTeamTask({ id: 't-9d', title: '9 天前完成', completedAt: isoFromNow(-9 * DAY_MS) }),
      makeTeamTask({ id: 't-1d', title: '1 天前完成', completedAt: isoFromNow(-1 * DAY_MS) }),
    ]
    const summary = await summaryService.getWeekSummary(ME)
    expect(summary.completedTasks.map((item) => item.id)).toEqual(['t-1d'])
  })

  it('window：start = end - 7 天，period = week', async () => {
    const summary = await summaryService.getWeekSummary(ME)
    expect(summary.period).toBe('week')
    const start = new Date(summary.window.start).getTime()
    const end = new Date(summary.window.end).getTime()
    expect(end - start).toBe(7 * DAY_MS)
  })
})

describe('getWeekSummary —— 完成条件', () => {
  it('status !== done 不计入', async () => {
    db.tasks = [
      makeTeamTask({ id: 't-todo', title: '未完成', status: 'todo', completedAt: isoFromNow(-DAY_MS) }),
      makeTeamTask({
        id: 't-inprogress',
        title: '进行中',
        status: 'in_progress',
        completedAt: isoFromNow(-DAY_MS),
      }),
    ]
    const summary = await summaryService.getWeekSummary(ME)
    expect(summary.stats.completedCount).toBe(0)
  })

  it('completedAt === null 不计入（即使 status = done）', async () => {
    db.tasks = [makeTeamTask({ id: 't-null', title: '无完成时间', status: 'done', completedAt: null })]
    const summary = await summaryService.getWeekSummary(ME)
    expect(summary.stats.completedCount).toBe(0)
  })

  it('他人任务（assigneeId / userId 非当前用户）不计入', async () => {
    db.tasks = [
      makeTeamTask({ id: 't-mine', title: '我的任务' }),
      makeTeamTask({ id: 't-other', title: '他人任务', assigneeId: OTHER }),
    ]
    db.personalTasks = [
      makePersonalTask({ id: 'p-mine', title: '我的个人任务' }),
      makePersonalTask({ id: 'p-other', title: '他人个人任务', userId: OTHER }),
    ]
    const summary = await summaryService.getWeekSummary(ME)
    expect(summary.completedTasks.map((item) => item.id).sort()).toEqual(['p-mine', 't-mine'])
  })
})

describe('getWeekSummary —— 团队任务与个人任务均纳入', () => {
  it('团队任务（assigneeId）+ 个人任务（userId）合并统计', async () => {
    db.tasks = [makeTeamTask({ id: 't-1', title: '团队任务', actualHours: 3 })]
    db.personalTasks = [makePersonalTask({ id: 'p-1', title: '个人任务', actualHours: 2 })]
    const summary = await summaryService.getWeekSummary(ME)
    expect(summary.stats.completedCount).toBe(2)
    expect(summary.stats.actualHoursTotal).toBe(5)
    expect(summary.completedTasks.map((item) => item.type).sort()).toEqual(['personal', 'team'])
  })

  it('个人任务归属用 userId（userId 非本人则排除）', async () => {
    db.personalTasks = [makePersonalTask({ id: 'p-other', title: '他人个人任务', userId: OTHER })]
    const summary = await summaryService.getWeekSummary(ME)
    expect(summary.stats.completedCount).toBe(0)
  })
})

describe('getWeekSummary —— 工时四舍五入到 1 位小数', () => {
  it('Σ actualHours 四舍五入到 1 位小数', async () => {
    db.tasks = [
      makeTeamTask({ id: 't-1', title: 'A', actualHours: 2.34 }),
      makeTeamTask({ id: 't-2', title: 'B', actualHours: 2.34 }),
    ]
    const summary = await summaryService.getWeekSummary(ME)
    // 2.34 + 2.34 = 4.68 → Math.round(4.68 * 10) / 10 = 4.7
    expect(summary.stats.actualHoursTotal).toBe(4.7)
  })

  it('浮点误差被四舍五入抹平（0.1 + 0.2 = 0.30000000000000004 → 0.3）', async () => {
    db.tasks = [
      makeTeamTask({ id: 't-1', title: 'A', actualHours: 0.1 }),
      makeTeamTask({ id: 't-2', title: 'B', actualHours: 0.2 }),
    ]
    const summary = await summaryService.getWeekSummary(ME)
    expect(summary.stats.actualHoursTotal).toBe(0.3)
  })

  it('actualHours 为 null 按 0 计', async () => {
    db.tasks = [
      makeTeamTask({ id: 't-1', title: 'A', actualHours: 2 }),
      makeTeamTask({ id: 't-2', title: 'B', actualHours: null }),
    ]
    const summary = await summaryService.getWeekSummary(ME)
    expect(summary.stats.actualHoursTotal).toBe(2)
  })
})

describe('getWeekSummary —— 无命中兜底', () => {
  it('无命中 ⇒ completedCount = 0、actualHoursTotal = 0（非 NaN / null）', async () => {
    const summary = await summaryService.getWeekSummary(ME)
    expect(summary.stats.completedCount).toBe(0)
    expect(summary.stats.actualHoursTotal).toBe(0)
    expect(Number.isNaN(summary.stats.actualHoursTotal)).toBe(false)
    expect(summary.completedTasks).toEqual([])
    expect(summary.overdueTasks).toEqual([])
  })
})

describe('getWeekSummary —— 按时率口径（镜像 Web）', () => {
  it('带 dueAt 的完成项：延期项计入 overdueCount，按时率按带截止项计算', async () => {
    db.tasks = [
      // 按时完成（completedAt <= dueAt）
      makeTeamTask({
        id: 't-ontime',
        title: '按时',
        completedAt: isoFromNow(-3 * DAY_MS),
        dueAt: isoFromNow(-2 * DAY_MS),
      }),
      // 延期完成（completedAt > dueAt）
      makeTeamTask({
        id: 't-overdue',
        title: '延期',
        completedAt: isoFromNow(-DAY_MS),
        dueAt: isoFromNow(-2 * DAY_MS),
      }),
    ]
    const summary = await summaryService.getWeekSummary(ME)
    expect(summary.stats.completedCount).toBe(2)
    expect(summary.stats.onTimeCount).toBe(1)
    expect(summary.stats.overdueCount).toBe(1)
    expect(summary.stats.onTimeRate).toBe(50)
    expect(summary.overdueTasks.map((item) => item.id)).toEqual(['t-overdue'])
  })
})
