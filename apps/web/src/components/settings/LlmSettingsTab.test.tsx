/**
 * LlmSettingsTab：成员只读；管理员首次配置必须填 key；已配置时只显示末 4 位、留空保存不上传 key；
 * 测试连接展示失败原因；保存后提交的字段与选择的厂商一致。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const role = { value: 'manager' as 'manager' | 'member' }
vi.mock('@/hooks/useCurrentRole', () => ({ useCurrentRole: () => role.value }))
vi.mock('@/api/llmApi', () => ({
  listLlmProviders: vi.fn(),
  getLlmConfig: vi.fn(),
  saveLlmConfig: vi.fn(),
  deleteLlmConfig: vi.fn(),
  testLlmConfig: vi.fn(),
  getAiStatus: vi.fn(),
}))

import * as llmApi from '@/api/llmApi'
import { renderWithAntd } from '@/test/renderWithAntd'
import LlmSettingsTab from './LlmSettingsTab'

const PROVIDERS = [
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat'] },
  { id: 'custom', name: '自定义（OpenAI 兼容）', baseUrl: '', models: [] },
]
const EMPTY = { configured: false, provider: null, providerName: null, baseUrl: null, model: null, keyLast4: null, updatedAt: null }
const CONFIGURED = {
  configured: true,
  provider: 'deepseek',
  providerName: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  keyLast4: '7788',
  updatedAt: '2026-10-21T00:00:00.000Z',
}

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderWithAntd(
    <QueryClientProvider client={queryClient}>
      <LlmSettingsTab />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  role.value = 'manager'
  vi.mocked(llmApi.listLlmProviders).mockResolvedValue(PROVIDERS as never)
  vi.mocked(llmApi.getLlmConfig).mockResolvedValue(EMPTY as never)
  vi.mocked(llmApi.saveLlmConfig).mockReset().mockResolvedValue(CONFIGURED as never)
  vi.mocked(llmApi.testLlmConfig).mockReset()
  vi.mocked(llmApi.getAiStatus).mockResolvedValue({ enabled: false, provider: null, providerName: null, model: null })
})

describe('LlmSettingsTab', () => {
  it('成员只读：只显示是否接入，无表单', async () => {
    role.value = 'member'
    renderTab()
    expect(await screen.findByText('团队尚未配置 AI 模型')).toBeInTheDocument()
    expect(screen.queryByText('保存配置')).not.toBeInTheDocument()
    expect(llmApi.getLlmConfig).not.toHaveBeenCalled()
  })

  it('首次配置：不填 key 不能保存；填写后按所选厂商提交', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByLabelText('模型')).toHaveValue('deepseek-chat'))

    fireEvent.click(screen.getByRole('button', { name: /保存配置/ }))
    expect(await screen.findByText('首次配置必须填写 API Key')).toBeInTheDocument()
    expect(llmApi.saveLlmConfig).not.toHaveBeenCalled()

    fireEvent.change(screen.getByPlaceholderText('sk-...'), { target: { value: 'sk-new-key-1234' } })
    fireEvent.click(screen.getByRole('button', { name: /保存配置/ }))
    await waitFor(() =>
      expect(llmApi.saveLlmConfig).toHaveBeenCalledWith({ provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-new-key-1234' }),
    )
  })

  it('已配置：只显示末 4 位；留空保存不上传 key', async () => {
    vi.mocked(llmApi.getLlmConfig).mockResolvedValue(CONFIGURED as never)
    renderTab()
    expect(await screen.findByText('••••••••7788')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('模型')).toHaveValue('deepseek-chat'))

    fireEvent.click(screen.getByRole('button', { name: /保存配置/ }))
    await waitFor(() => expect(llmApi.saveLlmConfig).toHaveBeenCalledWith({ provider: 'deepseek', model: 'deepseek-chat' }))
  })

  it('测试连接失败：展示服务端给出的原因', async () => {
    vi.mocked(llmApi.getLlmConfig).mockResolvedValue(CONFIGURED as never)
    vi.mocked(llmApi.testLlmConfig).mockResolvedValue({ ok: false, kind: 'auth', message: 'API Key 无效或无权限（HTTP 401）' })
    renderTab()
    await waitFor(() => expect(screen.getByLabelText('模型')).toHaveValue('deepseek-chat'))

    fireEvent.click(screen.getByRole('button', { name: /测试连接/ }))
    expect(await screen.findByText('API Key 无效或无权限（HTTP 401）')).toBeInTheDocument()
    expect(llmApi.testLlmConfig).toHaveBeenCalledWith({ provider: 'deepseek', model: 'deepseek-chat' })
  })
})
