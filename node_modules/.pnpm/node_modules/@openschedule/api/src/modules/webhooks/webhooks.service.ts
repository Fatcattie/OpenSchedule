/**
 * webhooks.service.ts
 */
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../common/prisma/prisma.service'
import { AuditService } from '../../common/audit/audit.service'
import { AuthUser } from '../../common/decorators/current-user.decorator'
import { assertSafeOutboundUrl } from '../../common/security/url-guard'
import { CredentialCipher } from '../../common/security/credential-cipher'
import { generateSigningSecret, computeSignature } from './webhook-signer'

// 支持的事件类型列表（v1）
export const SUPPORTED_EVENTS = [
  { type: 'task.created', name: '任务创建', category: '任务', description: '新任务被创建时触发' },
  { type: 'task.updated', name: '任务更新', category: '任务', description: '任务属性变更时触发（状态/优先级/负责人等）' },
  { type: 'task.deleted', name: '任务删除', category: '任务', description: '任务被删除时触发' },
  { type: 'task.completed', name: '任务完成', category: '任务', description: '任务状态变为已完成时触发' },
  { type: 'project.created', name: '项目创建', category: '项目', description: '新项目被创建时触发' },
  { type: 'project.updated', name: '项目更新', category: '项目', description: '项目属性变更时触发' },
  { type: 'project.deleted', name: '项目删除', category: '项目', description: '项目被删除时触发' },
]

@Injectable()
export class WebhooksService {
  constructor(
    private prisma: PrismaService,
    private cipher: CredentialCipher,
    private audit: AuditService,
  ) {}

  /** 支持的事件类型列表 */
  listEvents() {
    return { data: SUPPORTED_EVENTS }
  }

  async list(user: AuthUser) {
    const hooks = await this.prisma.webhook.findMany({
      where: { tenantId: user.tenantId, deletedAt: null },
      select: {
        id: true, name: true, url: true, events: true, isActive: true,
        triggerCount: true, failureCount: true, lastTriggeredAt: true,
        createdAt: true, updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    return { data: hooks }
  }

  async get(id: string, user: AuthUser) {
    const hook = await this.prisma.webhook.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    })
    if (!hook) throw new NotFoundException('Webhook 不存在')
    // 不返回 secret
    const { secret: _secret, ...rest } = hook
    return { data: rest }
  }

  async create(user: AuthUser, input: { name: string; url: string; events: string[]; isActive?: boolean }) {
    // 验证事件类型
    const validTypes = new Set(SUPPORTED_EVENTS.map(e => e.type))
    for (const ev of input.events) {
      if (!validTypes.has(ev)) {
        throw new BadRequestException(`不支持的事件类型: ${ev}`)
      }
    }
    if (input.events.length === 0) {
      throw new BadRequestException('至少订阅一个事件')
    }
    // R4 SSRF 防护：URL 解析后不得指向内网/环回/元数据地址（§3.3）
    await this.assertSafeUrl(input.url)

    // R4 凭据治理：secret 以 AES-256-GCM 密文落库（schema secret 列注释既有契约）；明文只作一次性返回
    const secretPlain = generateSigningSecret()
    const secret = this.cipher.encrypt(secretPlain)

    const hook = await this.prisma.webhook.create({
      data: {
        tenantId: user.tenantId,
        name: input.name,
        url: input.url,
        secret,
        events: input.events,
        isActive: input.isActive ?? true,
        createdBy: user.userId,
      },
      select: {
        id: true, name: true, url: true, events: true, isActive: true, createdAt: true,
      },
    })

    // R4 审计：webhook.create（after 绝不写 secret 明文/密文）
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.userId,
      action: 'webhook.create',
      resourceType: 'webhook',
      resourceId: hook.id,
      after: { name: hook.name, url: hook.url, events: hook.events, isActive: hook.isActive },
    })

    // 仅创建时返回一次明文 secret（前端保存后不再可见）
    return {
      data: {
        ...hook,
        signingSecret: secretPlain, // 一次性明文，仅本次响应
      },
    }
  }

  async update(id: string, user: AuthUser, input: any) {
    const hook = await this.prisma.webhook.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    })
    if (!hook) throw new NotFoundException('Webhook 不存在')

    // 如果更新事件列表，验证有效性
    if (input.events) {
      const validTypes = new Set(SUPPORTED_EVENTS.map(e => e.type))
      for (const ev of input.events) {
        if (!validTypes.has(ev)) {
          throw new BadRequestException(`不支持的事件类型: ${ev}`)
        }
      }
    }
    // R4 SSRF 防护：URL 变更时同样校验（§3.3）
    if (input.url !== undefined) await this.assertSafeUrl(input.url)

    const data: any = {}
    for (const f of ['name', 'url', 'events', 'isActive']) {
      if (input[f] !== undefined) data[f] = input[f]
    }

    const updated = await this.prisma.webhook.update({
      where: { id },
      data,
      select: { id: true, name: true, url: true, events: true, isActive: true, updatedAt: true },
    })
    // R4 审计：webhook.update（after 绝不写 secret 明文/密文）
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.userId,
      action: 'webhook.update',
      resourceType: 'webhook',
      resourceId: id,
      before: { name: hook.name, url: hook.url, events: hook.events, isActive: hook.isActive },
      after: updated,
    })
    return { data: updated }
  }

  async remove(id: string, user: AuthUser) {
    const hook = await this.prisma.webhook.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    })
    if (!hook) throw new NotFoundException('Webhook 不存在')
    await this.prisma.webhook.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
    // R4 审计：webhook.remove
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.userId,
      action: 'webhook.remove',
      resourceType: 'webhook',
      resourceId: id,
      before: { name: hook.name, url: hook.url, events: hook.events },
    })
    return { data: { id, deleted: true } }
  }

  async toggle(id: string, user: AuthUser, isActive: boolean) {
    const hook = await this.prisma.webhook.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    })
    if (!hook) throw new NotFoundException('Webhook 不存在')
    const updated = await this.prisma.webhook.update({
      where: { id },
      data: { isActive },
      select: { id: true, isActive: true },
    })
    // R4 审计：webhook.toggle
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.userId,
      action: 'webhook.toggle',
      resourceType: 'webhook',
      resourceId: id,
      before: { isActive: hook.isActive },
      after: updated,
    })
    return { data: updated }
  }

  /**
   * 发送测试事件（ping）
   * v1 模拟：只计算签名 + 构造 payload，不实际发送 HTTP 请求（避免依赖外部）
   * 返回 payload 和签名，供前端调试展示
   */
  async test(id: string, user: AuthUser) {
    const hook = await this.prisma.webhook.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    })
    if (!hook) throw new NotFoundException('Webhook 不存在')

    const now = Math.floor(Date.now() / 1000)
    const payload = {
      event: 'ping',
      timestamp: new Date().toISOString(),
      deliveryId: 'wh_dlv_test_' + Math.random().toString(36).slice(2, 10),
      tenantId: user.tenantId,
      data: { message: 'Hello from OpenSchedule Webhook!' },
    }
    const body = JSON.stringify(payload)
    // R4 凭据治理：secret 密文存储，取用时解密还原明文算签名（不落日志）
    const signature = computeSignature(this.cipher.decrypt(hook.secret), body, now)

    // v1 只返回测试数据，不实际发送
    return {
      data: {
        wouldSendTo: hook.url,
        payload,
        headers: {
          'X-Webhook-Event': 'ping',
          'X-Webhook-Timestamp': String(now),
          'X-Webhook-Signature': signature,
          'X-Webhook-Delivery-Id': payload.deliveryId,
        },
        note: 'v1 仅返回模拟数据，不实际发送 HTTP 请求。生产环境会 POST 到目标 URL。',
      },
    }
  }

  /** R4 SSRF 防护：URL 校验失败转 BadRequest（内网/环回/元数据/非 http） */
  private async assertSafeUrl(url: string): Promise<void> {
    try {
      await assertSafeOutboundUrl(url)
    } catch (err) {
      throw new BadRequestException((err as Error).message || 'Webhook URL 不安全')
    }
  }
}
