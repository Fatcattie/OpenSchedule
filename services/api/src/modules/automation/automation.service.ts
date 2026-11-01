/**
 * automation.service.ts —— 自动化规则服务（B20）
 */
import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common'
import { AutomationRule, Prisma, Task } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { AuditService } from '../../common/audit/audit.service'
import { AuthUser } from '../../common/decorators/current-user.decorator'
import { NotificationsService } from '../notifications/notifications.service'
import { matchRule, evaluateActions, SYSTEM_TEMPLATES } from './engine/rule-engine'
import type { RuleAction, RuleLike, TaskLike } from './engine/rule-engine'
import { taskEventToAutomationTrigger } from './automation-trigger'

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
  private readonly logger = new Logger(AutomationService.name)

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

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
    // R4 审计：automation.rule.create（规则变更为 §3.3 重点审计面）
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.userId, action: 'automation.rule.create',
      resourceType: 'automation_rule', resourceId: rule.id,
      after: { name: rule.name, triggerType: rule.triggerType, isEnabled: rule.isEnabled },
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
    // R4 审计：automation.rule.update
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.userId, action: 'automation.rule.update',
      resourceType: 'automation_rule', resourceId: id,
      before: { name: rule.name, isEnabled: rule.isEnabled },
      after: updated,
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
    // R4 审计：automation.rule.delete
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.userId, action: 'automation.rule.delete',
      resourceType: 'automation_rule', resourceId: id,
      before: { name: rule.name, triggerType: rule.triggerType, isEnabled: rule.isEnabled },
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
    // R4 审计：automation.rule.toggle
    await this.audit.record({
      tenantId: user.tenantId, actorId: user.userId, action: 'automation.rule.toggle',
      resourceType: 'automation_rule', resourceId: id,
      before: { isEnabled: rule.isEnabled },
      after: updated,
    })
    return { data: updated }
  }

  // ========== 事件触发接线（R6-3：task.* 事件 → 规则引擎 → 执行动作）==========

  /** 处理任务事件（由 automation.listener 接 task.created / task.status_changed；task.completed 由 status_changed(to=done) 覆盖） */
  async handleTaskEvent(eventName: string, payload: Record<string, unknown>): Promise<void> {
    const trigger = taskEventToAutomationTrigger(eventName, payload)
    if (!trigger) return
    const taskId = payload.taskId as string | undefined
    const tenantId = payload.tenantId as string | undefined
    if (!taskId || !tenantId) return

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, tenantId, deletedAt: null },
    })
    if (!task) return

    const rules = await this.prisma.automationRule.findMany({
      where: {
        tenantId,
        triggerType: trigger.triggerType,
        isEnabled: true,
        deletedAt: null,
        OR: [{ projectId: null }, { projectId: task.projectId }],
      },
    })
    if (rules.length === 0) return

    const taskLike: TaskLike = {
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      assigneeId: task.assigneeId,
      dueAt: task.dueAt,
      tags: task.tags,
    }

    let triggered = 0
    for (const rule of rules) {
      if (!matchRule(rule as unknown as RuleLike, taskLike, trigger.ctx)) continue
      await this.executeRuleActions(task, rule, payload)
      await this.prisma.automationRule
        .update({ where: { id: rule.id }, data: { triggerCount: { increment: 1 }, lastTriggeredAt: new Date() } })
        .catch(() => undefined)
      triggered++
    }
    if (triggered > 0) {
      this.audit.record({
        tenantId,
        actorId: (payload.actor as { id?: string } | undefined)?.id ?? null,
        actorType: 'system',
        action: 'automation.rule.triggered',
        resourceType: 'automation_rule',
        resourceId: null,
        after: { taskId, eventName, triggered },
      })
    }
  }

  /** 执行规则动作副作用（set_priority/set_status/set_assignee/add_label/remove_label/add_comment/send_notification） */
  private async executeRuleActions(task: Task, rule: AutomationRule, payload: Record<string, unknown>): Promise<void> {
    const actions = rule.actions as unknown as RuleAction[]
    for (const action of actions) {
      const cfg = action.config || {}
      try {
        switch (action.type) {
          case 'set_priority':
            if (cfg.priority && cfg.priority !== task.priority) {
              await this.prisma.task.update({ where: { id: task.id }, data: { priority: cfg.priority } })
            }
            break
          case 'set_status':
            // 系统特权直写；终态（done/cancelled）防规则回退（§2.3 状态机语义）
            if (cfg.status && task.status !== 'done' && task.status !== 'cancelled') {
              await this.prisma.task.update({ where: { id: task.id }, data: { status: cfg.status } })
            }
            break
          case 'set_assignee':
            if (cfg.assigneeId && cfg.assigneeId !== task.assigneeId) {
              await this.prisma.task.update({ where: { id: task.id }, data: { assigneeId: cfg.assigneeId } })
            }
            break
          case 'add_label': {
            const tags = task.tags ?? []
            if (cfg.label && !tags.includes(cfg.label)) {
              await this.prisma.task.update({ where: { id: task.id }, data: { tags: [...tags, cfg.label] } })
            }
            break
          }
          case 'remove_label': {
            const tags = (task.tags ?? []).filter((t) => t !== cfg.label)
            await this.prisma.task.update({ where: { id: task.id }, data: { tags } })
            break
          }
          case 'add_comment':
            if (cfg.content) {
              await this.prisma.taskComment.create({
                data: { tenantId: task.tenantId, taskId: task.id, authorId: null, content: String(cfg.content) },
              })
            }
            break
          case 'send_notification':
            await this.dispatchAutomationNotification(task, rule, action, payload)
            break
        }
      } catch (err) {
        this.logger.warn(`自动化动作执行失败 rule=${rule.id} action=${action.type}: ${(err as Error).message}`)
      }
    }
  }

  /** 自动化通知：target=creator/assignee/project_owner（默认 assignee）；跳过通知操作者本人 */
  private async dispatchAutomationNotification(task: Task, rule: AutomationRule, action: RuleAction, payload: Record<string, unknown>): Promise<void> {
    const cfg = action.config || {}
    const content = String(cfg.content ?? '')
    if (!content) return
    const target = cfg.target ?? 'assignee'
    let userId: string | null | undefined
    if (target === 'creator') userId = task.createdBy
    else if (target === 'project_owner') {
      const project = await this.prisma.project.findFirst({ where: { id: task.projectId!, tenantId: task.tenantId }, select: { ownerId: true } })
      userId = project?.ownerId
    } else userId = task.assigneeId
    if (!userId) return
    const actorId = (payload.actor as { id?: string } | undefined)?.id
    if (userId === actorId) return
    await this.notifications.notify({
      tenantId: task.tenantId,
      userId,
      type: 'automation.rule.triggered',
      title: `${content}：「${task.title}」`,
      data: { taskId: task.id, projectId: task.projectId, ruleId: rule.id },
    })
  }

  /** 内置系统规则演示闭环（R6-3 / §3.2）：done 自动标记 + done 通知创建者（幂等；租户创建时调用） */
  async seedTenantRules(tenantId: string): Promise<void> {
    const demos = [
      {
        name: '任务完成自动标记',
        triggerType: 'status_changed',
        triggerConfig: { toStatus: 'done' },
        conditionConfig: null,
        actions: [{ type: 'add_label', config: { label: '已完成' } }],
      },
      {
        name: '任务完成通知创建者',
        triggerType: 'status_changed',
        triggerConfig: { toStatus: 'done' },
        conditionConfig: null,
        actions: [{ type: 'send_notification', config: { content: '你创建的任务已完成', channel: 'inapp', target: 'creator' } }],
      },
    ]
    for (const demo of demos) {
      const existing = await this.prisma.automationRule.findFirst({
        where: { tenantId, isSystem: true, name: demo.name, deletedAt: null },
        select: { id: true },
      })
      if (existing) continue
      await this.prisma.automationRule.create({
        data: {
          tenantId,
          projectId: null,
          name: demo.name,
          description: demo.name,
          triggerType: demo.triggerType,
          triggerConfig: demo.triggerConfig,
          conditionConfig: demo.conditionConfig ?? Prisma.JsonNull,
          actions: demo.actions,
          isEnabled: true,
          isSystem: true,
          createdBy: null,
        },
      })
    }
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
