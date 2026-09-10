/**
 * IM 渠道适配器契约
 *
 * 所有渠道（飞书 / 钉钉）统一实现该接口，上层 Service 只依赖接口，
 * 便于在 MCP 网关、官方 OpenAPI、Mock 三种实现间切换而不影响业务代码。
 */
export type ImProvider = 'feishu' | 'dingtalk'
/** 实际通道：MCP 网关 / 官方 OpenAPI / 本地 Mock */
export type ImChannel = 'mcp' | 'openapi' | 'mock'

export interface ExternalEvent {
  /** 幂等键：provider:eventId */
  sourceRef: string
  eventId: string
  summary: string
  description: string | null
  startAt: string
  endAt: string
  allDay: boolean
}

export interface CalendarEventPayload {
  title: string
  description?: string
  startAt: string
  endAt: string
  allDay?: boolean
  /** 关联的 OpenSchedule 任务/项目，用于回写映射 */
  taskId?: string
  projectId?: string
}

export interface SendMessagePayload {
  targets: string[]
  title: string
  content: string
  link?: string
}

export interface SendMessageResult {
  ok: boolean
  messageId?: string
  error?: string
}

export interface ConnectionTestResult {
  ok: boolean
  error?: string
}

export interface ImAdapter {
  readonly provider: ImProvider
  readonly channel: ImChannel
  /** 拉取指定时间窗口内的外部日历事件（反向同步来源） */
  listEvents(start: Date, end: Date): Promise<ExternalEvent[]>
  /** 推送任务/项目为日历事件（单向） */
  createEvent(payload: CalendarEventPayload): Promise<{ eventId: string }>
  /** 发送 IM 消息 */
  sendMessage(payload: SendMessagePayload): Promise<SendMessageResult>
  /** 测试连接，用于界面展示渠道状态 */
  testConnection(): Promise<ConnectionTestResult>
}
