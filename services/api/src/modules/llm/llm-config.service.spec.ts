/**
 * LlmConfigService：管理员权限、key 加密落库只露末 4 位、留空保留原 key、审计不含 key、
 * SSRF 拒绝内网地址、测试连接回落已存配置、未配置 → 40910、上游错误 → 502。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LlmConfigService } from './llm-config.service'
import { CredentialCipher } from '../../common/security/credential-cipher'
import type { AuthUser } from '../../common/auth/auth-user.interface'

const admin: AuthUser = { userId: 'u-admin', tenantId: 't1', roles: [{ key: 'tenant.admin', scope: 'tenant', scopeResourceId: null }] }
const member: AuthUser = { userId: 'u-member', tenantId: 't1', roles: [{ key: 'tenant.member', scope: 'tenant', scopeResourceId: null }] }
/** 公网 IP 字面量：SSRF 守卫放行且无需 DNS（测试确定性） */
const PUBLIC_BASE = 'https://203.0.113.10/v1'

function createFakePrisma() {
  const rows = new Map<string, any>()
  return {
    rows,
    tenantLlmConfig: {
      findUnique: vi.fn(async ({ where }: any) => (rows.has(where.tenantId) ? { ...rows.get(where.tenantId) } : null)),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const prev = rows.get(where.tenantId)
        const next = prev ? { ...prev, ...update, updatedAt: new Date() } : { ...create, createdAt: new Date(), updatedAt: new Date() }
        rows.set(where.tenantId, next)
        return { ...next }
      }),
      deleteMany: vi.fn(async ({ where }: any) => ({ count: rows.delete(where.tenantId) ? 1 : 0 })),
    },
  }
}

function okResponse() {
  return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }], model: 'm-live' }), { status: 200 })
}

describe('LlmConfigService', () => {
  let prisma: ReturnType<typeof createFakePrisma>
  let audit: { record: ReturnType<typeof vi.fn> }
  let service: LlmConfigService
  let fetchImpl: ReturnType<typeof vi.fn>

  beforeEach(() => {
    prisma = createFakePrisma()
    audit = { record: vi.fn() }
    const cipher = new CredentialCipher({ get: () => 'unit-test-encryption-key' } as any)
    service = new LlmConfigService(prisma as any, cipher, audit as any)
    fetchImpl = vi.fn().mockResolvedValue(okResponse())
    service.fetchImpl = fetchImpl as unknown as typeof fetch
  })

  it('非管理员不能查看/保存/删除/测试配置', async () => {
    await expect(service.getConfig(member)).rejects.toMatchObject({ status: 403 })
    await expect(service.saveConfig(member, { provider: 'custom', baseUrl: PUBLIC_BASE, model: 'm', apiKey: 'k' })).rejects.toMatchObject({ status: 403 })
    await expect(service.removeConfig(member)).rejects.toMatchObject({ status: 403 })
    await expect(service.testConfig(member, {})).rejects.toMatchObject({ status: 403 })
  })

  it('首次保存必须带 key；key 以 v1 密文落库，视图只给末 4 位', async () => {
    await expect(service.saveConfig(admin, { provider: 'custom', baseUrl: PUBLIC_BASE, model: 'm' })).rejects.toMatchObject({ status: 400 })

    const { data } = await service.saveConfig(admin, {
      provider: 'custom',
      baseUrl: `${PUBLIC_BASE}/chat/completions/`,
      model: ' my-model ',
      apiKey: 'sk-abcdefgh12345678',
    })
    const stored = prisma.rows.get('t1')
    expect(stored.apiKey).toMatch(/^v1\./)
    expect(stored.apiKey).not.toContain('sk-abcdefgh')
    expect(stored.baseUrl).toBe(PUBLIC_BASE) // 去掉误填的 /chat/completions 与尾斜杠
    expect(data).toMatchObject({ configured: true, provider: 'custom', model: 'my-model', keyLast4: '5678' })
    expect(JSON.stringify(data)).not.toContain('sk-abcdefgh')
    expect(await service.resolveTarget('t1')).toEqual({ baseUrl: PUBLIC_BASE, apiKey: 'sk-abcdefgh12345678', model: 'my-model' })
  })

  it('再次保存不带 key → 保留原 key；审计不含 key 明文/密文', async () => {
    await service.saveConfig(admin, { provider: 'custom', baseUrl: PUBLIC_BASE, model: 'm1', apiKey: 'sk-original-key-9999' })
    const cipherBefore = prisma.rows.get('t1').apiKey
    await service.saveConfig(admin, { provider: 'custom', baseUrl: PUBLIC_BASE, model: 'm2' })
    expect(prisma.rows.get('t1').apiKey).toBe(cipherBefore)
    expect((await service.resolveTarget('t1'))?.model).toBe('m2')

    const audits = JSON.stringify(audit.record.mock.calls)
    expect(audits).not.toContain('sk-original')
    expect(audits).not.toContain(cipherBefore)
    expect(audit.record.mock.calls[1][0].after).toMatchObject({ keyChanged: false, keyLast4: '9999' })
  })

  it('厂商预设：baseUrl 留空用预设地址；custom 必须填地址；内网地址被 SSRF 守卫拒绝', async () => {
    await expect(service.saveConfig(admin, { provider: 'custom', model: 'm', apiKey: 'k' })).rejects.toMatchObject({ status: 400 })
    await expect(
      service.saveConfig(admin, { provider: 'custom', baseUrl: 'http://127.0.0.1:4000/v1', model: 'm', apiKey: 'k' }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      service.saveConfig(admin, { provider: 'custom', baseUrl: 'http://169.254.169.254/latest', model: 'm', apiKey: 'k' }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(service.saveConfig(admin, { provider: 'nope', model: 'm', apiKey: 'k' })).rejects.toMatchObject({ status: 400 })
  })

  it('测试连接：缺省项回落已存配置；上游失败返回 ok=false 与原因', async () => {
    expect((await service.testConfig(admin, {})).data).toMatchObject({ ok: false, kind: 'bad_request' })

    await service.saveConfig(admin, { provider: 'custom', baseUrl: PUBLIC_BASE, model: 'm1', apiKey: 'sk-stored-key-0000' })
    const ok = await service.testConfig(admin, { model: 'm-override' })
    expect(ok.data).toMatchObject({ ok: true, model: 'm-live' })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(`${PUBLIC_BASE}/chat/completions`)
    expect(init.headers.authorization).toBe('Bearer sk-stored-key-0000')
    expect(JSON.parse(init.body).model).toBe('m-override')

    fetchImpl.mockResolvedValueOnce(new Response('{}', { status: 401 }))
    expect((await service.testConfig(admin, {})).data).toMatchObject({ ok: false, kind: 'auth' })
  })

  it('状态接口对成员可见且不含 key；删除后回到未配置', async () => {
    expect((await service.getStatus(member)).data).toEqual({ enabled: false, provider: null, providerName: null, model: null })
    await service.saveConfig(admin, { provider: 'custom', baseUrl: PUBLIC_BASE, model: 'm1', apiKey: 'sk-whatever-1111' })
    expect((await service.getStatus(member)).data).toEqual({ enabled: true, provider: 'custom', providerName: '自定义（OpenAI 兼容）', model: 'm1' })

    expect((await service.removeConfig(admin)).data.removed).toBe(true)
    expect((await service.getConfig(admin)).data.configured).toBe(false)
    expect(audit.record.mock.calls.at(-1)?.[0].action).toBe('llm_config.delete')
  })

  it('complete：未配置 → 40910；上游错误 → 502 且不泄露 key；成功返回文本', async () => {
    await expect(service.complete(member, { prompt: 'p' })).rejects.toMatchObject({ status: 409 })
    const err409 = await service.complete(member, { prompt: 'p' }).catch(e => e)
    expect(err409.getResponse()).toMatchObject({ code: 40910 })

    await service.saveConfig(admin, { provider: 'custom', baseUrl: PUBLIC_BASE, model: 'm1', apiKey: 'sk-complete-key-2222' })
    expect((await service.complete(member, { prompt: 'p' })).data.text).toBe('ok')

    fetchImpl.mockResolvedValueOnce(new Response('sk-complete-key-2222', { status: 429 }))
    const err = await service.complete(member, { prompt: 'p' }).catch(e => e)
    expect(err.status).toBe(502)
    expect(JSON.stringify(err.getResponse())).not.toContain('sk-complete')
  })
})
