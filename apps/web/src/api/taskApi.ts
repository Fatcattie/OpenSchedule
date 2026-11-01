/**
 * 职责：任务/评论 API 封装 —— 任务 CRUD、状态流转（move/complete/reopen/claim）、评论（规格 3.5.1 任务与协作）
 */
import { client } from './client'
import { mockOr } from './mock/dispatch'
import type { ApiResponse } from '@/types'
import type { PageParams, Paged } from '@/types'
import type { TaskStatus, TaskPriority } from '@/types'
import type {
  CompleteTaskInput,
  CreateCommentInput,
  CreateTaskInput,
  MoveTaskInput,
  ReopenTaskInput,
  Task,
  TaskComment,
  UpdateTaskInput,
} from '@/types'

export interface ListTasksParams extends PageParams {
  status?: TaskStatus
  priority?: TaskPriority
  assigneeId?: string
}

/** 项目任务列表：GET /projects/:id/tasks（按状态/人/优先级/截止筛选） */
export async function listProjectTasks(projectId: string, params: ListTasksParams = {}): Promise<Paged<Task>> {
  return mockOr('mockListProjectTasks', async () => {
    const resp = await client.get<ApiResponse<Task[]>>(`/projects/${projectId}/tasks`, { params })
    const items = resp.data.data
    const total = Number(resp.headers['x-total-count'] ?? items.length)
    return { items, total, page: params.page ?? 1, pageSize: params.pageSize ?? 20 }
  }, projectId, params)
}

/** 创建任务：POST /projects/:id/tasks */
export async function createTask(projectId: string, input: CreateTaskInput): Promise<Task> {
  return mockOr('mockCreateTask', async () => {
    const resp = await client.post<ApiResponse<Task>>(`/projects/${projectId}/tasks`, input)
    return resp.data.data
  }, projectId, input)
}

/** 任务详情：GET /tasks/:id */
export async function getTask(id: string): Promise<Task> {
  return mockOr('mockGetTask', async () => {
    const resp = await client.get<ApiResponse<Task>>(`/tasks/${id}`)
    return resp.data.data
  }, id)
}

/** 更新任务：PATCH /tasks/:id（必须携带 version 乐观锁，冲突 40901） */
export async function updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
  return mockOr('mockUpdateTask', async () => {
    const resp = await client.patch<ApiResponse<Task>>(`/tasks/${id}`, input)
    return resp.data.data
  }, id, input)
}

/** 看板移动/状态流转：POST /tasks/:id/move（{status?, column_id?, sort_order?, version}，乐观锁 40901 / 非法迁移 40902） */
export async function moveTask(id: string, input: MoveTaskInput): Promise<Task> {
  return mockOr('mockMoveTask', async () => {
    const resp = await client.post<ApiResponse<Task>>(`/tasks/${id}/move`, input)
    return resp.data.data
  }, id, input)
}

/** 领取：POST /tasks/:id/claim（assignee 空 → 我，先到先得 A5；T1 领取即开始） */
export async function claimTask(id: string, version: number): Promise<Task> {
  return mockOr('mockClaimTask', async () => {
    const resp = await client.post<ApiResponse<Task>>(`/tasks/${id}/claim`, { version })
    return resp.data.data
  }, id)
}

/** 完成：POST /tasks/:id/complete（T4：actual_hours 必填，落 completed_at/actual_hours，★D3 采集口） */
export async function completeTask(id: string, input: CompleteTaskInput, version: number): Promise<Task> {
  return mockOr('mockCompleteTask', async () => {
    const resp = await client.post<ApiResponse<Task>>(`/tasks/${id}/complete`, { ...input, version })
    return resp.data.data
  }, id, input)
}

/** 重开：POST /tasks/:id/reopen（T9：重开原因必填） */
export async function reopenTask(id: string, reason: string, version: number): Promise<Task> {
  const input: ReopenTaskInput = { reason, version }
  return mockOr('mockReopenTask', async () => {
    const resp = await client.post<ApiResponse<Task>>(`/tasks/${id}/reopen`, input)
    return resp.data.data
  }, id, input)
}

/** 评论列表：GET /tasks/:id/comments */
export async function listComments(taskId: string): Promise<Paged<TaskComment>> {
  return mockOr('mockListComments', async () => {
    const resp = await client.get<ApiResponse<TaskComment[]>>(`/tasks/${taskId}/comments`)
    const items = resp.data.data
    const total = Number(resp.headers['x-total-count'] ?? items.length)
    return { items, total, page: 1, pageSize: total }
  }, taskId)
}

/** 发评论：POST /tasks/:id/comments（@提及自动解析，Phase 2 渲染） */
export async function createComment(taskId: string, input: CreateCommentInput): Promise<TaskComment> {
  return mockOr('mockCreateComment', async () => {
    const resp = await client.post<ApiResponse<TaskComment>>(`/tasks/${taskId}/comments`, input)
    return resp.data.data
  }, taskId, input)
}

// 命名空间导出，兼容 import { taskApi } from '@/api/taskApi'
export const taskApi = { listProjectTasks, createTask, getTask, updateTask, moveTask, claimTask, completeTask, reopenTask, listComments, createComment }