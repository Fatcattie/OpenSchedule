/**
 * healthApi.ts —— 项目健康度 & 临期保障 API
 */
import { client } from './client'
import { USE_MOCK } from './config'
import type {
  HealthScore,
  HealthRisk,
  PortfolioHealth,
  EmergencySuggestion,
} from '@/types'

// ==================== Mock ====================
import {
  mockGetProjectHealth,
  mockGetProjectRisks,
  mockGetPortfolioHealth,
  mockGenerateEmergency,
} from './mock/handlers'

// Mock 开关统一由 config.ts 管理（默认开启，除非显式 VITE_USE_MOCK=false）

// ==================== API ====================

/** 获取项目健康度 */
export async function getProjectHealth(projectId: string): Promise<HealthScore> {
  if (USE_MOCK) return mockGetProjectHealth(projectId)
  const { data } = await client.get<HealthScore>(`/health/projects/${projectId}/score`)
  return data
}

/** 获取项目风险清单 */
export async function getProjectRisks(projectId: string): Promise<HealthRisk[]> {
  if (USE_MOCK) return mockGetProjectRisks(projectId)
  const { data } = await client.get<HealthRisk[]>(`/health/projects/${projectId}/risks`)
  return data
}

/** 获取组合健康度概览 */
export async function getPortfolioHealth(): Promise<PortfolioHealth> {
  if (USE_MOCK) return mockGetPortfolioHealth()
  const { data } = await client.get<PortfolioHealth>('/health/portfolio')
  return data
}

/** 生成应急建议 */
export async function generateEmergency(projectId: string): Promise<EmergencySuggestion> {
  if (USE_MOCK) return mockGenerateEmergency(projectId)
  const { data } = await client.post<EmergencySuggestion>(
    `/health/projects/${projectId}/emergency/generate`,
    {},
  )
  return data
}