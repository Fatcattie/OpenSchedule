/**
 * calendar-adapter.ts —— 日历服务适配器
 *
 * v1 提供 Mock 实现，用于开发和测试。
 * 生产环境替换成飞书/Google/Outlook 的真实实现。
 */
import type { CalendarEventPayload } from './mapper/event-mapper'

export interface ExternalCalendarEvent {
  eventId?: string
  eventUid: string
  summary: string
  description?: string
  start: { dateTime: string; timeZone?: string } | { date: string }
  end: { dateTime: string; timeZone?: string } | { date: string }
  isAllDay: boolean
  status: 'confirmed' | 'cancelled' | 'tentative'
  openScheduleTaskId?: string
  updatedAt: Date
  etag?: string
}

export interface CalendarAdapter {
  provider: string

  /** 创建日历事件 */
  createEvent(accessToken: string, calendarId: string, event: CalendarEventPayload): Promise<{ eventId: string; eventUid: string }>

  /** 更新日历事件 */
  updateEvent(accessToken: string, calendarId: string, eventId: string, event: CalendarEventPayload): Promise<void>

  /** 删除日历事件 */
  deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void>

  /** 拉取指定时间段内的外部事件，用于双向同步 */
  listEvents(accessToken: string, calendarId: string, start: Date, end: Date): Promise<ExternalCalendarEvent[]>

  /** 获取指定时间段内的忙闲时段 */
  getFreeBusy(accessToken: string, calendarId: string, start: Date, end: Date): Promise<Array<{ start: Date; end: Date; summary?: string; status: string }>>

  /** 测试连接 */
  testConnection(accessToken: string): Promise<{ ok: boolean; error?: string }>
}

/**
 * Mock 实现 —— 生成稳定的假数据
 * 用于：本地开发、单测、UI 演示
 */
export class MockCalendarAdapter implements CalendarAdapter {
  provider = 'feishu'

  // 内部计数器，模拟事件 ID 生成
  private eventCounter = 1000
  private events = new Map<string, ExternalCalendarEvent>()

  async createEvent(
    _accessToken: string,
    _calendarId: string,
    event: CalendarEventPayload,
  ): Promise<{ eventId: string; eventUid: string }> {
    this.eventCounter++
    const eventId = `evt_${this.eventCounter}`
    const eventUid = `mock-${event.openScheduleTaskId}@openschedule.local`
    const externalEvent: ExternalCalendarEvent = {
      eventId,
      eventUid,
      summary: event.summary,
      description: event.description,
      start: event.start,
      end: event.end,
      isAllDay: event.isAllDay,
      status: event.status,
      openScheduleTaskId: event.openScheduleTaskId,
      updatedAt: new Date(),
    }
    this.events.set(eventId, externalEvent)
    return { eventId, eventUid }
  }

  async updateEvent(
    _accessToken: string,
    _calendarId: string,
    _eventId: string,
    _event: CalendarEventPayload,
  ): Promise<void> {
    const current = this.events.get(_eventId)
    if (current) {
      this.events.set(_eventId, { ...current, summary: _event.summary, description: _event.description, start: _event.start, end: _event.end, isAllDay: _event.isAllDay, status: _event.status, updatedAt: new Date() })
    }
  }

  async deleteEvent(
    _accessToken: string,
    _calendarId: string,
    _eventId: string,
  ): Promise<void> {
    this.events.delete(_eventId)
  }

  async listEvents(
    _accessToken: string,
    _calendarId: string,
    start: Date,
    end: Date,
  ): Promise<ExternalCalendarEvent[]> {
    return [...this.events.values()].filter(event => {
      const value = 'date' in event.start ? new Date(`${event.start.date}T00:00:00.000Z`) : new Date(event.start.dateTime)
      return value >= start && value <= end
    })
  }

  async getFreeBusy(
    _accessToken: string,
    _calendarId: string,
    start: Date,
    end: Date,
  ): Promise<Array<{ start: Date; end: Date; summary: string; status: string }>> {
    // 生成 mock 忙闲数据：每天上午 10-12 点和下午 14-16 点各有一个会
    const result: Array<{ start: Date; end: Date; summary: string; status: string }> = []

    const dayStart = new Date(start.getFullYear(), start.getMonth(), start.getDate())
    const dayEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate())

    let cur = new Date(dayStart)
    let idx = 0
    while (cur <= dayEnd) {
      // 上午会议 10:00-12:00
      const morningStart = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 10, 0, 0)
      const morningEnd = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 12, 0, 0)
      if (morningStart >= start && morningEnd <= end) {
        result.push({
          start: morningStart,
          end: morningEnd,
          summary: mockMeetingNames[idx % mockMeetingNames.length],
          status: 'busy',
        })
      }

      // 下午会议 14:00-15:30（每天下午开不同长度的会）
      const afternoonStart = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 14, 0, 0)
      const afternoonEnd = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 15, 30, 0)
      if (afternoonStart >= start && afternoonEnd <= end) {
        result.push({
          start: afternoonStart,
          end: afternoonEnd,
          summary: mockMeetingNames[(idx + 3) % mockMeetingNames.length],
          status: 'busy',
        })
      }

      idx++
      cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1)
    }

    return result
  }

  async testConnection(_accessToken: string): Promise<{ ok: boolean; error?: string }> {
    return { ok: true }
  }
}

const mockMeetingNames = [
  '产品评审会',
  '技术周会',
  '需求澄清',
  '代码 Review',
  '站会',
  '架构讨论',
  '对齐会',
  '复盘会',
]

/**
 * 简易 Adapter 工厂
 */
export function getCalendarAdapter(provider: string): CalendarAdapter {
  // v1 全用 mock
  return new MockCalendarAdapter()
}
