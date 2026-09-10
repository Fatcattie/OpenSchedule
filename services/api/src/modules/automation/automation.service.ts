/**
 * automation.service.ts —— 自动化规则服务（B20）
 */
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../../common/prisma/prisma.service'
import { AuthUser } from '../../common/decorators/current-user.decorator'
import { matchRule, evaluateActions, SYSTEM_TEMPLATES } from './engine/rule-engine'
import type { RuleAction } from './engine/rule-engine'

const E = { NOT_FOUND: 40401, FORBIDDEN: 40301 } as const

export interface TemplateInfo {
  id: string
  name: string
  description: string
  triggerType: string
  triggerConfig: any
  conditionConfig: any
  actions: any[]
  category: string
}

@Injectable()
export class AutomationService {
  constructor(private prisma: PrismaService) {}

  // ========== 规则 CRUD ==========

  async listRules(user: AuthUser, options: { projectId?: string; triggerType?: string; isEnabled?: boolean } = {}) {
    const where: any = {
      tenantId: user.tenantId,
      deletedAt: null,
    }
    // 项目级规则 + 全局规则（projectId = null）
    if (options.projectId) {
      where.OR = [
        { projectId: options.projectId },
        { projectId: null },
      ]
    }
    if (options.triggerType) where.triggerType = options.triggerType
    if (options.isEnabled != null) where.isEnabled = options.isEnabled

    const rules = await this.prisma.automationRule.findMany({
      where,
      select: {
        id: true, name: true, description: true, triggerType: true, isEnabled: true,
        isSystem: true, triggerCount: true, lastTriggeredAt: true,
        projectId: true, createdAt: true, updatedAt: true,
      },
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    })
    return { data: rules }
  }

  async getRule(id: string, user: AuthUser) {
    const rule = await this.prisma.automationRule.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    })
    if (!rule) throw new NotFoundException('规则不存在')
    return { data: rule }
  }

  async createRule(user: AuthUser, input: {
    name: string
    description?: string
    projectId?: string
    triggerType: string
    triggerConfig?: any
    conditionConfig?: any
    actions: any[]
    isEnabled?: boolean
  }) {
    const rule = await this.prisma.automationRule.create({
      data: {
        tenantId: user.tenantId,
        projectId: input.projectId ?? null,
        name: input.name,
        description: input.description,
        triggerType: input.triggerType,
        triggerConfig: input.triggerConfig ?? {},
        conditionConfig: input.conditionConfig ?? null,
        actions: input.actions as any,
        isEnabled: input.isEnabled ?? true,
        createdBy: user.userId,
      },
      select: { id: true, name: true, triggerType: true, isEnabled: true, createdAt: true },
    })
    return { data: rule }
  }

  async updateRule(id: string, user: AuthUser, input: any) {
    const rule = await this.prisma.automationRule.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    })
    if (!rule) throw new NotFoundException('规则不存在')
    if (rule.isSystem) {
      throw new ForbiddenException('系统预设规则不可修改')
    }

    const data: any = {}
    const fields = ['name', 'description', 'triggerType', 'triggerConfig', 'conditionConfig', 'actions', 'isEnabled']
    for (const f of fields) {
      if (input[f] !== undefined) data[f] = input[f]
    }

    const updated = await this.prisma.automationRule.update({
      where: { id },
      data,
      select: { id: true, name: true, isEnabled: true, updatedAt: true },
    })
    return { data: updated }
  }

  async deleteRule(id: string, user: AuthUser) {
    const rule = await this.prisma.automationRule.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    })
    if (!rule) throw new NotFoundException('规则不存在')
    if (rule.isSystem) {
      throw new ForbiddenException('系统预设规则不可删除')
    }
    await this.prisma.automationRule.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
    return { data: { id, deleted: true } }
  }

  async toggleRule(id: string, user: AuthUser, isEnabled: boolean) {
    const rule = await this.prisma.automationRule.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    })
    if (!rule) throw new NotFoundException('规则不存在')
    const updated = await this.prisma.automationRule.update({
      where: { id },
      data: { isEnabled },
      select: { id: true, isEnabled: true },
    })
    return { data: updated }
  }

  // ========== 预设模板 ==========

  listTemplates(): { data: TemplateInfo[] } {
    const templates: TemplateInfo[] = [
      {
        id: 'tpl-overdue-reminder',
        name: '任务逾期自动提醒',
        description: '任务逾期时自动添加评论并通知负责人',
        triggerType: 'task_overdue',
        triggerConfig: {},
        conditionConfig: null,
        actions: [
          { type: 'add_comment', config: { content: '此任务已逾期，请尽快处理。' } },
          { type: 'send_notification', config: { content: '您有任务已逾期，请及时处理。', channel: 'inapp' } },
        ],
        category: '时间提醒',
      },
      {
        id: 'tpl-due-soon-3d',
        name: '临期 3 天提醒',
        description: '截止日前 3 天自动提醒，避免遗漏',
        triggerType: 'task_due_soon',
        triggerConfig: { days: 3 },
        conditionConfig: null,
        actions: [
          { type: 'add_comment', config: { content: '距离截止日还有 3 天，请注意进度。' } },
        ],
        category: '时间提醒',
      },
      {
        id: 'tpl-done-archive',
        name: '完成自动标记',
        description: '任务变为已完成时，自动添加「已完成」标签',
        triggerType: 'status_changed',
        triggerConfig: { toStatus: 'done' },
        conditionConfig: null,
        actions: [
          { type: 'add_label', config: { label: '已完成' } },
        ],
        category: '状态管理',
      },
      {
        id: 'tpl-high-priority-urgent',
        name: '高优先级自动标记',
        description: '任务设为高优先级时，自动添加「紧急」标签',
        triggerType: 'priority_changed',
        triggerConfig: { toPriority: 'high' },
        conditionConfig: null,
        actions: [
          { type: 'add_label', config: { label: '紧急' } },
        ],
        category: '优先级',
      },
      {
        id: 'tpl-bug-auto-high',
        name: 'Bug 自动提优先级',
        description: '添加 Bug 标签且优先级不高于 medium 时，自动提为 high',
        triggerType: 'label_added',
        triggerConfig: { label: 'Bug' },
        conditionConfig: { priorityLte: 'medium' },
        actions: [
          { type: 'set_priority', config: { priority: 'high' } },
        ],
        category: '标签联动',
      },
    ]
    return { data: templates }
  }

  // ========== 手动触发测试 ==========

  async triggerRule(id: string, user: AuthUser, taskId: string) {
    const rule = await this.prisma.automationRule.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    })
    if (!rule) throw new NotFoundException('规则不存在')

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, tenantId: user.tenantId, deletedAt: null },
    })
    if (!task) throw new NotFoundException('任务不存在')

    // 用规则引擎匹配
    const taskLike = {
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      assigneeId: task.assigneeId,
      dueAt: task.dueAt,
      tags: task.tags,
    }

    const matched = matchRule(rule as any, taskLike)
    if (!matched) {
      return { data: { matched: false, actions: [], reason: '规则与当前任务不匹配' } }
    }

    const actionResults = evaluateActions(rule.actions as any as RuleAction[], taskLike)
    return { data: { matched: true, actions: actionResults } }
  }

  // ========== 逾期扫描（手动触发，用于测试） ==========

  async scanOverdue(user: AuthUser, projectId?: string) {
    // 查所有启用的 task_overdue 规则
    const rules = await this.prisma.automationRule.findMany({
      where: {
        tenantId: user.tenantId,
        triggerType: 'task_overdue',
        isEnabled: true,
        deletedAt: null,
        ...(projectId ? { OR: [{ projectId }, { projectId: null }] } : {}),
      },
    })

    if (rules.length === 0) {
      return { data: { scanned: 0, matched: 0, triggerCount: 0 } }
    }

    const where: any = {
      tenantId: user.tenantId,
      deletedAt: null,
      dueAt: { lt: new Date() },
      status: { notIn: ['done', 'cancelled'] },
    }
    if (projectId) where.projectId = projectId

    const tasks = await this.prisma.task.findMany({ where })

    let totalMatched = 0
    let totalTriggered = 0

    for (const task of tasks) {
      const taskLike = {
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        assigneeId: task.assigneeId,
        dueAt: task.dueAt,
        tags: task.tags,
      }
      for (const rule of rules) {
        if (matchRule(rule as any, taskLike)) {
          totalMatched++
          // v1 只计数，不真正执行动作（避免测试时乱改数据）
          // 生产环境应调用 executeRuleActions
          totalTriggered++
          await this.prisma.automationRule.update({
            where: { id: rule.id },
            data: { triggerCount: { increment: 1 }, lastTriggeredAt: new Date() },
          })
        }
      }
    }

    return {
      data: {
        scanned: tasks.length,
        rulesCount: rules.length,
        matched: totalMatched,
        triggered: totalTriggered,
      },
    }
  }
}
