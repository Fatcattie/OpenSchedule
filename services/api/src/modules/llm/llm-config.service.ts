/**
 * llm-config.service.ts —— 租户 AI 模型配置（管理员维护，全团队共用）+ 文本生成出口
 *
 * - key 以 AES-256-GCM 密文落库（CredentialCipher，同 Webhook.secret）；响应/审计/日志只出现末 4 位
 * - baseUrl 保存前与每次调用前都过 SSRF 守卫（custom 地址由管理员填写，§3.3）
 * - resolveTarget 供项目拆解把配置随请求下发给 AI 服务（AI 服务不落盘）
 */
import { HttpStatus, Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma/prisma.service'
import { AuditService } from '../../common/audit/audit.service'
import { CredentialCipher } from '../../common/security/credential-cipher'
import { assertSafeOutboundUrl, safeFetch } from '../../common/security/url-guard'
import { ApiException } from '../../common/exceptions/api.exception'
import { API_ERROR_CODES } from '../../common/constants/error-codes'
import { AuthUser, isTenantAdmin } from '../../common/decorators/current-user.decorator'
import { LLM_PROVIDERS, findProvider, keyLast4, normalizeBaseUrl } from './llm-providers'
import { LlmCallError, chatCompletion, type ChatOutput, type LlmTarget } from './llm-client'
import type { AiCompleteDto, SaveLlmConfigDto, TestLlmConfigDto } from './dto/llm.dto'

const TEST_TIMEOUT_MS = 15_000

export interface LlmConfigView {
  configured: boolean
  provider: string | null
  providerName: string | null
  baseUrl: string | null
  model: string | null
  keyLast4: string | null
  updatedAt: string | null
}

export type LlmTestResult =
  | { ok: true; model: string; latencyMs: number }
  | { ok: false; kind: string; message: string }

@Injectable()
export class LlmConfigService {
  /** 测试注入点：生产用 safeFetch（连接时 SSRF 校验 + 不跟随重定向，安全问题 M-3） */
  fetchImpl: typeof fetch = (...args) => safeFetch(...args)

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: CredentialCipher,
    private readonly audit: AuditService,
  ) {}

  listProviders() {
    return { data: LLM_PROVIDERS }
  }

  /** 管理员视图：不含 key 明文/密文 */
  async getConfig(user: AuthUser): Promise<{ data: LlmConfigView }> {
    this.assertAdmin(user)
    const row = await this.prisma.tenantLlmConfig.findUnique({ where: { tenantId: user.tenantId } })
    return { data: toView(row) }
  }

  /** 成员可见：只告诉前端「是否接入真实模型」与模型名 */
  async getStatus(user: AuthUser) {
    const row = await this.prisma.tenantLlmConfig.findUnique({
      where: { tenantId: user.tenantId },
      select: { provider: true, model: true },
    })
    return {
      data: {
        enabled: !!row,
        provider: row?.provider ?? null,
        providerName: row ? (findProvider(row.provider)?.name ?? row.provider) : null,
        model: row?.model ?? null,
      },
    }
  }

  async saveConfig(user: AuthUser, dto: SaveLlmConfigDto): Promise<{ data: LlmConfigView }> {
    this.assertAdmin(user)
    const baseUrl = await this.resolveBaseUrl(dto.provider, dto.baseUrl)
    const existing = await this.prisma.tenantLlmConfig.findUnique({ where: { tenantId: user.tenantId } })
    const apiKey = dto.apiKey?.trim()
    if (!apiKey && !existing) throw ApiException.badRequest('首次配置必须填写 API Key')

    const keyFields = apiKey
      ? { apiKey: this.cipher.encrypt(apiKey), apiKeyKeyVersion: 1, apiKeyLast4: keyLast4(apiKey) }
      : {}
    const row = await this.prisma.tenantLlmConfig.upsert({
      where: { tenantId: user.tenantId },
      create: {
        tenantId: user.tenantId,
        provider: dto.provider,
        baseUrl,
        model: dto.model.trim(),
        updatedBy: user.userId,
        ...(keyFields as { apiKey: string; apiKeyKeyVersion: number; apiKeyLast4: string }),
      },
      update: { provider: dto.provider, baseUrl, model: dto.model.trim(), updatedBy: user.userId, ...keyFields },
    })

    // 审计只记末 4 位与「是否换 key」，绝不写密文/明文
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.userId,
      action: 'llm_config.update',
      resourceType: 'tenant_llm_config',
      resourceId: user.tenantId,
      before: existing ? { provider: existing.provider, baseUrl: existing.baseUrl, model: existing.model } : null,
      after: { provider: row.provider, baseUrl: row.baseUrl, model: row.model, keyChanged: !!apiKey, keyLast4: row.apiKeyLast4 },
    })
    return { data: toView(row) }
  }

  async removeConfig(user: AuthUser): Promise<{ data: { removed: boolean } }> {
    this.assertAdmin(user)
    const { count } = await this.prisma.tenantLlmConfig.deleteMany({ where: { tenantId: user.tenantId } })
    if (count > 0) {
      await this.audit.record({
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'llm_config.delete',
        resourceType: 'tenant_llm_config',
        resourceId: user.tenantId,
      })
    }
    return { data: { removed: count > 0 } }
  }

  /** 测试连接：入参覆盖已保存配置；失败以 ok=false 返回原因（200），便于设置页直接展示 */
  async testConfig(user: AuthUser, dto: TestLlmConfigDto): Promise<{ data: LlmTestResult }> {
    this.assertAdmin(user)
    const stored = await this.resolveTarget(user.tenantId)
    const provider = dto.provider ?? (await this.storedProvider(user.tenantId))
    let target: LlmTarget
    try {
      const baseUrl = dto.provider || dto.baseUrl
        ? await this.resolveBaseUrl(provider ?? 'custom', dto.baseUrl)
        : stored?.baseUrl
      const apiKey = dto.apiKey?.trim() || stored?.apiKey
      const model = dto.model?.trim() || stored?.model
      if (!baseUrl || !apiKey || !model) {
        return { data: { ok: false, kind: 'bad_request', message: '请填写完整的接口地址、模型名与 API Key' } }
      }
      target = { baseUrl, apiKey, model }
    } catch (err) {
      return { data: { ok: false, kind: 'bad_request', message: (err as Error).message } }
    }

    const started = Date.now()
    try {
      const out = await chatCompletion(
        target,
        { prompt: '请只回复：ok', maxTokens: 8, timeoutMs: TEST_TIMEOUT_MS },
        this.fetchImpl,
      )
      return { data: { ok: true, model: out.model, latencyMs: Date.now() - started } }
    } catch (err) {
      if (err instanceof LlmCallError) return { data: { ok: false, kind: err.kind, message: err.message } }
      throw err
    }
  }

  /** 文本生成（AI 规则页 / 智能协助）：未配置 → 40910，前端回落本地规则引擎 */
  async complete(user: AuthUser, dto: AiCompleteDto): Promise<{ data: ChatOutput }> {
    const target = await this.resolveTarget(user.tenantId)
    if (!target) {
      throw new ApiException(API_ERROR_CODES.AI_NOT_CONFIGURED, '团队尚未配置 AI 模型，请联系管理员在「设置 → AI 模型」中配置', HttpStatus.CONFLICT)
    }
    try {
      await assertSafeOutboundUrl(target.baseUrl)
      return { data: await chatCompletion(target, { prompt: dto.prompt, system: dto.system }, this.fetchImpl) }
    } catch (err) {
      if (err instanceof LlmCallError) throw ApiException.aiUnavailable(err.message)
      throw ApiException.aiUnavailable(`模型地址不可用：${(err as Error).message}`)
    }
  }

  /** 解密后的租户配置（内部用：项目拆解下发给 AI 服务）；未配置返回 null */
  async resolveTarget(tenantId: string): Promise<LlmTarget | null> {
    const row = await this.prisma.tenantLlmConfig.findUnique({ where: { tenantId } })
    if (!row) return null
    return { baseUrl: row.baseUrl, apiKey: this.cipher.decrypt(row.apiKey), model: row.model }
  }

  // ==================== helpers ====================

  private async storedProvider(tenantId: string): Promise<string | undefined> {
    const row = await this.prisma.tenantLlmConfig.findUnique({ where: { tenantId }, select: { provider: true } })
    return row?.provider
  }

  /** 厂商预设 / 自定义地址 → 规范化 + SSRF 校验 */
  private async resolveBaseUrl(provider: string, rawBaseUrl?: string): Promise<string> {
    const preset = findProvider(provider)
    if (!preset) throw ApiException.badRequest(`不支持的厂商：${provider}`)
    const baseUrl = normalizeBaseUrl(rawBaseUrl?.trim() || preset.baseUrl)
    if (!baseUrl) throw ApiException.badRequest('自定义厂商必须填写接口地址（Base URL）')
    try {
      await assertSafeOutboundUrl(baseUrl)
    } catch (err) {
      throw ApiException.badRequest(`接口地址不可用：${(err as Error).message}`)
    }
    return baseUrl
  }

  private assertAdmin(user: AuthUser) {
    if (!isTenantAdmin(user)) throw ApiException.forbidden('仅团队管理员可配置 AI 模型')
  }
}

function toView(
  row: { provider: string; baseUrl: string; model: string; apiKeyLast4: string; updatedAt: Date } | null,
): LlmConfigView {
  if (!row) {
    return { configured: false, provider: null, providerName: null, baseUrl: null, model: null, keyLast4: null, updatedAt: null }
  }
  return {
    configured: true,
    provider: row.provider,
    providerName: findProvider(row.provider)?.name ?? row.provider,
    baseUrl: row.baseUrl,
    model: row.model,
    keyLast4: row.apiKeyLast4,
    updatedAt: row.updatedAt.toISOString(),
  }
}
