/**
 * IntegrationsService —— 渠道注册与统一出口
 *
 * 通道选择（按 provider 独立配置，互不影响）：
 * - INTEGRATION_FEISHU_MODE / INTEGRATION_DINGTALK_MODE = mcp | openapi | mock（默认 mock）
 * - MCP_GATEWAY_URL：MCP 网关地址；网关不可用时自动降级 Mock，保证接口不 500。
 */
import { Injectable } from '@nestjs/common'
import { McpGatewayAdapter, MockImAdapter } from './adapters/im-adapters'
import type {
  CalendarEventPayload,
  ImAdapter,
  ImChannel,
  ImProvider,
  SendMessagePayload,
} from './adapters/im-adapter.interface'

const PROVIDERS: ImProvider[] = ['feishu', 'dingtalk']

@Injectable()
export class IntegrationsService {
  private readonly adapters = new Map<ImProvider, ImAdapter>()

  constructor() {
    PROVIDERS.forEach((p) => this.adapters.set(p, this.buildAdapter(p)))
  }

  private buildAdapter(provider: ImProvider): ImAdapter {
    const key = `INTEGRATION_${provider.toUpperCase()}_MODE`
    const mode = (process.env[key] ?? 'mock') as ImChannel
    const mock = new MockImAdapter(provider, 'mock')
    if (mode === 'mcp') {
      const gateway = process.env.MCP_GATEWAY_URL
      if (gateway) return new McpGatewayAdapter(provider, gateway, mock)
    }
    // openapi 模式暂未内置实现，统一回落 Mock（保留分支便于后续接入官方 SDK）
    return mock
  }

  private adapter(provider: ImProvider): ImAdapter {
    const a = this.adapters.get(provider)
    if (!a) throw new Error(`不支持的渠道：${provider}`)
    return a
  }

  /** 渠道连接状态 */
  async status() {
    return Promise.all(
      PROVIDERS.map(async (p) => {
        const a = this.adapter(p)
        const test = await a.testConnection().catch(() => ({ ok: false, error: '连接测试异常' }))
        return {
          provider: p,
          name: p === 'feishu' ? '飞书' : '钉钉',
          connected: test.ok,
          channel: a.channel,
          accountName: test.ok ? `我的${p === 'feishu' ? '飞书' : '钉钉'}日历` : undefined,
          error: test.error,
        }
      }),
    )
  }

  /** 拉取外部日历事件（反向同步来源） */
  listEvents(provider: ImProvider, start: Date, end: Date) {
    return this.adapter(provider).listEvents(start, end)
  }

  /** 推送任务/项目为日历事件 */
  createEvent(provider: ImProvider, payload: CalendarEventPayload) {
    return this.adapter(provider).createEvent(payload)
  }

  /** 发送 IM 消息 */
  async sendMessage(provider: ImProvider, payload: SendMessagePayload) {
    const r = await this.adapter(provider).sendMessage(payload)
    return { provider, ...r }
  }
}
