/**
 * 模板库 API 封装（B19）
 */
import { client } from './client'
import { USE_MOCK } from './config'
import {
  mockListTemplates,
  mockGetTemplate,
  mockCreateTemplate,
  mockApplyTemplate,
  mockSaveAsTemplate,
} from './mock/handlers'
import type { ApiResponse } from '@/types'
import type { ProjectTemplate, TemplateApplyResult } from '@/types'

export interface TemplateListParams {
  type?: string
  keyword?: string
  isPublic?: boolean
}

export interface CreateTemplateInput {
  name: string
  description?: string
  type?: string
  category?: string
  isPublic?: boolean
  tags?: string[]
  taskSnapshot?: any[]
  dependencySnapshot?: any[]
}

export interface SaveAsTemplateInput {
  name: string
  description?: string
  isPublic?: boolean
  category?: string
  tags?: string[]
}

/** 模板列表：GET /templates */
export async function listTemplates(params: TemplateListParams = {}): Promise<ProjectTemplate[]> {
  if (USE_MOCK) return mockListTemplates(params)
  const query: any = {}
  if (params.type) query.type = params.type
  if (params.keyword) query.keyword = params.keyword
  if (params.isPublic != null) query.isPublic = String(params.isPublic)
  const resp = await client.get<ApiResponse<ProjectTemplate[]>>('/templates', { params: query })
  return resp.data.data as any
}

/** 模板详情：GET /templates/:id */
export async function getTemplate(id: string): Promise<ProjectTemplate> {
  if (USE_MOCK) return mockGetTemplate(id)
  const resp = await client.get<ApiResponse<ProjectTemplate>>(`/templates/${id}`)
  return resp.data.data
}

/** 创建模板：POST /templates */
export async function createTemplate(input: CreateTemplateInput): Promise<ProjectTemplate> {
  if (USE_MOCK) return mockCreateTemplate(input)
  const resp = await client.post<ApiResponse<ProjectTemplate>>('/templates', input)
  return resp.data.data
}

/** 更新模板：PUT /templates/:id */
export async function updateTemplate(id: string, input: Partial<CreateTemplateInput>): Promise<ProjectTemplate> {
  if (USE_MOCK) return { ...mockGetTemplate(id), ...input } as any
  const resp = await client.put<ApiResponse<ProjectTemplate>>(`/templates/${id}`, input)
  return resp.data.data
}

/** 删除模板：DELETE /templates/:id */
export async function deleteTemplate(id: string): Promise<{ id: string; deleted: boolean }> {
  if (USE_MOCK) return { id, deleted: true }
  const resp = await client.delete<ApiResponse<{ id: string; deleted: boolean }>>(`/templates/${id}`)
  return resp.data.data
}

/** 从模板创建项目：POST /templates/:id/apply */
export async function applyTemplate(id: string, input: { name: string; description?: string }): Promise<TemplateApplyResult> {
  if (USE_MOCK) return mockApplyTemplate(id, input)
  const resp = await client.post<ApiResponse<TemplateApplyResult>>(`/templates/${id}/apply`, input)
  return resp.data.data
}

/** 从项目保存为模板：POST /templates/projects/:projectId/save-as-template */
export async function saveAsTemplate(projectId: string, input: SaveAsTemplateInput): Promise<ProjectTemplate> {
  if (USE_MOCK) return mockSaveAsTemplate(projectId, input)
  const resp = await client.post<ApiResponse<ProjectTemplate>>(
    `/templates/projects/${projectId}/save-as-template`,
    input,
  )
  return resp.data.data
}

export const templateApi = {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  applyTemplate,
  saveAsTemplate,
}
