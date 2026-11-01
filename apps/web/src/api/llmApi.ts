/**
 * llmApi —— 团队 AI 模型配置（管理员）+ AI 状态 / 文本生成（全体成员）
 *
 * key 只在保存时上行一次，服务端加密存储，任何接口都只返回末 4 位；
 * 文本生成经后端 POST /ai/complete，浏览器不接触 key、不直连模型厂商。
 */
import { client } from './client'
import { mockOrValue } from './mock/dispatch'
import { ApiClientError } from './errors'
import type { ApiResponse } from '@/types'

export type LlmProviderId = 'deepseek' | 'zhipu' | 'qwen' | 'moonshot' | 'openai' | 'custom'

export interface LlmProviderPreset {
  id: LlmProviderId
  name: string
  baseUrl: string
  models: string[]
  consoleUrl?: string
}

export interface LlmConfigView {
  configured: boolean
  provider: LlmProviderId | null
  providerName: string | null
  baseUrl: string | null
  model: string | null
  keyLast4: string | null
  updatedAt: string | null
}

export interface SaveLlmConfigInput {
  provider: LlmProviderId
  baseUrl?: string
  model: string
  /** 留空 = 保留已保存的 key */
  apiKey?: string
}

export type LlmTestResult =
  | { ok: true; model: string; latencyMs: number }
  | { ok: false; kind: string; message: string }

export interface AiStatus {
  enabled: boolean
  provider: string | null
  providerName: string | null
  model: string | null
}

/** 未配置模型（后端 40910）：调用方据此回落本地规则引擎 */
export const AI_NOT_CONFIGURED = 40910

const EMPTY_CONFIG: LlmConfigView = {
  configured: false,
  provider: null,
  providerName: null,
  baseUrl: null,
  model: null,
  keyLast4: null,
  updatedAt: null,
}
const DISABLED_STATUS: AiStatus = { enabled: false, provider: null, providerName: null, model: null }

/** GET /settings/llm/providers */
export async function listLlmProviders(): Promise<LlmProviderPreset[]> {
  return mockOrValue(
    async () => (await client.get<ApiResponse<LlmProviderPreset[]>>('/settings/llm/providers')).data.data,
    () => [],
  )
}

/** GET /settings/llm（仅管理员） */
export async function getLlmConfig(): Promise<LlmConfigView> {
  return mockOrValue(async () => (await client.get<ApiResponse<LlmConfigView>>('/settings/llm')).data.data, () => EMPTY_CONFIG)
}

/** PUT /settings/llm */
export async function saveLlmConfig(input: SaveLlmConfigInput): Promise<LlmConfigView> {
  const view = await mockOrValue(
    async () => (await client.put<ApiResponse<LlmConfigView>>('/settings/llm', input)).data.data,
    () => {
      throw new ApiClientError(40001, '演示模式不支持配置真实模型')
    },
  )
  invalidateAiStatus()
  return view
}

/** DELETE /settings/llm */
export async function deleteLlmConfig(): Promise<{ removed: boolean }> {
  const out = await mockOrValue(
    async () => (await client.delete<ApiResponse<{ removed: boolean }>>('/settings/llm')).data.data,
    () => ({ removed: false }),
  )
  invalidateAiStatus()
  return out
}

/** POST /settings/llm/test：字段缺省回落已保存配置 */
export async function testLlmConfig(input: Partial<SaveLlmConfigInput>): Promise<LlmTestResult> {
  return mockOrValue(
    async () => (await client.post<ApiResponse<LlmTestResult>>('/settings/llm/test', input, { timeout: 30_000 })).data.data,
    () => ({ ok: false, kind: 'mock', message: '演示模式不发起真实模型调用' }),
  )
}

// ========== AI 状态（带短缓存，避免每次生成前都请求） ==========

const STATUS_TTL_MS = 30_000
let statusCache: { at: number; value: Promise<AiStatus> } | null = null

/** GET /ai/status（全体成员）；失败按未启用处理，不阻断页面 */
export function getAiStatus(): Promise<AiStatus> {
  if (statusCache && Date.now() - statusCache.at < STATUS_TTL_MS) return statusCache.value
  const value = mockOrValue(
    async () => (await client.get<ApiResponse<AiStatus>>('/ai/status')).data.data,
    () => DISABLED_STATUS,
  ).catch(() => DISABLED_STATUS)
  statusCache = { at: Date.now(), value }
  return value
}

/** 管理员保存/清除配置后调用，让其它页面立刻感知 */
export function invalidateAiStatus(): void {
  statusCache = null
}

/** POST /ai/complete：未配置抛 ApiClientError(40910) */
export async function aiComplete(prompt: string, system?: string): Promise<string> {
  return mockOrValue(
    async () => {
      // 后端单次模型调用上限 60s，这里留余量
      const resp = await client.post<ApiResponse<{ text: string; model: string }>>(
        '/ai/complete',
        { prompt, system },
        { timeout: 75_000 },
      )
      return resp.data.data.text
    },
    () => {
      throw new ApiClientError(AI_NOT_CONFIGURED, '演示模式未接入模型')
    },
  )
}
