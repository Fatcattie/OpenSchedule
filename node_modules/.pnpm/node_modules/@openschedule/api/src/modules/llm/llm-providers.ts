/**
 * llm-providers.ts —— 支持的模型厂商预设（全部为 OpenAI 兼容 /chat/completions）
 *
 * 管理员在「设置 → AI 模型」选择厂商后，前端用预设填好 baseUrl 与推荐模型；
 * custom 允许自定义 OpenAI 兼容地址（如公司自建模型服务），保存/调用前统一过 SSRF 守卫。
 */

export const LLM_PROVIDER_IDS = ['deepseek', 'zhipu', 'qwen', 'moonshot', 'openai', 'custom'] as const
export type LlmProviderId = (typeof LLM_PROVIDER_IDS)[number]

export interface LlmProviderPreset {
  id: LlmProviderId
  name: string
  /** 默认端点（custom 为空，由管理员填写） */
  baseUrl: string
  /** 推荐模型（第一个为默认） */
  models: string[]
  /** 申请 key 的控制台地址（前端展示为链接） */
  consoleUrl?: string
}

export const LLM_PROVIDERS: readonly LlmProviderPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    consoleUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-plus', 'glm-4-air', 'glm-4-flash'],
    consoleUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
  {
    id: 'qwen',
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-plus', 'qwen-max', 'qwen-turbo'],
    consoleUrl: 'https://bailian.console.aliyun.com/?apiKey=1',
  },
  {
    id: 'moonshot',
    name: 'Kimi（月之暗面）',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k'],
    consoleUrl: 'https://platform.moonshot.cn/console/api-keys',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o'],
    consoleUrl: 'https://platform.openai.com/api-keys',
  },
  { id: 'custom', name: '自定义（OpenAI 兼容）', baseUrl: '', models: [] },
]

export function findProvider(id: string): LlmProviderPreset | undefined {
  return LLM_PROVIDERS.find(p => p.id === id)
}

/** 规范化 baseUrl：去尾部斜杠与误填的 /chat/completions（纯函数） */
export function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, '')
}

/** 展示用末 4 位（纯函数）：不足 8 位只显示末 2 位，避免短 key 泄露过多 */
export function keyLast4(apiKey: string): string {
  const key = apiKey.trim()
  return key.length >= 8 ? key.slice(-4) : key.slice(-2)
}
