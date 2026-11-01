/**
 * llm-client.ts —— OpenAI 兼容 /chat/completions 调用（纯函数 + 可注入 fetch，零依赖）
 *
 * 用于：AI 规则页 / 智能协助的文本生成（POST /ai/complete）与「测试连接」。
 * 项目拆解不走这里：拆解经 AI 服务（LangGraph 校验/重试/降级），主服务只把租户配置随请求下发。
 *
 * 纪律：错误消息只给中文原因 + 上游状态码，**不回显 key、不回显上游响应体**（上游 4xx 体可能回显请求头）。
 */

export interface LlmTarget {
  baseUrl: string
  apiKey: string
  model: string
}

export interface ChatInput {
  prompt: string
  system?: string
  /** L1 铁律：≤0.2（超限截断） */
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
}

export interface ChatOutput {
  text: string
  model: string
  usage: { promptTokens: number; completionTokens: number }
}

export type LlmErrorKind = 'auth' | 'rate_limited' | 'timeout' | 'unreachable' | 'bad_request' | 'upstream' | 'invalid_response'

export class LlmCallError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'LlmCallError'
  }
}

export const DEFAULT_TIMEOUT_MS = 60_000
const MAX_TEMPERATURE = 0.2

/** HTTP 状态 → 错误（纯函数；文案面向管理员，直接展示在设置页） */
export function classifyStatus(status: number): LlmCallError | null {
  if (status >= 200 && status < 300) return null
  if (status === 401 || status === 403) {
    return new LlmCallError('auth', `API Key 无效或无权限（HTTP ${status}），请检查 key 是否正确、是否已开通该模型`, status)
  }
  if (status === 402) return new LlmCallError('auth', '账户余额不足（HTTP 402），请到厂商控制台充值', status)
  if (status === 429) return new LlmCallError('rate_limited', '调用频率或额度超限（HTTP 429），请稍后重试或提升额度', status)
  if (status === 404) return new LlmCallError('bad_request', '接口地址或模型名不存在（HTTP 404），请检查 Base URL 与模型名', status)
  if (status >= 500) return new LlmCallError('upstream', `模型服务暂时不可用（HTTP ${status}）`, status)
  return new LlmCallError('bad_request', `模型服务拒绝了请求（HTTP ${status}），请检查模型名是否正确`, status)
}

export async function chatCompletion(
  target: LlmTarget,
  input: ChatInput,
  fetchImpl: typeof fetch = fetch,
): Promise<ChatOutput> {
  const url = `${target.baseUrl.replace(/\/+$/, '')}/chat/completions`
  const messages = [
    ...(input.system ? [{ role: 'system', content: input.system }] : []),
    { role: 'user', content: input.prompt },
  ]
  const body: Record<string, unknown> = {
    model: target.model,
    messages,
    temperature: Math.min(input.temperature ?? MAX_TEMPERATURE, MAX_TEMPERATURE),
    stream: false,
  }
  if (input.maxTokens) body.max_tokens = input.maxTokens

  let res: Response
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${target.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(input.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      redirect: 'error', // 不跟随重定向：防止 SSRF 守卫通过后被 30x 引到内网
    })
  } catch (err) {
    const name = (err as { name?: string })?.name
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new LlmCallError('timeout', '模型服务响应超时，请稍后重试')
    }
    throw new LlmCallError('unreachable', `无法连接模型服务（${new URL(url).host}），请检查 Base URL 与网络`)
  }

  const statusError = classifyStatus(res.status)
  if (statusError) throw statusError

  let data: any
  try {
    data = await res.json()
  } catch {
    throw new LlmCallError('invalid_response', '模型服务返回的不是 JSON，请确认 Base URL 指向 OpenAI 兼容接口')
  }
  const text = data?.choices?.[0]?.message?.content
  if (typeof text !== 'string') {
    throw new LlmCallError('invalid_response', '模型服务响应缺少 choices[0].message.content，请确认接口为 OpenAI 兼容格式')
  }
  return {
    text,
    model: typeof data.model === 'string' ? data.model : target.model,
    usage: {
      promptTokens: Number(data.usage?.prompt_tokens ?? 0) || 0,
      completionTokens: Number(data.usage?.completion_tokens ?? 0) || 0,
    },
  }
}
