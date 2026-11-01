/**
 * 职责：报表/计划 API 封装 —— 甘特、燃尽、负载、依赖 CRUD（规格 B15/B16）
 */
import { client } from './client'
import { mockOr, mockOrMap, mockOrVoid } from './mock/dispatch'
import type { ApiResponse } from '@/types'
import type {
  BurndownData,
  CreateDependencyInput,
  DashboardData,
  GanttData,
  LoadData,
  PlanResult,
  TaskDependency,
  WeeklyReport,
  WeeklyReportList,
  OverlapResult,
} from '@/types'

/** 项目甘特数据：GET /reports/projects/:projectId/gantt */
export async function getGantt(projectId: string): Promise<GanttData> {
  return mockOr('mockGetGantt', async () => {
    const resp = await client.get<ApiResponse<GanttData>>(`/reports/projects/${projectId}/gantt`)
    return resp.data.data
  }, projectId)
}

/** 项目燃尽图：GET /reports/projects/:projectId/burndown?days=N */
export async function getBurndown(projectId: string, days = 14): Promise<BurndownData> {
  return mockOr('mockGetBurndown', async () => {
    const resp = await client.get<ApiResponse<BurndownData>>(`/reports/projects/${projectId}/burndown`, {
      params: { days },
    })
    return resp.data.data
  }, projectId, days)
}

/** 成员负载热力图：GET /reports/load?projectId=&days=N */
export async function getLoad(projectId?: string, days = 14): Promise<LoadData> {
  return mockOr('mockGetLoad', async () => {
    const resp = await client.get<ApiResponse<LoadData>>('/reports/load', {
      params: { projectId, days },
    })
    return resp.data.data
  }, projectId, days)
}

/** CPM 计算结果：GET /projects/:projectId/plan（dependencies 模块） */
export async function getPlan(projectId: string): Promise<PlanResult> {
  return mockOr('mockGetPlan', async () => {
    const resp = await client.get<ApiResponse<PlanResult>>(`/projects/${projectId}/plan`)
    return resp.data.data
  }, projectId)
}

/** 依赖列表：GET /projects/:projectId/dependencies */
export async function listDependencies(projectId: string): Promise<TaskDependency[]> {
  return mockOr('mockListDependencies', async () => {
    const resp = await client.get<ApiResponse<TaskDependency[]>>(`/projects/${projectId}/dependencies`)
    return resp.data.data
  }, projectId)
}

/** 创建依赖：POST /projects/:projectId/dependencies */
export async function createDependency(projectId: string, input: CreateDependencyInput): Promise<TaskDependency> {
  return mockOr('mockCreateDependency', async () => {
    const resp = await client.post<ApiResponse<TaskDependency>>(`/projects/${projectId}/dependencies`, input)
    return resp.data.data
  }, projectId, input)
}

/** 删除依赖：DELETE /dependencies/:id */
export async function deleteDependency(id: string): Promise<{ id: string; deleted: boolean }> {
  return mockOr('mockDeleteDependency', async () => {
    const resp = await client.delete<ApiResponse<{ id: string; deleted: boolean }>>(`/dependencies/${id}`)
    return resp.data.data
  }, id)
}

// ========== B18 周报 + 仪表盘 ==========

/** 生成周报：POST /reports/projects/:projectId/weekly-report */
export async function getWeeklyReport(projectId: string, weekStart?: string): Promise<WeeklyReport> {
  return mockOr('mockGetWeeklyReport', async () => {
    const resp = await client.post<ApiResponse<WeeklyReport>>(`/reports/projects/${projectId}/weekly-report`, { weekStart })
    return resp.data.data
  }, projectId, weekStart)
}

/** 周报列表：GET /reports/projects/:projectId/weekly-reports?limit=N */
export async function listWeeklyReports(projectId: string, limit = 10): Promise<WeeklyReportList> {
  return mockOr('mockListWeeklyReports', async () => {
    const resp = await client.get<ApiResponse<WeeklyReportList>>(`/reports/projects/${projectId}/weekly-reports`, {
      params: { limit },
    })
    return resp.data.data
  }, projectId, limit)
}

/** 项目仪表盘：GET /reports/projects/:projectId/dashboard */
export async function getDashboard(projectId: string): Promise<DashboardData> {
  return mockOrMap(
    'mockGetDashboard',
    raw => ({ ...(raw as Record<string, unknown>), projectId }) as DashboardData,
    async () => {
      const resp = await client.get<ApiResponse<DashboardData>>(`/reports/projects/${projectId}/dashboard`)
      return resp.data.data
    },
    projectId,
  )
}

/** CSV 导出：GET /reports/projects/:projectId/export?format=csv（触发浏览器下载） */
export function exportCsv(projectId: string): void {
  mockOrVoid(
    // 真实环境：经 client（axios）下载 Blob；Bearer token 由请求拦截器自动注入（不再读 localStorage 裸 token）
    () => {
      const url = `/reports/projects/${encodeURIComponent(projectId)}/export?format=csv`
      client.get<Blob>(url, { responseType: 'blob' })
        .then(resp => {
          const blob = resp.data
          const downloadUrl = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = downloadUrl
          a.download = `project_${projectId}.csv`
          a.click()
          URL.revokeObjectURL(downloadUrl)
        })
        .catch(err => console.error('CSV 导出失败', err))
    },
    // mock 模式：生成 demo CSV 并下载
    () => {
      const csv = 'taskId,title,status,assignee,estimatedHours,actualHours\nt1,任务示例,done,张三,8,7.5\nt2,任务二,in_progress,李四,16,6\n'
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `project_${projectId}_demo.csv`
      a.click()
      URL.revokeObjectURL(url)
    },
  )
}

// ========== B19 重叠检测 ==========

/** 重叠检测：GET /reports/projects/:projectId/overlap */
export async function getOverlap(projectId: string, options?: { dimensions?: string; threshold?: number }): Promise<OverlapResult> {
  return mockOr('mockGetOverlap', async () => {
    const params: any = {}
    if (options?.dimensions) params.dimensions = options.dimensions
    if (options?.threshold != null) params.threshold = options.threshold
    const resp = await client.get<ApiResponse<OverlapResult>>(`/reports/projects/${projectId}/overlap`, { params })
    return resp.data.data
  }, projectId, options)
}

// 命名空间导出，兼容 import { reportApi } from '@/api/reportApi'
export const reportApi = {
  getGantt,
  getBurndown,
  getLoad,
  getPlan,
  listDependencies,
  createDependency,
  deleteDependency,
  getWeeklyReport,
  listWeeklyReports,
  getDashboard,
  exportCsv,
  getOverlap,
}