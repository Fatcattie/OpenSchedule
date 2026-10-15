/**
 * 适配器实现：
 * - MockImAdapter：本地开发 / UI 演示 / 单测使用，返回稳定假数据。
 * - McpGatewayAdapter：通过 MCP 网关转发真实调用（浏览器与前端均不直连 MCP，统一由后端出口）。
 *
 * 选择逻辑见 integrations.service.ts：按环境变量决定通道，MCP 不可用时自动降级 Mock。
 */
import type {
  CalendarEventPayload,
  ConnectionTestResult,
  ExternalEvent,
  ImAdapter,
  ImChannel,
  ImProvider,
  SendMessagePayload,
  SendMessageResult,
} from './im-adapter.interface'

/** Mock 适配器：任何渠道都可实例化，生成确定性假数据 */
export class MockImAdapter implements ImAdapter {
  constructor(
    readonly provider: ImProvider,
    readonly channel: ImChannel = 'mock',
  ) {}

  async listEvents(start: Date, end: Date): Promise<ExternalEvent[]> {
    const base = new Date(start)
    return [0, 1, 2].map((i) => {
      const s = new Date(base)
      s.setDate(s.getDate() + i)
      s.setHours(10 + i, 0, 0, 0)
      const e = new Date(s)
      e.setHours(s.getHours() + 1)
      return {
        sourceRef: `${this.provider}:mock_evt_${i}`,
        eventId: `mock_evt_${i}`,
        summary: `${this.provider === 'feishu' ? '飞书' : '钉钉'}示例事件 ${i + 1}`,
        description: '来自 Mock 适配器的示例事件',
        startAt: s.toISOString(),
        endAt: e.toISOString(),
        allDay: false,
      }
    }).filter((ev) => new Date(ev.startAt) <= end)
  }

  async createEvent(payload: CalendarEventPayload): Promise<{ eventId: string }> {
    return { eventId: `mock_${this.provider}_${Date.now()}` }
  }

  async sendMessage(payload: SendMessagePayload): Promise<SendMessageResult> {
    return { ok: true, messageId: `mock_msg_${this.provider}_${Date.now()}` }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return { ok: true }
  }
}

/** MCP 网关适配器：把调用转发给内部 MCP 网关，由网关持有钉钉/飞书的凭证与协议实现 */
export class McpGatewayAdapter implements ImAdapter {
  constructor(
    readonly provider: ImProvider,
    private readonly gatewayUrl: string,
    private readonly fallback: ImAdapter,
  ) {
    this.channel = 'mcp'
  }

  readonly channel: ImChannel

  private async post<T>(path: string, body: unknown): Promise<T | null> {
    try {
      const resp = await fetch(`${this.gatewayUrl}/mcp/${this.provider}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!resp.ok) return null
      return (await resp.json()) as T
    } catch {
      // 网关不可用时交由调用方降级
      return null
    }
  }

  async listEvents(start: Date, end: Date): Promise<ExternalEvent[]> {
    const r = await this.post<{ events?: ExternalEvent[] }>('/calendar/events', {
      start: start.toISOString(),
      end: end.toISOString(),
    })
    if (!r?.events) return this.fallback.listEvents(start, end)
    return r.events
  }

  async createEvent(payload: CalendarEventPayload): Promise<{ eventId: string }> {
    const r = await this.post<{ eventId?: string }>('/calendar/events/create', payload)
    return r?.eventId ? { eventId: r.eventId } : this.fallback.createEvent(payload)
  }

  async sendMessage(payload: SendMessagePayload): Promise<SendMessageResult> {
    const r = await this.post<SendMessageResult>('/messages', payload)
    return r ?? this.fallback.sendMessage(payload)
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const r = await this.post<ConnectionTestResult>('/ping', {})
    return r ?? { ok: false, error: 'MCP 网关不可达' }
  }
}
