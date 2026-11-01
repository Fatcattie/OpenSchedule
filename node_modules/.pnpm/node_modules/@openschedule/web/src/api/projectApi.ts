/**
 * 职责：项目 API 封装 —— 项目 CRUD（规格 3.5.1 项目）
 */
import { client } from './client'
import { mockOr } from './mock/dispatch'
import type { ApiResponse } from '@/types'
import type { CreateProjectInput, Project, UpdateProjectInput } from '@/types'
import type { PageParams, Paged } from '@/types'

export interface ListProjectsParams extends PageParams {
  status?: 'active' | 'archived'
}

/** 项目列表：GET /projects */
export async function listProjects(params: ListProjectsParams = {}): Promise<Paged<Project>> {
  return mockOr('mockListProjects', async () => {
    const resp = await client.get<ApiResponse<Project[]>>('/projects', { params })
    return { items: resp.data.data, total: resp.data.data.length, page: params.page ?? 1, pageSize: params.pageSize ?? 20 }
  }, params)
}

/** 创建项目：POST /projects */
export async function createProject(input: CreateProjectInput): Promise<Project> {
  return mockOr('mockCreateProject', async () => {
    const resp = await client.post<ApiResponse<Project>>('/projects', input)
    return resp.data.data
  }, input)
}

/** 项目详情：GET /projects/:id */
export async function getProject(id: string): Promise<Project> {
  return mockOr('mockGetProject', async () => {
    const resp = await client.get<ApiResponse<Project>>(`/projects/${id}`)
    return resp.data.data
  }, id)
}

/** 更新项目：PATCH /projects/:id */
export async function updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
  return mockOr('mockUpdateProject', async () => {
    const resp = await client.patch<ApiResponse<Project>>(`/projects/${id}`, input)
    return resp.data.data
  }, id, input)
}

/** 归档项目：POST /projects/:id/archive */
export async function archiveProject(id: string): Promise<Project> {
  return mockOr('mockArchiveProject', async () => {
    const resp = await client.post<ApiResponse<Project>>(`/projects/${id}/archive`)
    return resp.data.data
  }, id)
}

export const projectApi = { listProjects, createProject, getProject, updateProject, archiveProject }