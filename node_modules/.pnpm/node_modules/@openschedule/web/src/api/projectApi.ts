/**
 * 职责：项目 API 封装 —— GET/POST /projects、GET/PATCH/DELETE /projects/:id、POST /projects/:id/archive（规格 3.5.1）
 */
import { client } from './client'
import { USE_MOCK } from './config'
import { mockArchiveProject, mockCreateProject, mockGetProject, mockListProjects, mockUpdateProject } from './mock/handlers'
import type { ApiResponse } from '@/types'
import type { PageParams, Paged } from '@/types'
import type { CreateProjectInput, Project, UpdateProjectInput } from '@/types'

/** 项目列表：GET /projects（分页；总数取响应头 X-Total-Count，规格 3.1） */
export async function listProjects(params: PageParams = {}): Promise<Paged<Project>> {
  if (USE_MOCK) return mockListProjects(params)
  const resp = await client.get<ApiResponse<Project[]>>('/projects', { params })
  const items = resp.data.data
  const total = Number(resp.headers['x-total-count'] ?? items.length)
  return { items, total, page: params.page ?? 1, pageSize: params.pageSize ?? 20 }
}

/** 创建项目：POST /projects（创建者自动成为项目负责人，规格 3.4） */
export async function createProject(input: CreateProjectInput): Promise<Project> {
  if (USE_MOCK) return mockCreateProject(input)
  const resp = await client.post<ApiResponse<Project>>('/projects', input)
  return resp.data.data
}

/** 项目详情：GET /projects/:id */
export async function getProject(id: string): Promise<Project> {
  if (USE_MOCK) return mockGetProject(id)
  const resp = await client.get<ApiResponse<Project>>(`/projects/${id}`)
  return resp.data.data
}

/** 更新项目：PATCH /projects/:id */
export async function updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
  if (USE_MOCK) return mockUpdateProject(id, input)
  const resp = await client.patch<ApiResponse<Project>>(`/projects/${id}`, input)
  return resp.data.data
}

/** 归档项目：POST /projects/:id/archive（与删除语义分离，规格 3.5.1） */
export async function archiveProject(id: string): Promise<Project> {
  if (USE_MOCK) return mockArchiveProject(id)
  const resp = await client.post<ApiResponse<Project>>(`/projects/${id}/archive`)
  return resp.data.data
}

// 命名空间导出，兼容 import { projectApi } from '@/api/projectApi'
export const projectApi = { listProjects, getProject, createProject, updateProject, archiveProject }
