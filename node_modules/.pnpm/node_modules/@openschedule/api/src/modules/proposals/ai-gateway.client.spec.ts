/**
 * ai-gateway.client：SSE 解析（分包/心跳/CRLF）、AI→草稿格式转换、runAiDecompose 请求形状与终帧语义。
 */
import { describe, expect, it, vi } from 'vitest'
import { AiDecomposeError, parseSseChunk, runAiDecompose, toInternalDecompose } from './ai-gateway.client'

const AI_PAYLOAD = {
  version: '1.0',
  summary: '拆成 3 步',
  tasks: [
    { title: '整体计划', estimated_hours: 20, priority: 'high', parent_idx: null, deps: [], reason: '根' },
    { title: '设计', estimated_hours: 8, priority: 'urgent', parent_idx: 0, deps: [{ prev_idx: 0, type: 'FS', lag_days: 0 }], reason: 'r' },
    {
      title: '开发',
      estimated_hours: 12,
      priority: 'weird',
      parent_idx: 0,
      assignee_hint: '开发',
      deps: [
        { prev_idx: 1, type: 'SS', lag_days: 2, is_shared: true },
        { prev_idx: 2, type: 'FS' }, // 自依赖：丢弃
        { prev_idx: 9, type: 'FS' }, // 越界：丢弃
      ],
      reason: 'r',
    },
  ],
  warnings: ['w1'],
}

function sseResponse(chunks: string[]) {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(encoder.encode(c))
        controller.close()
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  )
}

function fakeAi(streamChunks: string[]) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.endsWith('/ai/decompose')) {
      return new Response(JSON.stringify({ run_id: 'run-1', stream_url: '/ai/decompose/run-1/stream' }), { status: 202 })
    }
    return sseResponse(streamChunks)
  })
}

const INPUT = {
  tenantId: 't1',
  projectId: 'p1',
  description: '做一个官网',
  budgetHours: 40,
  llm: { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-tenant', model: 'deepseek-chat' },
}
const OPTIONS = { baseUrl: 'http://ai:8300/', serviceToken: 'svc-token', timeoutMs: 5000 }

describe('parseSseChunk', () => {
  it('跨包拼接、忽略心跳、兼容 CRLF', () => {
    const first = parseSseChunk('event: ai.start\ndata: {"run_id":"r"}\n\n: keep-alive\n\nevent: ai.do')
    expect(first.frames).toEqual([{ event: 'ai.start', data: { run_id: 'r' } }])
    const second = parseSseChunk(`${first.rest}ne\r\ndata: {"payload":1}\r\n\r\n`)
    expect(second.frames).toEqual([{ event: 'ai.done', data: { payload: 1 } }])
    expect(second.rest).toBe('')
  })
})

describe('toInternalDecompose', () => {
  it('snake_case → camelCase；deps 平铺为 fromIndex→toIndex；非法优先级回落 medium；坏依赖丢弃', () => {
    const out = toInternalDecompose(AI_PAYLOAD)
    expect(out.tasks.map(t => [t.title, t.estimatedHours, t.priority])).toEqual([
      ['整体计划', 20, 'high'],
      ['设计', 8, 'urgent'],
      ['开发', 12, 'medium'],
    ])
    expect(out.tasks[2]).toMatchObject({ isShared: true, assigneeHint: '开发' })
    expect(out.dependencies).toEqual([
      { fromIndex: 0, toIndex: 1, type: 'FS', lagDays: 0 },
      { fromIndex: 1, toIndex: 2, type: 'SS', lagDays: 2 },
    ])
    expect(out.warnings).toEqual(['w1'])
  })
})

describe('runAiDecompose', () => {
  it('202 → SSE 消费到 ai.done；请求带服务 token / X-Proposal-Id / 租户模型配置', async () => {
    const fetchImpl = fakeAi([
      'event: ai.start\ndata: {"run_id":"run-1"}\n\n',
      ': keep-alive\n\nevent: ai.status\ndata: {"progress":50}\n\n',
      `event: ai.done\ndata: ${JSON.stringify({ proposal_id: 'prop-1', payload: AI_PAYLOAD })}\n\n`,
    ])
    const out = await runAiDecompose(INPUT, 'prop-1', { ...OPTIONS, fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(out.runId).toBe('run-1')
    expect(out.payload.summary).toBe('拆成 3 步')

    const [createUrl, createInit] = fetchImpl.mock.calls[0]
    expect(createUrl).toBe('http://ai:8300/ai/decompose')
    const headers = createInit!.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer svc-token')
    expect(headers['x-proposal-id']).toBe('prop-1')
    expect(JSON.parse(createInit!.body as string)).toEqual({
      tenant_id: 't1',
      project_id: 'p1',
      description: '做一个官网',
      constraints: { budget_hours: 40 },
      llm: { base_url: 'https://api.deepseek.com/v1', api_key: 'sk-tenant', model: 'deepseek-chat' },
    })
    expect(fetchImpl.mock.calls[1][0]).toBe('http://ai:8300/ai/decompose/run-1/stream')
  })

  it('ai.error → AiDecomposeError(code)', async () => {
    const fetchImpl = fakeAi(['event: ai.error\ndata: {"code":"AI_RUN_INTERRUPTED","message":"重启"}\n\n'])
    await expect(
      runAiDecompose(INPUT, 'p', { ...OPTIONS, fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ code: 'AI_RUN_INTERRUPTED' })
  })

  it('流无终帧即结束 → AI_STREAM_CLOSED；AI 拒绝 → AI_UNAVAILABLE；不可达 → AI_UNAVAILABLE', async () => {
    const closed = fakeAi(['event: ai.status\ndata: {"progress":10}\n\n'])
    await expect(runAiDecompose(INPUT, 'p', { ...OPTIONS, fetchImpl: closed as unknown as typeof fetch })).rejects.toMatchObject({
      code: 'AI_STREAM_CLOSED',
    })
    const rejected = vi.fn().mockResolvedValue(new Response('{}', { status: 422 }))
    await expect(runAiDecompose(INPUT, 'p', { ...OPTIONS, fetchImpl: rejected })).rejects.toBeInstanceOf(AiDecomposeError)
    const down = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    await expect(runAiDecompose(INPUT, 'p', { ...OPTIONS, fetchImpl: down })).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' })
  })
})
