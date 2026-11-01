/**
 * 职责：智能评估 API 封装 —— 我的画像 / 项目成员工时统计 / 任务智能推荐 / 我的工时统计（契约 B17）
 */
import { client } from './client'
import { mockOr } from './mock/dispatch'
import type { ApiResponse } from '@/types'
import type {
  MemberProfile,
  MembersStatsResult,
  MyStatsResult,
  RecommendationResult,
  UpdateProfileInput,
} from '@/types'

/** 我的画像：GET /evaluations/me/profile（含 stats：完成率/准时率/负载） */
export async function getMyProfile(): Promise<MemberProfile> {
  return mockOr('mockGetMyProfile', async () => {
    const resp = await client.get<ApiResponse<MemberProfile>>('/evaluations/me/profile')
    return resp.data.data
  })
}

/** 更新我的画像（upsert member_profile）：PUT /evaluations/me/profile */
export async function updateMyProfile(input: UpdateProfileInput): Promise<MemberProfile> {
  return mockOr('mockUpdateMyProfile', async () => {
    const resp = await client.put<ApiResponse<MemberProfile>>('/evaluations/me/profile', input)
    return resp.data.data
  }, input)
}

/** 项目成员工时统计：GET /evaluations/projects/:projectId/members/stats?days=N（默认 30，上限 365） */
export async function getMembersStats(projectId: string, days = 30): Promise<MembersStatsResult> {
  return mockOr('mockGetMembersStats', async () => {
    const resp = await client.get<ApiResponse<MembersStatsResult>>(`/evaluations/projects/${projectId}/members/stats`, {
      params: { days },
    })
    return resp.data.data
  }, projectId, days)
}

/** 任务智能推荐：POST /evaluations/tasks/:taskId/recommend（只建议不指派） */
export async function getTaskRecommendation(taskId: string): Promise<RecommendationResult> {
  return mockOr('mockGetTaskRecommendation', async () => {
    const resp = await client.post<ApiResponse<RecommendationResult>>(`/evaluations/tasks/${taskId}/recommend`)
    return resp.data.data
  }, taskId)
}

/** 我的工时统计：GET /evaluations/me/stats?days=N（entries 按天聚合 time_entries） */
export async function getMyStats(days = 30): Promise<MyStatsResult> {
  return mockOr('mockGetMyStats', async () => {
    const resp = await client.get<ApiResponse<MyStatsResult>>('/evaluations/me/stats', {
      params: { days },
    })
    return resp.data.data
  }, days)
}

// 命名空间导出，兼容 import { evaluationApi } from '@/api/evaluationApi'
export const evaluationApi = {
  getMyProfile,
  updateMyProfile,
  getMembersStats,
  getTaskRecommendation,
  getMyStats,
}