/**
 * imProvider —— 钉钉 / 飞书 统一适配层
 *
 * 设计要点：
 * 1. 浏览器不能直连 MCP，所有真实调用必须经后端 /api/v1/integrations/* 代理（见 services/api，Bearer 由 axios 拦截器注入）。
 * 2. Mock 模式下使用本地假数据，接口形状与真实实现一致，后端就绪后把 USE_MOCK 关掉即可切换。
 * 3. 事件带 provider + eventId，用于反向同步的幂等去重（同一事件不会重复生成个人计划）。
 */
import { USE_MOCK } from '@/api/config'
import { client } from '@/api/client'
import type { ApiResponse } from '@/types'

export type ImProvider = 'feishu' | 'dingtalk'

export interface ProviderMeta {
  id: ImProvider
  name: string
  /** 品牌色，用于徽章与卡片强调 */
  color: string
  features: string[]
}

export const PROVIDERS: ProviderMeta[] = [
  { id: 'feishu', name: '飞书', color: '#3370ff', features: ['日历', '消息', '审批'] },
  { id: 'dingtalk', name: '钉钉', color: '#1e7fff', features: ['日历', '消息', '待办'] },
]

export const providerMeta = (id: ImProvider): ProviderMeta =>
  PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]

/** 外部日历事件（反向同步来源） */
export interface ExternalCalendarEvent {
  /** 幂等键：provider:eventId */
  sourceRef: string
  provider: ImProvider
  eventId: string
  summary: string
  description: string | null
  startAt: string
  endAt: string
  allDay: boolean
}

/** 渠道连接状态 */
export interface IntegrationStatus {
  provider: ImProvider
  name: string
  connected: boolean
  /** 实际通道：MCP 网关 / 官方 OpenAPI / 本地 Mock */
  channel: 'mcp' | 'openapi' | 'mock'
  accountName?: string
  lastSyncAt?: string
  error?: string
}

export interface SendMessageResult {
  provider: ImProvider
  ok: boolean
  messageId?: string
  error?: string
}

// ========== Mock 数据 ==========

const iso = (dayOffset: number, hour: number) => {
  const d = new Date()
  d.setDate(d.getDate() + dayOffset)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

const MOCK_EVENTS: Record<ImProvider, ExternalCalendarEvent[]> = {
  feishu: [
    {
      sourceRef: 'feishu:evt_1001',
      provider: 'feishu',
      eventId: 'evt_1001',
      summary: '产品需求评审会',
      description: '评审 Q4 迭代需求清单，确认优先级与排期',
      startAt: iso(0, 10),
      endAt: iso(0, 11),
      allDay: false,
    },
    {
      sourceRef: 'feishu:evt_1002',
      provider: 'feishu',
      eventId: 'evt_1002',
      summary: '与设计团队对齐视觉稿',
      description: '确认新版工作台视觉规范与交付时间',
      startAt: iso(1, 14),
      endAt: iso(1, 15),
      allDay: false,
    },
    {
      sourceRef: 'feishu:evt_1003',
      provider: 'feishu',
      eventId: 'evt_1003',
      summary: '季度述职准备',
      description: '整理本季度交付成果与数据',
      startAt: iso(2, 0),
      endAt: iso(2, 23),
      allDay: true,
    },
  ],
  dingtalk: [
    {
      sourceRef: 'dingtalk:evt_2001',
      provider: 'dingtalk',
      eventId: 'evt_2001',
      summary: '项目周会',
      description: '同步各模块进度与风险，更新看板',
      startAt: iso(0, 9),
      endAt: iso(0, 10),
      allDay: false,
    },
    {
      sourceRef: 'dingtalk:evt_2002',
      provider: 'dingtalk',
      eventId: 'evt_2002',
      summary: '客户拜访（华东区）',
      description: '拜访重点客户，收集使用反馈',
      startAt: iso(1, 13),
      endAt: iso(1, 17),
      allDay: false,
    },
    {
      sourceRef: 'dingtalk:evt_2003',
      provider: 'dingtalk',
      eventId: 'evt_2003',
      summary: '技术分享：可观测性实践',
      description: '准备 30 分钟分享材料与演示环境',
      startAt: iso(3, 15),
      endAt: iso(3, 16),
      allDay: false,
    },
  ],
}

// ========== 接口 ==========

/** 拉取某渠道近期日历事件（反向同步来源；真实模式经 axios client 携带 Bearer，旧 fetch 裸路径缺 /v1 前缀且无鉴权） */
export async function listProviderEvents(provider: ImProvider): Promise<ExternalCalendarEvent[]> {
  if (USE_MOCK) return structuredClone(MOCK_EVENTS[provider] ?? [])
  const resp = await client.get<ApiResponse<ExternalCalendarEvent[]> | ExternalCalendarEvent[]>(`/integrations/${provider}/calendar/events`)
  const data = Array.isArray(resp.data) ? resp.data : resp.data.data
  return data ?? []
}

/** 查询各渠道连接状态 */
export async function listIntegrationStatus(): Promise<IntegrationStatus[]> {
  if (USE_MOCK)
    return PROVIDERS.map((p) => ({
      provider: p.id,
      name: p.name,
      connected: true,
      channel: 'mock' as const,
      accountName: `我的${p.name}日历`,
      lastSyncAt: new Date(Date.now() - 3600_000).toISOString(),
    }))
  const resp = await client.get<ApiResponse<IntegrationStatus[]> | IntegrationStatus[]>('/integrations/status')
  const data = Array.isArray(resp.data) ? resp.data : resp.data.data
  return data ?? []
}

/** 通过渠道发送 IM 消息 */
export async function sendImMessage(
  provider: ImProvider,
  payload: { targets: string[]; title: string; content: string; link?: string },
): Promise<SendMessageResult> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 400))
    return {
      provider,
      ok: true,
      messageId: `mock-${provider}-${Date.now()}`,
    }
  }
  const resp = await client.post(`/integrations/${provider}/messages`, payload)
  // integrations 控制器对 messages 直接返回 SendMessageResult（非 {data} 信封，迁移窗口兼容裸体）
  const body = (resp.data as unknown as SendMessageResult | undefined) ?? { provider, ok: true as const }
  return body
}

/** 把任务/项目推送到指定渠道日历（单向） */
export async function pushToCalendar(
  provider: ImProvider,
  payload: { taskId?: string; projectId?: string; title: string; startAt?: string; endAt?: string },
): Promise<{ ok: boolean; eventId?: string; error?: string }> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 400))
    return { ok: true, eventId: `mock-evt-${Date.now()}` }
  }
  const resp = await client.post<ApiResponse<{ eventId?: string }>>(`/integrations/${provider}/calendar/events`, payload)
  const body = resp.data && 'data' in resp.data ? (resp.data as ApiResponse<{ eventId?: string }>).data : (resp.data as { eventId?: string })
  return { ok: true, eventId: body?.eventId }
}
