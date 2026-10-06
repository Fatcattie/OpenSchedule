/**
 * 职责：个人周期总结服务（M-P2-04 工作台数据卡片取数）。
 *
 * 口径与数据中枢**逐条对齐** Web 端 `GET /me/summaries?period=week`
 * （`apps/web/src/api/mock/handlers.ts` 的 `buildPeriodSummary`）：
 * 1. 窗口 = **滚动 7 天**（非自然周）：`end = now`、`start = now - 7 * 86_400_000`；
 * 2. 纳入范围 = 团队任务（`assigneeId === userId`）+ 个人任务（`userId === userId`）；
 * 3. 完成条件：`status === 'done'` 且 `completedAt !== null` 且 `completedAt ∈ [start, end]`；
 * 4. `stats.actualHoursTotal` = 四舍五入到 1 位小数的 `Σ (actualHours ?? 0)`。
 */
import { db } from '@/data'
import type { PeriodSummary, SummaryStats, SummaryTaskItem, TaskStatus } from '@/types'
import { httpClient, simulateLatency } from './client'
import { USE_MOCK } from './config'

/** 滚动 7 天窗口宽度（毫秒，对齐 Web handlers.ts:544 的 `7 * 86_400_000`） */
const WEEK_WINDOW_MS = 7 * 86_400_000

/** 获取「本周」（最近 7 天）周期总结：GET /me/summaries?period=week */
export async function getWeekSummary(userId: string): Promise<PeriodSummary> {
  if (USE_MOCK) {
    await simulateLatency()
    return buildWeekSummary(userId, new Date())
  }
  // TODO(real-api): GET /me/summaries?period=week（后端按 period 返回滚动窗口聚合）
  return httpClient.get<PeriodSummary>('/me/summaries', { query: { period: 'week' } })
}

/**
 * 从内存库构建最近 7 天周期总结（mock 实现，口径对齐 Web `buildPeriodSummary`）。
 * @param userId 当前用户 id（团队任务按 `assigneeId` 归属、个人任务按 `userId` 归属）
 * @param now 窗口右端点（便于测试注入，默认 `new Date()`）
 */
function buildWeekSummary(userId: string, now: Date): PeriodSummary {
  const end = now
  const start = new Date(now.getTime() - WEEK_WINDOW_MS)
  const window = { start: start.toISOString(), end: end.toISOString() }

  const items: SummaryTaskItem[] = []

  // 团队任务：assigneeId 归属当前用户 + 已完成且完成时间落窗
  db.tasks
    .filter((task) => task.assigneeId === userId && isCompletedInWindow(task, start, end))
    .forEach((task) => {
      const completedAt = task.completedAt as string
      items.push({
        id: task.id,
        type: 'team',
        title: task.title,
        dueAt: task.dueAt,
        completedAt,
        actualHours: task.actualHours,
        projectId: task.projectId,
        projectName: db.projects.find((project) => project.id === task.projectId)?.name ?? null,
        overdue: isOverdue(completedAt, task.dueAt),
      })
    })

  // 个人任务：userId 归属当前用户（个人任务用 userId 而非 assigneeId，见 types/domain.ts）
  db.personalTasks
    .filter((task) => task.userId === userId && isCompletedInWindow(task, start, end))
    .forEach((task) => {
      const completedAt = task.completedAt as string
      items.push({
        id: task.id,
        type: 'personal',
        title: task.title,
        dueAt: task.dueAt,
        completedAt,
        actualHours: task.actualHours,
        projectId: null,
        projectName: null,
        overdue: isOverdue(completedAt, task.dueAt),
      })
    })

  items.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())

  return {
    period: 'week',
    window,
    stats: computeStats(items),
    overdueTasks: items.filter((item) => item.overdue),
    completedTasks: items,
  }
}

/** 「已完成且完成时间落窗」判据（团队任务 / 个人任务共用） */
function isCompletedInWindow(
  record: { status: TaskStatus; completedAt: string | null },
  start: Date,
  end: Date,
): boolean {
  if (record.status !== 'done' || record.completedAt === null) return false
  const time = new Date(record.completedAt).getTime()
  return time >= start.getTime() && time <= end.getTime()
}

/** 是否延期完成（completedAt > dueAt；无 dueAt 视为未延期） */
function isOverdue(completedAt: string, dueAt: string | null): boolean {
  return dueAt !== null && new Date(completedAt).getTime() > new Date(dueAt).getTime()
}

/** 聚合统计（对齐 Web `buildPeriodSummary` 的 stats 计算） */
function computeStats(items: SummaryTaskItem[]): SummaryStats {
  const withDue = items.filter((item) => item.dueAt !== null)
  const onTime = withDue.filter((item) => !item.overdue)
  return {
    completedCount: items.length,
    onTimeCount: onTime.length,
    overdueCount: withDue.length - onTime.length,
    actualHoursTotal: roundToOneDecimal(items.reduce((sum, item) => sum + (item.actualHours ?? 0), 0)),
    onTimeRate: withDue.length > 0 ? roundToOneDecimal((onTime.length / withDue.length) * 100) : null,
  }
}

/** 四舍五入到 1 位小数（对齐 Web `Math.round(x * 10) / 10`） */
function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10
}
