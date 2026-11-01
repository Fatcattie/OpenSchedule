/**
 * calendarApi —— 日历集成 API（B21）
 */
import { client } from './client'
import { mockOr, mockOrValue } from './mock/dispatch'
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
  return mockOr('mockListCalendarProviders', async () => {
    const resp = await client.get<ApiResponse<CalendarProvider[]>>('/calendar/providers')
    return resp.data.data
  })
}

export async function listCalendarAccounts(): Promise<CalendarAccount[]> {
  return mockOr('mockListCalendarAccounts', async () => {
    const resp = await client.get<ApiResponse<CalendarAccount[]>>('/calendar/accounts')
    return resp.data.data
  })
}

export async function bindCalendarAccount(input: {
  provider: string
  accountName: string
  calendarId?: string
}): Promise<CalendarAccount> {
  return mockOr('mockBindAccount', async () => {
    const resp = await client.post<ApiResponse<CalendarAccount>>('/calendar/accounts/bind', input)
    return resp.data.data
  }, input)
}

export async function unbindCalendarAccount(id: string): Promise<{ id: string; unbound: boolean }> {
  return mockOrValue(
    async () => {
      const resp = await client.delete<ApiResponse<{ id: string; unbound: boolean }>>(`/calendar/accounts/${id}`)
      return resp.data.data
    },
    () => ({ id, unbound: true }),
  )
}

// ========== 同步 ==========

export async function syncTask(taskId: string, accountId?: string): Promise<any> {
  return mockOr('mockSyncTask', async () => {
    const resp = await client.post<ApiResponse<any>>(`/calendar/sync/task/${taskId}`, { accountId })
    return resp.data.data
  }, taskId)
}

export async function syncProject(projectId: string, accountId?: string): Promise<any> {
  return mockOr('mockSyncProject', async () => {
    const resp = await client.post<ApiResponse<any>>(`/calendar/sync/project/${projectId}`, { accountId })
    return resp.data.data
  }, projectId)
}

export async function getTaskCalendarMapping(taskId: string): Promise<CalendarEventMapping[]> {
  return mockOr('mockGetTaskMapping', async () => {
    const resp = await client.get<ApiResponse<CalendarEventMapping[]>>(`/calendar/mappings/task/${taskId}`)
    return resp.data.data
  }, taskId)
}

// ========== 忙闲 ==========

/** 拉取飞书日历近期事件（反向同步来源：同步进工作台成为个人计划） */
export async function listFeishuEvents(): Promise<FeishuCalendarEvent[]> {
  return mockOr('mockListFeishuEvents', async () => {
    const resp = await client.get<ApiResponse<FeishuCalendarEvent[]>>('/calendar/feishu/events')
    return resp.data.data
  })
}

export async function getBusyFree(userId: string, startDate: string, endDate: string): Promise<BusyFreeResult> {
  return mockOr('mockGetBusyFree', async () => {
    const resp = await client.get<ApiResponse<BusyFreeResult>>('/calendar/busy-free', {
      params: { userId, startDate, endDate },
    })
    return resp.data.data
  }, userId, startDate, endDate)
}

export async function getBatchBusyFree(
  userIds: string[],
  startDate: string,
  endDate: string,
): Promise<BatchBusyFreeResult> {
  return mockOr('mockGetBatchBusyFree', async () => {
    const resp = await client.get<ApiResponse<BatchBusyFreeResult>>('/calendar/busy-free/batch', {
      params: { userIds: userIds.join(','), startDate, endDate },
    })
    return resp.data.data
  }, userIds, startDate, endDate)
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