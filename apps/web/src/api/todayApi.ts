import { client } from './client'
import { USE_MOCK } from './config'
import { mockGetToday } from './mock/handlers'
import type { ApiResponse } from '@/types'

export interface TodayItem {
  id: string
  title: string
  type: 'team' | 'personal'
  status: string
  priority: string
  dueAt: string | null
  projectId: string | null
}

export async function getToday(limit = 50): Promise<TodayItem[]> {
  if (USE_MOCK) return mockGetToday(limit)
  const response = await client.get<ApiResponse<TodayItem[]>>('/me/today', { params: { limit } })
  return response.data.data
}
