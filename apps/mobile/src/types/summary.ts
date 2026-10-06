/**
 * 职责：个人周期总结 DTO（M-P2-04 工作台数据卡片）—— 镜像 Web 端
 * `apps/web/src/api/summaryApi.ts` 的 `PeriodSummary` / `SummaryStats` / `SummaryTaskItem`，
 * 字段命名**逐字对齐**（保证与数据中枢口径一致），仅按移动端卡片所需裁剪掉 `draft`
 * （草稿保存不属本需求范围）。
 */

/** 总结周期：day=当日 / week=最近 7 天 / month=最近 30 天 / year=本年度（后端滚动窗口口径） */
export type SummaryPeriod = 'day' | 'week' | 'month' | 'year'

/** 周期聚合统计（对齐 Web `SummaryStats`） */
export interface SummaryStats {
  /** 周期内完成任务数 */
  completedCount: number
  /** 按时完成数（仅统计带 dueAt 的任务） */
  onTimeCount: number
  /** 延期完成数（completedAt > dueAt） */
  overdueCount: number
  /** 实际工时合计（h，四舍五入到 1 位小数） */
  actualHoursTotal: number
  /** 按时率 0–100（无带截止任务时为 null） */
  onTimeRate: number | null
}

/** 完成清单条目（团队任务带项目信息；个人任务 `type='personal'`，项目信息恒为 null） */
export interface SummaryTaskItem {
  id: string
  type: 'team' | 'personal'
  title: string
  dueAt: string | null
  completedAt: string
  actualHours: number | null
  projectId: string | null
  projectName: string | null
  overdue: boolean
}

/** 周期总结（镜像 Web `PeriodSummary`，裁剪 `draft`） */
export interface PeriodSummary {
  period: SummaryPeriod
  /** 统计窗口（滚动周期起止，ISO8601 UTC 字符串） */
  window: { start: string; end: string }
  stats: SummaryStats
  /** 延期完成清单 */
  overdueTasks: SummaryTaskItem[]
  /** 完成清单（按 completedAt 倒序） */
  completedTasks: SummaryTaskItem[]
}
