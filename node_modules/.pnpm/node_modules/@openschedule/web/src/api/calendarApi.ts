/**
 * calendarApi —— 日历集成 API（B21）
 */
import { client } from './client'
import { USE_MOCK } from './config'
import {
  mockListCalendarAccounts,
  mockBindAccount,
  mockGetBusyFree,
  mockGetBatchBusyFree,
  mockListCalendarProviders,
  mockSyncTask,
  mockSyncProject,
  mockGetTaskMapping,
  mockListFeishuEvents,
} from './mock/handlers'
import type { ApiResponse } from '@/types'
import type {
  CalendarAccount,
  CalendarProvider,
  CalendarEventMapping,
  BusyFreeResult,
  BatchBusyFreeResult,
  FeishuCalendarEvent,
} from '@/types'

// ========== 账户 ==========

export async function listCalendarProviders(): Promise<CalendarProvider[]> {
  if (USE_MOCK) return mockListCalendarProviders()
  const resp = await client.get<ApiResponse<CalendarProvider[]>>('/calendar/providers')
  return resp.data.data
}

export async function listCalendarAccounts(): Promise<CalendarAccount[]> {
  if (USE_MOCK) return mockListCalendarAccounts()
  const resp = await client.get<ApiResponse<CalendarAccount[]>>('/calendar/accounts')
  return resp.data.data
}

export async function bindCalendarAccount(input: {
  provider: string
  accountName: string
  calendarId?: string
}): Promise<CalendarAccount> {
  if (USE_MOCK) return mockBindAccount(input) as any
  const resp = await client.post<ApiResponse<CalendarAccount>>('/calendar/accounts/bind', input)
  return resp.data.data
}

export async function unbindCalendarAccount(id: string): Promise<{ id: string; unbound: boolean }> {
  if (USE_MOCK) return { id, unbound: true }
  const resp = await client.delete<ApiResponse<{ id: string; unbound: boolean }>>(`/calendar/accounts/${id}`)
  return resp.data.data
}

// ========== 同步 ==========

export async function syncTask(taskId: string, accountId?: string): Promise<any> {
  if (USE_MOCK) return mockSyncTask(taskId)
  const resp = await client.post<ApiResponse<any>>(`/calendar/sync/task/${taskId}`, { accountId })
  return resp.data.data
}

export async function syncProject(projectId: string, accountId?: string): Promise<any> {
  if (USE_MOCK) return mockSyncProject(projectId)
  const resp = await client.post<ApiResponse<any>>(`/calendar/sync/project/${projectId}`, { accountId })
  return resp.data.data
}

export async function getTaskCalendarMapping(taskId: string): Promise<CalendarEventMapping[]> {
  if (USE_MOCK) return mockGetTaskMapping(taskId)
  const resp = await client.get<ApiResponse<CalendarEventMapping[]>>(`/calendar/mappings/task/${taskId}`)
  return resp.data.data
}

// ========== 忙闲 ==========

/** 拉取飞书日历近期事件（反向同步来源：同步进工作台成为个人计划） */
export async function listFeishuEvents(): Promise<FeishuCalendarEvent[]> {
  if (USE_MOCK) return mockListFeishuEvents()
  const resp = await client.get<ApiResponse<FeishuCalendarEvent[]>>('/calendar/feishu/events')
  return resp.data.data
}

export async function getBusyFree(userId: string, startDate: string, endDate: string): Promise<BusyFreeResult> {
  if (USE_MOCK) return mockGetBusyFree(userId, startDate, endDate)
  const resp = await client.get<ApiResponse<BusyFreeResult>>('/calendar/busy-free', {
    params: { userId, startDate, endDate },
  })
  return resp.data.data
}

export async function getBatchBusyFree(
  userIds: string[],
  startDate: string,
  endDate: string,
): Promise<BatchBusyFreeResult> {
  if (USE_MOCK) return mockGetBatchBusyFree(userIds, startDate, endDate)
  const resp = await client.get<ApiResponse<BatchBusyFreeResult>>('/calendar/busy-free/batch', {
    params: { userIds: userIds.join(','), startDate, endDate },
  })
  return resp.data.data
}

export const calendarApi = {
  listCalendarProviders,
  listCalendarAccounts,
  bindCalendarAccount,
  unbindCalendarAccount,
  syncTask,
  syncProject,
  getTaskCalendarMapping,
  getBusyFree,
  getBatchBusyFree,
  listFeishuEvents,
}
