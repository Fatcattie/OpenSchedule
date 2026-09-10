/**
 * AI 提案 API（B23 智能拆解排期）
 * 草稿态 + 审批门：generate → pending → apply/reject
 */
import { client } from './client'
import { USE_MOCK } from './config'
import {
  mockCreateDecompose,
  mockGetProposal,
  mockListProposals,
  mockApplyProposal,
  mockRejectProposal,
} from './mock/handlers'
import type { ApiResponse } from '@/types'
import type { DecomposeSuggestion, ProposalApplyResult } from '@/types'

export interface DecomposeInput {
  goalTitle: string
  goalDescription?: string
  relatedProjectId?: string
  templateId?: string
  totalEstimatedHours?: number
  startDate?: string
}

export interface ListProposalsParams {
  type?: string
  status?: string
  page?: number
  pageSize?: number
}

export interface ProposalListResult {
  items: DecomposeSuggestion[]
  total: number
  page: number
  pageSize: number
}

/** 生成拆解建议 */
export async function createDecompose(input: DecomposeInput): Promise<DecomposeSuggestion> {
  if (USE_MOCK) return mockCreateDecompose(input)
  const resp = await client.post<ApiResponse<DecomposeSuggestion>>('/proposals/decompose', input)
  return resp.data.data
}

/** 我的提案列表 */
export async function listProposals(params: ListProposalsParams = {}): Promise<ProposalListResult> {
  if (USE_MOCK) return mockListProposals(params)
  const resp = await client.get<ApiResponse<ProposalListResult>>('/proposals', { params })
  return resp.data.data
}

/** 提案详情 */
export async function getProposal(id: string): Promise<DecomposeSuggestion> {
  if (USE_MOCK) return mockGetProposal(id)
  const resp = await client.get<ApiResponse<DecomposeSuggestion>>(`/proposals/${id}`)
  return resp.data.data
}

/** 应用提案（确认落库） */
export async function applyProposal(id: string): Promise<ProposalApplyResult> {
  if (USE_MOCK) return mockApplyProposal(id)
  const resp = await client.post<ApiResponse<ProposalApplyResult>>(`/proposals/${id}/apply`)
  return resp.data.data
}

/** 拒绝提案 */
export async function rejectProposal(id: string, reason?: string): Promise<{ id: string; status: string }> {
  if (USE_MOCK) return mockRejectProposal(id, reason)
  const resp = await client.post<ApiResponse<{ id: string; status: string }>>(`/proposals/${id}/reject`, { reason })
  return resp.data.data
}