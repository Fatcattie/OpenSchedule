/**
 * AI 提案 API（B23 智能拆解排期）
 * 草稿态 + 审批门：generate → pending → apply/reject
 */
import { client } from './client'
import { mockOr } from './mock/dispatch'
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

/** 生成拆解建议（团队已配置 AI 模型时后端同步等待 AI 服务，最长约 90s，故放宽超时） */
export async function createDecompose(input: DecomposeInput): Promise<DecomposeSuggestion> {
  return mockOr('mockCreateDecompose', async () => {
    const resp = await client.post<ApiResponse<DecomposeSuggestion>>('/proposals/decompose', input, { timeout: 120_000 })
    return resp.data.data
  }, input)
}

/** 我的提案列表 */
export async function listProposals(params: ListProposalsParams = {}): Promise<ProposalListResult> {
  return mockOr('mockListProposals', async () => {
    const resp = await client.get<ApiResponse<ProposalListResult>>('/proposals', { params })
    return resp.data.data
  }, params)
}

/** 提案详情 */
export async function getProposal(id: string): Promise<DecomposeSuggestion> {
  return mockOr('mockGetProposal', async () => {
    const resp = await client.get<ApiResponse<DecomposeSuggestion>>(`/proposals/${id}`)
    return resp.data.data
  }, id)
}

/** 应用提案（确认落库） */
export async function applyProposal(id: string): Promise<ProposalApplyResult> {
  return mockOr('mockApplyProposal', async () => {
    const resp = await client.post<ApiResponse<ProposalApplyResult>>(`/proposals/${id}/apply`)
    return resp.data.data
  }, id)
}

/** 拒绝提案 */
export async function rejectProposal(id: string, reason?: string): Promise<{ id: string; status: string }> {
  return mockOr('mockRejectProposal', async () => {
    const resp = await client.post<ApiResponse<{ id: string; status: string }>>(`/proposals/${id}/reject`, { reason })
    return resp.data.data
  }, id, reason)
}