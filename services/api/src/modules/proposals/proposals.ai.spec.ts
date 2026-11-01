/**
 * ProposalsService × AI 拆解：未配置走规则引擎；已配置走 AI 服务并转换格式；AI 失败保留规则结果并写明原因；
 * 回调与同步流按 run_id 幂等；回调 payload 同样做格式转换；模板模式不调 AI。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProposalsService } from './proposals.service'
import type { AuthUser } from '../../common/auth/auth-user.interface'

const user: AuthUser = { userId: 'u1', tenantId: 't1', roles: [{ key: 'tenant.member', scope: 'tenant', scopeResourceId: null }] }
const TARGET = { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-tenant', model: 'deepseek-chat' }
const AI_PAYLOAD = {
  summary: 'AI 拆解',
  tasks: [
    { title: '整体计划', estimated_hours: 16, priority: 'high', parent_idx: null, deps: [], reason: '根' },
    { title: '调研', estimated_hours: 6, priority: 'medium', parent_idx: 0, deps: [{ prev_idx: 0, type: 'FS', lag_days: 0 }], reason: 'r' },
  ],
  warnings: [],
}

function createFakePrisma() {
  const rows = new Map<string, any>()
  let seq = 0
  return {
    rows,
    aiProposal: {
      create: vi.fn(async ({ data }: any) => {
        const row = { ...data, id: `prop-${++seq}`, createdAt: new Date(), updatedAt: new Date(), expiresAt: data.expiresAt ?? null }
        rows.set(row.id, row)
        return { ...row }
      }),
      findUnique: vi.fn(async ({ where }: any) => (rows.has(where.id) ? { ...rows.get(where.id) } : null)),
      findFirstOrThrow: vi.fn(async ({ where }: any) => ({ ...rows.get(where.id) })),
      update: vi.fn(async ({ where, data }: any) => {
        const row = { ...rows.get(where.id), ...data, updatedAt: new Date() }
        rows.set(where.id, row)
        return { id: row.id, status: row.status }
      }),
    },
    projectTemplate: {
      findFirst: vi.fn(async () => ({ id: 'tpl', ownerId: 'u1', isPublic: false, taskSnapshot: [{ title: '{{goal}} 设计' }], dependencySnapshot: [] })),
    },
  }
}

function aiFetch(streamBody: string) {
  return vi.fn(async (url: string) => {
    if (url.endsWith('/ai/decompose')) {
      return new Response(JSON.stringify({ run_id: 'run-1', stream_url: '/ai/decompose/run-1/stream' }), { status: 202 })
    }
    return new Response(streamBody, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  })
}

describe('ProposalsService AI 拆解', () => {
  let prisma: ReturnType<typeof createFakePrisma>
  let llm: { resolveTarget: ReturnType<typeof vi.fn> }
  let service: ProposalsService

  beforeEach(() => {
    prisma = createFakePrisma()
    llm = { resolveTarget: vi.fn().mockResolvedValue(null) }
    const config = { get: (k: string) => ({ AI_SERVICE_URL: 'http://ai:8300', AI_SERVICE_TOKEN: 'svc' })[k] }
    service = new ProposalsService(prisma as any, { record: vi.fn() } as any, llm as any, config as any)
  })

  it('租户未配置模型 → 规则引擎，不调 AI 服务', async () => {
    const fetchImpl = vi.fn()
    service.fetchImpl = fetchImpl as unknown as typeof fetch
    const { data } = await service.createDecompose(user, { goalTitle: '设计；开发；测试' })
    expect(data.engine).toBe('rules')
    expect(data.tasks).toHaveLength(3)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('已配置 → AI 服务拆解，结果转为草稿格式并重新排期', async () => {
    llm.resolveTarget.mockResolvedValue(TARGET)
    service.fetchImpl = aiFetch(
      `event: ai.done\ndata: ${JSON.stringify({ payload: AI_PAYLOAD })}\n\n`,
    ) as unknown as typeof fetch
    const { data } = await service.createDecompose(user, { goalTitle: '做官网', goalDescription: '面向客户' })
    expect(data).toMatchObject({ engine: 'ai', aiModel: 'deepseek-chat', summary: 'AI 拆解' })
    expect(data.tasks.map((t: any) => [t.title, t.estimatedHours])).toEqual([
      ['整体计划', 16],
      ['调研', 6],
    ])
    expect(data.tasks[1].earliestStart).toBeTruthy() // CPM 排期已填充
    expect(data.dependencies).toEqual([{ fromIndex: 0, toIndex: 1, type: 'FS', lagDays: 0 }])
    const stored = [...prisma.rows.values()][0]
    expect(stored.payload.aiRunId).toBe('run-1')
    expect(JSON.stringify(stored.payload)).not.toContain('sk-tenant') // key 不进草稿
  })

  it('AI 失败 → 保留规则引擎草稿并写明原因（不抛错）', async () => {
    llm.resolveTarget.mockResolvedValue(TARGET)
    service.fetchImpl = aiFetch('event: ai.error\ndata: {"code":"AI_LLM_AUTH","message":"LLM 鉴权失败"}\n\n') as unknown as typeof fetch
    const { data } = await service.createDecompose(user, { goalTitle: '设计；开发' })
    expect(data.engine).toBe('rules')
    expect(data.tasks).toHaveLength(2)
    expect(data.warnings.at(-1)).toContain('LLM 鉴权失败')
  })

  it('模板模式不调 AI（即使已配置模型）', async () => {
    llm.resolveTarget.mockResolvedValue(TARGET)
    const fetchImpl = vi.fn()
    service.fetchImpl = fetchImpl as unknown as typeof fetch
    const { data } = await service.createDecompose(user, { goalTitle: '官网', templateId: '00000000-0000-0000-0000-000000000001' })
    expect(data.engine).toBe('rules')
    expect(data.tasks[0].title).toBe('官网 设计')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(llm.resolveTarget).not.toHaveBeenCalled()
  })

  it('回调先到、同步流后到：按 run_id 幂等，回调 payload 同样转换格式', async () => {
    const { data } = await service.createDecompose(user, { goalTitle: '设计' })
    const first = await service.handleAiCallback({ run_id: 'run-9', proposal_id: data.id, status: 'succeeded', payload: AI_PAYLOAD } as any)
    expect(first.data.idempotent).toBe(false)
    const stored = prisma.rows.get(data.id)
    expect(stored.payload.engine).toBe('ai')
    expect(stored.payload.tasks[0]).toMatchObject({ title: '整体计划', estimatedHours: 16 })
    expect(stored.payload.tasks[0]).not.toHaveProperty('estimated_hours')

    const second = await service.applyAiResult(data.id, 'run-9', 'succeeded', AI_PAYLOAD)
    expect(second.data.idempotent).toBe(true)
  })
})
