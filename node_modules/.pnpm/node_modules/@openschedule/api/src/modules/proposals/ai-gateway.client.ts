/**
 * ai-gateway.client.ts —— 主服务 → AI 服务的拆解调用（§3.5.2）
 *
 * 流程：POST {AI_SERVICE_URL}/ai/decompose（202 + run_id，服务 token 鉴权，X-Proposal-Id 关联草稿）
 *      → GET /ai/decompose/{run_id}/stream（SSE）消费到 ai.done / ai.error。
 * AI 服务同时会经 /internal/ai/results 回调落库；两条路径都走 ProposalsService.applyAiResult（按 run_id 幂等）。
 * 租户模型配置（含 key）只在本次请求体里出现，AI 服务不落盘（DecomposeRequest.llm exclude）。
 */
import type { LlmTarget } from '../llm/llm-client'

export interface AiDecomposeDep {
  prev_idx: number
  type?: string
  lag_days?: number
  is_shared?: boolean
}

export interface AiDecomposeTask {
  title: string
  description?: string
  estimated_hours: number
  priority?: string
  assignee_hint?: string | null
  parent_idx?: number | null
  deps?: AiDecomposeDep[]
  reason?: string
}

export interface AiDecomposePayload {
  version?: string
  summary: string
  tasks: AiDecomposeTask[]
  warnings?: string[]
}

export interface AiDecomposeRequest {
  tenantId: string
  projectId: string
  description: string
  budgetHours?: number
  llm: LlmTarget
}

export class AiDecomposeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AiDecomposeError'
  }
}

export interface AiGatewayOptions {
  baseUrl: string
  serviceToken: string
  timeoutMs: number
  fetchImpl?: typeof fetch
}

/** 解析 SSE 文本块（纯函数）：返回完整帧与剩余未完结缓冲；`:` 开头为心跳注释 */
export function parseSseChunk(buffer: string): { frames: Array<{ event: string; data: any }>; rest: string } {
  const frames: Array<{ event: string; data: any }> = []
  const blocks = buffer.replace(/\r\n/g, '\n').split('\n\n')
  const rest = blocks.pop() ?? ''
  for (const block of blocks) {
    let event = 'message'
    const dataLines: string[] = []
    for (const line of block.split('\n')) {
      if (!line || line.startsWith(':')) continue
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
    }
    if (dataLines.length === 0) continue
    try {
      frames.push({ event, data: JSON.parse(dataLines.join('\n')) })
    } catch {
      /* 非 JSON 帧忽略 */
    }
  }
  return { frames, rest }
}

export async function runAiDecompose(
  input: AiDecomposeRequest,
  proposalId: string,
  options: AiGatewayOptions,
): Promise<{ runId: string; payload: AiDecomposePayload }> {
  const fetchImpl = options.fetchImpl ?? fetch
  const base = options.baseUrl.replace(/\/+$/, '')
  const signal = AbortSignal.timeout(options.timeoutMs)
  const auth = { authorization: `Bearer ${options.serviceToken}` }

  let created: Response
  try {
    created = await fetchImpl(`${base}/ai/decompose`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json', 'x-proposal-id': proposalId },
      body: JSON.stringify({
        tenant_id: input.tenantId,
        project_id: input.projectId,
        description: input.description,
        ...(input.budgetHours ? { constraints: { budget_hours: input.budgetHours } } : {}),
        llm: { base_url: input.llm.baseUrl, api_key: input.llm.apiKey, model: input.llm.model },
      }),
      signal,
    })
  } catch (err) {
    throw toTransportError(err)
  }
  if (created.status !== 202) {
    throw new AiDecomposeError('AI_UNAVAILABLE', `AI 服务拒绝拆解请求（HTTP ${created.status}）`)
  }
  const { run_id: runId, stream_url: streamUrl } = (await created.json()) as { run_id: string; stream_url: string }

  let stream: Response
  try {
    stream = await fetchImpl(`${base}${streamUrl}`, { headers: { ...auth, accept: 'text/event-stream' }, signal })
  } catch (err) {
    throw toTransportError(err)
  }
  if (!stream.ok || !stream.body) {
    throw new AiDecomposeError('AI_UNAVAILABLE', `AI 拆解流不可用（HTTP ${stream.status}）`)
  }

  const reader = stream.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parsed = parseSseChunk(buffer)
      buffer = parsed.rest
      for (const frame of parsed.frames) {
        if (frame.event === 'ai.done') return { runId, payload: frame.data?.payload as AiDecomposePayload }
        if (frame.event === 'ai.error') {
          throw new AiDecomposeError(String(frame.data?.code ?? 'AI_ERROR'), String(frame.data?.message ?? 'AI 拆解失败'))
        }
      }
    }
  } catch (err) {
    if (err instanceof AiDecomposeError) throw err
    throw toTransportError(err)
  } finally {
    reader.cancel().catch(() => undefined)
  }
  throw new AiDecomposeError('AI_STREAM_CLOSED', 'AI 拆解流提前结束')
}

function toTransportError(err: unknown): AiDecomposeError {
  const name = (err as { name?: string })?.name
  if (name === 'TimeoutError' || name === 'AbortError') return new AiDecomposeError('AI_TIMEOUT', 'AI 拆解超时')
  return new AiDecomposeError('AI_UNAVAILABLE', 'AI 服务不可达')
}

// ==================== 结果格式转换 ====================

export interface InternalDecomposeTask {
  title: string
  description: string
  estimatedHours: number
  isShared: boolean
  priority: 'urgent' | 'high' | 'medium' | 'low'
  assigneeHint?: string
  reason?: string
}

export interface InternalDecomposeDependency {
  fromIndex: number
  toIndex: number
  type: 'FS' | 'SS' | 'FF' | 'SF'
  lagDays: number
}

const PRIORITIES = new Set(['urgent', 'high', 'medium', 'low'])
const DEP_TYPES = new Set(['FS', 'SS', 'FF', 'SF'])

/**
 * AI 服务 payload（snake_case，deps 挂在后置任务上）→ 主服务草稿格式（camelCase，依赖平铺 fromIndex→toIndex）。
 * 纯函数；越界/自依赖的 dep 丢弃（AI 侧 L2 已判环，这里只做防御）。
 */
export function toInternalDecompose(payload: AiDecomposePayload): {
  summary: string
  tasks: InternalDecomposeTask[]
  dependencies: InternalDecomposeDependency[]
  warnings: string[]
} {
  const source = Array.isArray(payload?.tasks) ? payload.tasks : []
  const tasks: InternalDecomposeTask[] = source.map(t => ({
    title: String(t.title ?? '').slice(0, 200),
    description: String(t.description ?? ''),
    estimatedHours: Number(t.estimated_hours) > 0 ? Number(t.estimated_hours) : 8,
    isShared: Array.isArray(t.deps) && t.deps.some(d => d.is_shared === true),
    priority: (PRIORITIES.has(String(t.priority)) ? t.priority : 'medium') as InternalDecomposeTask['priority'],
    ...(t.assignee_hint ? { assigneeHint: String(t.assignee_hint) } : {}),
    ...(t.reason ? { reason: String(t.reason) } : {}),
  }))
  const dependencies: InternalDecomposeDependency[] = []
  source.forEach((t, toIndex) => {
    for (const d of t.deps ?? []) {
      const fromIndex = Number(d.prev_idx)
      if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= source.length || fromIndex === toIndex) continue
      dependencies.push({
        fromIndex,
        toIndex,
        type: (DEP_TYPES.has(String(d.type)) ? d.type : 'FS') as InternalDecomposeDependency['type'],
        lagDays: Math.max(0, Number(d.lag_days) || 0),
      })
    }
  })
  return {
    summary: String(payload?.summary ?? ''),
    tasks,
    dependencies,
    warnings: Array.isArray(payload?.warnings) ? payload.warnings.map(String) : [],
  }
}
