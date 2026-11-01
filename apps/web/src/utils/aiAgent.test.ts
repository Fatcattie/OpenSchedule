/**
 * llmApi：AI 状态短缓存与失效、失败按未启用处理、文本生成走后端且放宽超时；
 * callAgent 未接入时抛错（调用方回退本地规则引擎）、不再直连任何前端配置的模型端点。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/config', () => ({
  API_BASE: '/api/v1',
  USE_MOCK: false,
  TOKEN_STORAGE_KEYS: { access: 'os.access_token', refresh: 'os.refresh_token' },
}))
vi.mock('@/api/client', () => ({ client: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))

import { client } from '@/api/client'
import { aiComplete, getAiStatus, invalidateAiStatus, saveLlmConfig } from '@/api/llmApi'
import { callAgent } from '@/utils/aiRules'

const get = vi.mocked(client.get)
const post = vi.mocked(client.post)
const put = vi.mocked(client.put)
const ok = <T,>(data: T) => ({ data: { code: 0, data } }) as never

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  put.mockReset()
  invalidateAiStatus()
})

describe('getAiStatus', () => {
  it('30s 内复用缓存；保存配置后失效重新拉取', async () => {
    get.mockResolvedValue(ok({ enabled: true, provider: 'deepseek', providerName: 'DeepSeek', model: 'deepseek-chat' }))
    expect((await getAiStatus()).enabled).toBe(true)
    await getAiStatus()
    expect(get).toHaveBeenCalledTimes(1)

    put.mockResolvedValue(ok({ configured: true }))
    await saveLlmConfig({ provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-x' })
    await getAiStatus()
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('请求失败按未启用处理（不阻断页面）', async () => {
    get.mockRejectedValue(new Error('network'))
    expect(await getAiStatus()).toMatchObject({ enabled: false })
  })
})

describe('aiComplete / callAgent', () => {
  it('经后端 /ai/complete，超时放宽到 75s', async () => {
    post.mockResolvedValue(ok({ text: '生成结果', model: 'm' }))
    expect(await aiComplete('写一段提示词')).toBe('生成结果')
    expect(post).toHaveBeenCalledWith('/ai/complete', { prompt: '写一段提示词', system: undefined }, { timeout: 75_000 })
  })

  it('团队未接入模型：callAgent 直接抛错且不发生成请求', async () => {
    get.mockResolvedValue(ok({ enabled: false, provider: null, providerName: null, model: null }))
    await expect(callAgent('p')).rejects.toThrow('未配置')
    expect(post).not.toHaveBeenCalled()
  })

  it('已接入：callAgent 返回模型文本', async () => {
    get.mockResolvedValue(ok({ enabled: true, provider: 'qwen', providerName: '通义千问', model: 'qwen-plus' }))
    post.mockResolvedValue(ok({ text: '[{"title":"a"}]', model: 'qwen-plus' }))
    expect(await callAgent('p')).toBe('[{"title":"a"}]')
  })
})
