/**
 * healthApi.ts —— 项目健康度 & 临期保障 API
 */
import { client } from './client'
import { mockOr } from './mock/dispatch'
import type {
  HealthScore,
  HealthRisk,
  PortfolioHealth,
  EmergencySuggestion,
} from '@/types'

// ==================== API ====================

/** 获取项目健康度 */
export async function getProjectHealth(projectId: string): Promise<HealthScore> {
  return mockOr('mockGetProjectHealth', async () => {
    const { data } = await client.get<HealthScore>(`/health/projects/${projectId}/score`)
    return data
  }, projectId)
}

/** 获取项目风险清单 */
export async function getProjectRisks(projectId: string): Promise<HealthRisk[]> {
  return mockOr('mockGetProjectRisks', async () => {
    const { data } = await client.get<HealthRisk[]>(`/health/projects/${projectId}/risks`)
    return data
  }, projectId)
}

/** 获取组合健康度概览 */
export async function getPortfolioHealth(): Promise<PortfolioHealth> {
  return mockOr('mockGetPortfolioHealth', async () => {
    const { data } = await client.get<PortfolioHealth>('/health/portfolio')
    return data
  })
}

/** 生成应急建议 */
export async function generateEmergency(projectId: string): Promise<EmergencySuggestion> {
  return mockOr('mockGenerateEmergency', async () => {
    const { data } = await client.post<EmergencySuggestion>(
      `/health/projects/${projectId}/emergency/generate`,
      {},
    )
    return data
  }, projectId)
}