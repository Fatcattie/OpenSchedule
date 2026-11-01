/**
 * resourcePoolApi.ts —— 跨项目资源池 API
 */
import { client } from './client'
import { mockOr } from './mock/dispatch'
import type {
  ResourcePoolOverview,
  PoolResourceConflict,
  ResourceMember,
  ResourceMatrix,
  RebalanceSuggestion,
} from '@/types'

// ==================== API ====================

/** 资源池概览 */
export async function getResourcePoolOverview(projectIds?: string[]): Promise<ResourcePoolOverview> {
  return mockOr('mockGetResourcePoolOverview', async () => {
    const params = projectIds?.length ? { projectIds: projectIds.join(',') } : {}
    const { data } = await client.get<ResourcePoolOverview>('/resource-pool/overview', { params })
    return data
  })
}

/** 单个成员详情 */
export async function getResourceMember(assigneeId: string): Promise<ResourceMember | null> {
  return mockOr('mockGetResourceMember', async () => {
    const { data } = await client.get<{ data: ResourceMember | null }>(`/resource-pool/member/${assigneeId}`)
    return data.data
  }, assigneeId)
}

/** 冲突清单 */
export async function getResourceConflicts(projectIds?: string[]): Promise<PoolResourceConflict[]> {
  return mockOr('mockGetResourceConflicts', async () => {
    const params = projectIds?.length ? { projectIds: projectIds.join(',') } : {}
    const { data } = await client.get<{ data: PoolResourceConflict[] }>('/resource-pool/conflicts', { params })
    return data.data
  })
}

/** 成员×项目矩阵 */
export async function getResourceMatrix(projectIds?: string[]): Promise<ResourceMatrix> {
  return mockOr('mockGetResourceMatrix', async () => {
    const params = projectIds?.length ? { projectIds: projectIds.join(',') } : {}
    const { data } = await client.get<ResourceMatrix>('/resource-pool/matrix', { params })
    return data
  })
}

/** 生成再平衡建议 */
export async function generateRebalance(projectIds?: string[]): Promise<RebalanceSuggestion> {
  return mockOr('mockGenerateRebalance', async () => {
    const params = projectIds?.length ? { projectIds: projectIds.join(',') } : {}
    const { data } = await client.post<RebalanceSuggestion>('/resource-pool/rebalance', {}, { params })
    return data
  })
}