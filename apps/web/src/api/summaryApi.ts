/**
 * 职责：个人周期总结 API 封装 —— GET /me/summaries?period=（统计聚合 + 已保存草稿）、POST /me/summaries（手动编辑保存草稿）
 * 契约（以后端为准）：参数 period（week/month 滚动窗口）；响应 {period, window:{start,end}, stats,
 * overdueTasks, completedTasks, draft}；POST body {period, content}（1–20000 字符），同周期覆盖写。
 */
import { client } from './client'
import { USE_MOCK } from './config'
import { mockGetSummary, mockSaveSummary } from './mock/handlers'
import type { ApiResponse } from '@/types'

/** 总结周期：day=当日 / week=最近 7 天 / month=最近 30 天 / year=本年度（后端滚动窗口口径） */
export type SummaryPeriod = 'day' | 'week' | 'month' | 'year'

/** 周期聚合统计（后端 stats 字段） */
export interface SummaryStats {
  completedCount: number // 周期内完成任务数
  onTimeCount: number // 按时完成数（仅统计带 due_at 的任务）
  overdueCount: number // 延期完成数（completedAt > dueAt）
  actualHoursTotal: number // 实际工时合计（h）
  onTimeRate: number | null // 按时率 0–100（无带截止任务时为 null）
}

/** 完成/延期清单条目（团队任务带项目信息，个人任务 type=personal） */
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

/** 已保存草稿（无记录为 null） */
export interface SummaryDraft {
  id: string
  content: string
  updatedAt: string
}

/** 周期总结（GET /me/summaries 响应 data；后端恒返回聚合数据，draft 无记录时为 null） */
export interface PeriodSummary {
  period: SummaryPeriod
  window: { start: string; end: string } // 统计窗口（滚动周期起止）
  stats: SummaryStats
  overdueTasks: SummaryTaskItem[]
  completedTasks: SummaryTaskItem[]
  draft: SummaryDraft | null
}

/** 保存总结草稿请求体（后端 body {period, content}，content 1–20000 字符） */
export interface SaveSummaryInput {
  period: SummaryPeriod
  content: string
}

/** 保存总结草稿响应（POST /me/summaries 响应 data） */
export interface SaveSummaryResult {
  id: string
  period: SummaryPeriod
  content: string
  updatedAt: string
}

/** 获取周期总结：GET /me/summaries?period=（后端按 period 返回滚动窗口聚合） */
export async function getSummary(period: SummaryPeriod): Promise<PeriodSummary> {
  if (USE_MOCK) return mockGetSummary(period)
  const resp = await client.get<ApiResponse<PeriodSummary>>('/me/summaries', { params: { period } })
  return resp.data.data
}

/** 保存/更新周期总结草稿：POST /me/summaries（body {period, content}，同周期覆盖写） */
export async function saveSummary(input: SaveSummaryInput): Promise<SaveSummaryResult> {
  if (USE_MOCK) return mockSaveSummary(input)
  const resp = await client.post<ApiResponse<SaveSummaryResult>>('/me/summaries', input)
  return resp.data.data
}