/**
 * 职责：导入导出 API 封装 —— POST /import/tasks?project_id=（CSV 批量建任务，部分成功语义）、GET /export/tasks（下载 CSV blob）
 * 契约（以后端为准）：projectId 走 URL query 参数（project_id，必填），FormData 只传 file；
 * 响应 {imported, failed, errors:[{line,reason}], created}，line=CSV 物理行号（表头=第 1 行，首数据行=第 2 行）。
 */
import { client } from './client'
import { mockOr } from './mock/dispatch'
import type { ApiResponse } from '@/types'

/** 导入失败明细（line 为 CSV 物理行号：表头=第 1 行，首数据行=第 2 行） */
export interface ImportErrorRow {
  line: number
  reason: string
}

/** 导入创建成功的任务摘要（后端返回 created[]，前端仅取展示所需字段） */
export interface ImportedTask {
  id: string
  title: string
}

/** 导入结果（partial success：失败行不影响已成功行落库） */
export interface ImportResult {
  imported: number // 成功导入行数
  failed: number // 失败行数
  errors: ImportErrorRow[]
  created: ImportedTask[]
}

/**
 * CSV 导入任务：POST /import/tasks?project_id=（multipart/form-data 仅传 file；projectId 必填，走 query 参数）
 * 后端契约：表头 title,description,priority,due_at,estimated_hours,tags,assignee_email
 * priority 取值 urgent/high/medium/low；due_at 为 ISO8601；非法行进 errors 明细（line=物理行号）
 */
export async function importTasksCsv(file: File, projectId: string): Promise<ImportResult> {
  return mockOr('mockImportTasksCsv', async () => {
    const form = new FormData()
    form.append('file', file)
    const resp = await client.post<ApiResponse<ImportResult>>('/import/tasks', form, {
      params: { project_id: projectId },
    })
    return resp.data.data
  }, file, projectId)
}

/**
 * 导出任务 CSV：GET /export/tasks?project_id=（响应为 text/csv blob）
 * 说明：API 层返回 Blob，页面侧用 downloadBlob 触发下载，便于 mock 分支形态对齐
 */
export async function exportTasksCsv(projectId?: string): Promise<Blob> {
  return mockOr('mockExportTasksCsv', async () => {
    const resp = await client.get<Blob>('/export/tasks', {
      params: projectId ? { project_id: projectId } : undefined,
      responseType: 'blob',
    })
    return resp.data
  }, projectId)
}

/** 触发浏览器下载 blob（a[download] 方案：兼容性好、不经过路由） */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}