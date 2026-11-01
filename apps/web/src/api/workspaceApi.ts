/**
 * 职责：协作工作台存储 API（D-07 一期：GET/PUT /workspace/:collection）
 * 仅真实模式使用；mock 模式下工作台仍走 localStorage（见 hooks/useWorkspaceState）。
 */
import { client } from './client'
import type { ApiResponse } from '@/types'

export interface WorkspaceEntryDto {
  key: string
  data: unknown
  version: number
}

export interface WorkspaceBatchInput {
  upserts?: { key: string; data: unknown; baseVersion?: number | null }[]
  deletes?: { key: string; baseVersion: number }[]
}

export interface WorkspaceBatchResult {
  items: { key: string; version: number }[]
  deleted: string[]
}

/** 通讯录条目（全员可读；manager = 租户 owner/admin） */
export interface DirectoryMember {
  id: string
  displayName: string
  avatarUrl: string | null
  role: 'manager' | 'member' | 'viewer'
}

export interface ReviewTaskInput {
  action: 'approve' | 'reject' | 'withdraw'
  opinion: 'agree' | 'reject' | 'rework' | 'other'
  reason?: string
}

export interface ReviewTaskResult {
  taskId: string
  action: ReviewTaskInput['action']
  approvalStatus: string | null
  generated: number
  sopArchived: boolean
}

export async function getWorkspaceDirectory(): Promise<DirectoryMember[]> {
  const response = await client.get<ApiResponse<{ items: DirectoryMember[] }>>('/workspace/directory')
  return response.data.data.items
}

/** 审核命令（D-07 二期）：通过/驳回/撤回待审任务，全部副作用与审核留痕由服务端执行 */
export async function reviewWorkspaceTask(taskId: string, input: ReviewTaskInput): Promise<ReviewTaskResult> {
  const response = await client.post<ApiResponse<ReviewTaskResult>>(
    `/workspace/tasks/${encodeURIComponent(taskId)}/review`,
    input,
  )
  return response.data.data
}

export async function listWorkspaceItems(collection: string): Promise<WorkspaceEntryDto[]> {
  const response = await client.get<ApiResponse<{ items: WorkspaceEntryDto[] }>>(`/workspace/${encodeURIComponent(collection)}`)
  return response.data.data.items
}

export async function applyWorkspaceBatch(collection: string, input: WorkspaceBatchInput): Promise<WorkspaceBatchResult> {
  const response = await client.put<ApiResponse<WorkspaceBatchResult>>(`/workspace/${encodeURIComponent(collection)}`, input, {
    timeout: 60_000,
  })
  return response.data.data
}
