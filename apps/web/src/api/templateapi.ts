/**
 * 模板库 API 封装（B19）
 */
import { client } from './client'
import { mockOr, mockOrMap, mockOrValue } from './mock/dispatch'
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
  return mockOr('mockListTemplates', async () => {
    const query: any = {}
    if (params.type) query.type = params.type
    if (params.keyword) query.keyword = params.keyword
    if (params.isPublic != null) query.isPublic = String(params.isPublic)
    const resp = await client.get<ApiResponse<ProjectTemplate[]>>('/templates', { params: query })
    return resp.data.data as any
  }, params)
}

/** 模板详情：GET /templates/:id */
export async function getTemplate(id: string): Promise<ProjectTemplate> {
  return mockOr('mockGetTemplate', async () => {
    const resp = await client.get<ApiResponse<ProjectTemplate>>(`/templates/${id}`)
    return resp.data.data
  }, id)
}

/** 创建模板：POST /templates */
export async function createTemplate(input: CreateTemplateInput): Promise<ProjectTemplate> {
  return mockOr('mockCreateTemplate', async () => {
    const resp = await client.post<ApiResponse<ProjectTemplate>>('/templates', input)
    return resp.data.data
  }, input)
}

/** 更新模板：PUT /templates/:id */
export async function updateTemplate(id: string, input: Partial<CreateTemplateInput>): Promise<ProjectTemplate> {
  return mockOrMap(
    'mockGetTemplate',
    raw => ({ ...(raw as Record<string, unknown>), ...input }) as ProjectTemplate,
    async () => {
      const resp = await client.put<ApiResponse<ProjectTemplate>>(`/templates/${id}`, input)
      return resp.data.data
    },
    id,
  )
}

/** 删除模板：DELETE /templates/:id */
export async function deleteTemplate(id: string): Promise<{ id: string; deleted: boolean }> {
  return mockOrValue(
    async () => {
      const resp = await client.delete<ApiResponse<{ id: string; deleted: boolean }>>(`/templates/${id}`)
      return resp.data.data
    },
    () => ({ id, deleted: true }),
  )
}

/** 从模板创建项目：POST /templates/:id/apply */
export async function applyTemplate(id: string, input: { name: string; description?: string }): Promise<TemplateApplyResult> {
  return mockOr('mockApplyTemplate', async () => {
    const resp = await client.post<ApiResponse<TemplateApplyResult>>(`/templates/${id}/apply`, input)
    return resp.data.data
  }, id, input)
}

/** 从项目保存为模板：POST /templates/projects/:projectId/save-as-template */
export async function saveAsTemplate(projectId: string, input: SaveAsTemplateInput): Promise<ProjectTemplate> {
  return mockOr('mockSaveAsTemplate', async () => {
    const resp = await client.post<ApiResponse<ProjectTemplate>>(
      `/templates/projects/${projectId}/save-as-template`,
      input,
    )
    return resp.data.data
  }, projectId, input)
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