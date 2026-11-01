import { client } from './client'
import type { ApiResponse, Paged } from '@/types'

export interface NotificationItem {
  id: string
  type: string
  title: string
  body: string | null
  data: Record<string, unknown> | null
  status: 'pending' | 'sent' | 'failed' | 'read'
  createdAt: string
  readAt: string | null
}

export interface NotificationPage extends Paged<NotificationItem> {
  unreadCount: number
}

export interface NotificationPreference {
  id: string | null
  eventType: string
  channels: { email?: boolean; push?: boolean; im?: boolean }
  quietHours: unknown
}

export async function listNotifications(unreadOnly = false): Promise<NotificationPage> {
  const response = await client.get<ApiResponse<NotificationItem[]>>('/notifications', { params: { unreadOnly, page: 1, pageSize: 50 } })
  const items = response.data.data
  const meta = response.data.meta as { total?: number; unreadCount?: number } | undefined
  return { items, total: meta?.total ?? items.length, page: 1, pageSize: 50, unreadCount: meta?.unreadCount ?? items.filter((item) => item.status !== 'read').length }
}

export async function markNotificationRead(id: string, read = true): Promise<NotificationItem> {
  const response = await client.patch<ApiResponse<NotificationItem>>(`/notifications/${id}/read`, { read })
  return response.data.data
}

export async function markAllNotificationsRead(): Promise<{ updated: number }> {
  const response = await client.post<ApiResponse<{ updated: number }>>('/notifications/read-all')
  return response.data.data
}

export async function getNotificationPreferences(): Promise<NotificationPreference[]> {
  const response = await client.get<ApiResponse<NotificationPreference[]>>('/notifications/preferences')
  return response.data.data
}

export async function updateNotificationPreferences(input: {
  eventType?: string
  channels: { email?: boolean; push?: boolean; im?: boolean }
  quietHours?: unknown
}): Promise<NotificationPreference> {
  const response = await client.put<ApiResponse<NotificationPreference>>('/notifications/preferences', input)
  return response.data.data
}
