/**
 * rule-engine.ts —— 自动化规则引擎（B20，纯函数版）
 *
 * 核心模型：IFTTT（If This Then That）
 *   - 触发器（trigger）：规则何时被激活
 *   - 条件（condition）：激活后还要满足什么才执行（可选）
 *   - 动作（actions）：执行什么操作（可多个，按顺序）
 *
 * 本文件只包含纯函数（匹配判断 + 动作计算），不做副作用。
 * 副作用（修改任务、发通知、加评论等）由 service 层在动作结果指导下完成。
 */

// ========== 类型定义 ==========

export type TriggerType =
  | 'task_overdue'
  | 'task_due_soon'
  | 'status_changed'
  | 'label_added'
  | 'label_removed'
  | 'priority_changed'

export interface TriggerConfig {
  days?: number             // task_due_soon：临期天数
  fromStatus?: string       // status_changed
  toStatus?: string         // status_changed
  label?: string            // label_added / label_removed
  fromPriority?: string     // priority_changed
  toPriority?: string       // priority_changed
}

export interface RuleCondition {
  assigneeIds?: string[]
  excludeAssigneeIds?: string[]
  labels?: string[]         // AND：必须全部包含
  anyLabels?: string[]      // OR：包含任一即可
  noLabels?: string[]       // 不能包含这些
  priorityGte?: string      // high > medium > low
  priorityLte?: string
  statusIn?: string[]
  statusNotIn?: string[]
}

export type ActionType =
  | 'set_priority'
  | 'set_status'
  | 'set_assignee'
  | 'add_label'
  | 'remove_label'
  | 'add_comment'
  | 'send_notification'

export interface RuleAction {
  type: ActionType
  config: any
}

export interface RuleLike {
  id: string
  triggerType: string
  triggerConfig: any
  conditionConfig: any
  actions: any
  isEnabled: boolean
}

export interface TaskLike {
  id: string
  title: string
  status: string
  priority: string
  assigneeId?: string | null
  dueAt?: Date | string | null
  tags: string[]
  [key: string]: any
}

export interface EvalContext {
  eventType?: 'status_changed' | 'label_changed' | 'priority_changed' | 'scan_overdue' | 'scan_due_soon'
  changedFields?: {
    status?: { old: string; new: string }
    priority?: { old: string; new: string }
    labelsAdded?: string[]
    labelsRemoved?: string[]
  }
  now?: Date
}

export interface ActionResult {
  action: ActionType
  success: boolean
  target?: string          // 动作作用目标（如 priority、status、label 名）
  value?: any             // 新值
  detail?: string         // 人类可读描述
}

// ========== 常量 ==========

const PRIORITY_ORDER: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
}

// ========== 触发器匹配 ==========

/**
 * 判断一条规则在当前上下文下是否触发。
 * 注意：只判断触发器本身 + 条件，不执行动作。
 */
export function matchRule(rule: RuleLike, task: TaskLike, ctx: EvalContext = {}): boolean {
  if (!rule.isEnabled) return false

  const trigger = rule.triggerType as TriggerType
  const cfg = (rule.triggerConfig || {}) as TriggerConfig
  const now = ctx.now ?? new Date()

  // 1. 触发器匹配
  let triggerMatched = false

  switch (trigger) {
    case 'task_overdue':
      triggerMatched = isOverdue(task, now)
      break
    case 'task_due_soon': {
      const days = cfg.days ?? 3
      triggerMatched = isDueSoon(task, days, now)
      break
    }
    case 'status_changed': {
      if (ctx.eventType !== 'status_changed' || !ctx.changedFields?.status) return false
      const { old: oldStatus, new: newStatus } = ctx.changedFields.status
      if (cfg.fromStatus && oldStatus !== cfg.fromStatus) return false
      if (cfg.toStatus && newStatus !== cfg.toStatus) return false
      triggerMatched = true
      break
    }
    case 'label_added': {
      if (ctx.eventType !== 'label_changed') return false
      const added = ctx.changedFields?.labelsAdded ?? []
      if (cfg.label && !added.includes(cfg.label)) return false
      triggerMatched = added.length > 0
      break
    }
    case 'label_removed': {
      if (ctx.eventType !== 'label_changed') return false
      const removed = ctx.changedFields?.labelsRemoved ?? []
      if (cfg.label && !removed.includes(cfg.label)) return false
      triggerMatched = removed.length > 0
      break
    }
    case 'priority_changed': {
      if (ctx.eventType !== 'priority_changed' || !ctx.changedFields?.priority) return false
      const { old: oldP, new: newP } = ctx.changedFields.priority
      if (cfg.fromPriority && oldP !== cfg.fromPriority) return false
      if (cfg.toPriority && newP !== cfg.toPriority) return false
      triggerMatched = true
      break
    }
    default:
      return false
  }

  if (!triggerMatched) return false

  // 2. 条件匹配
  const cond = (rule.conditionConfig || null) as RuleCondition | null
  if (cond && !matchCondition(task, cond)) return false

  return true
}

function isOverdue(task: TaskLike, now: Date): boolean {
  if (!task.dueAt) return false
  const due = new Date(task.dueAt)
  // 截止日当天结束前不算逾期：dueAt 是当天 0 点的话，到当天 23:59:59 都还没逾期
  // 简化：dueAt < 今天 0 点才算逾期
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return due < today && task.status !== 'done' && task.status !== 'cancelled'
}

function isDueSoon(task: TaskLike, days: number, now: Date): boolean {
  if (!task.dueAt) return false
  if (task.status === 'done' || task.status === 'cancelled') return false
  const due = new Date(task.dueAt)
  const dueDate = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  return diffDays >= 0 && diffDays <= days
}

// ========== 条件匹配 ==========

function matchCondition(task: TaskLike, cond: RuleCondition): boolean {
  // 负责人在名单内
  if (cond.assigneeIds && cond.assigneeIds.length > 0) {
    if (!task.assigneeId || !cond.assigneeIds.includes(task.assigneeId)) return false
  }
  // 负责人不在名单内
  if (cond.excludeAssigneeIds && cond.excludeAssigneeIds.length > 0) {
    if (task.assigneeId && cond.excludeAssigneeIds.includes(task.assigneeId)) return false
  }
  // 必须包含所有标签（AND）
  if (cond.labels && cond.labels.length > 0) {
    const tags = task.tags || []
    if (!cond.labels.every(l => tags.includes(l))) return false
  }
  // 包含任一标签（OR）
  if (cond.anyLabels && cond.anyLabels.length > 0) {
    const tags = task.tags || []
    if (!cond.anyLabels.some(l => tags.includes(l))) return false
  }
  // 不能包含这些标签
  if (cond.noLabels && cond.noLabels.length > 0) {
    const tags = task.tags || []
    if (cond.noLabels.some(l => tags.includes(l))) return false
  }
  // 优先级 >=
  if (cond.priorityGte) {
    const taskP = PRIORITY_ORDER[task.priority] ?? 0
    const targetP = PRIORITY_ORDER[cond.priorityGte] ?? 0
    if (taskP < targetP) return false
  }
  // 优先级 <=
  if (cond.priorityLte) {
    const taskP = PRIORITY_ORDER[task.priority] ?? 0
    const targetP = PRIORITY_ORDER[cond.priorityLte] ?? 0
    if (taskP > targetP) return false
  }
  // 状态在名单内
  if (cond.statusIn && cond.statusIn.length > 0) {
    if (!cond.statusIn.includes(task.status)) return false
  }
  // 状态不在名单内
  if (cond.statusNotIn && cond.statusNotIn.length > 0) {
    if (cond.statusNotIn.includes(task.status)) return false
  }
  return true
}

// ========== 动作执行（纯计算，返回动作结果，不做副作用） ==========

/**
 * 计算动作效果（纯函数，不修改任务）。
 * service 层根据返回的 ActionResult 列表执行实际副作用。
 */
export function evaluateActions(actions: RuleAction[], task: TaskLike): ActionResult[] {
  const results: ActionResult[] = []
  for (const action of actions) {
    results.push(evaluateOneAction(action, task))
  }
  return results
}

function evaluateOneAction(action: RuleAction, task: TaskLike): ActionResult {
  const cfg = action.config || {}
  switch (action.type) {
    case 'set_priority': {
      const priority = cfg.priority
      if (!priority || !PRIORITY_ORDER[priority]) {
        return { action: 'set_priority', success: false, detail: `无效优先级：${priority}` }
      }
      if (task.priority === priority) {
        return { action: 'set_priority', success: true, target: 'priority', value: priority, detail: '优先级已相同，无需变更' }
      }
      return { action: 'set_priority', success: true, target: 'priority', value: priority, detail: `设置优先级为 ${priority}` }
    }
    case 'set_status': {
      const status = cfg.status
      if (!status) {
        return { action: 'set_status', success: false, detail: '未指定状态' }
      }
      if (task.status === status) {
        return { action: 'set_status', success: true, target: 'status', value: status, detail: '状态已相同，无需变更' }
      }
      return { action: 'set_status', success: true, target: 'status', value: status, detail: `设置状态为 ${status}` }
    }
    case 'set_assignee': {
      const assigneeId = cfg.assigneeId
      if (!assigneeId) {
        return { action: 'set_assignee', success: false, detail: '未指定负责人' }
      }
      if (task.assigneeId === assigneeId) {
        return { action: 'set_assignee', success: true, target: 'assigneeId', value: assigneeId, detail: '负责人已相同，无需变更' }
      }
      return { action: 'set_assignee', success: true, target: 'assigneeId', value: assigneeId, detail: `设置负责人为 ${assigneeId}` }
    }
    case 'add_label': {
      const label = cfg.label
      if (!label) {
        return { action: 'add_label', success: false, detail: '未指定标签' }
      }
      const tags = task.tags || []
      if (tags.includes(label)) {
        return { action: 'add_label', success: true, target: label, value: true, detail: '标签已存在，跳过' }
      }
      return { action: 'add_label', success: true, target: label, value: true, detail: `添加标签：${label}` }
    }
    case 'remove_label': {
      const label = cfg.label
      if (!label) {
        return { action: 'remove_label', success: false, detail: '未指定标签' }
      }
      const tags = task.tags || []
      if (!tags.includes(label)) {
        return { action: 'remove_label', success: true, target: label, value: false, detail: '标签不存在，跳过' }
      }
      return { action: 'remove_label', success: true, target: label, value: false, detail: `移除标签：${label}` }
    }
    case 'add_comment': {
      const content = cfg.content
      if (!content) {
        return { action: 'add_comment', success: false, detail: '未指定评论内容' }
      }
      return { action: 'add_comment', success: true, target: 'comment', value: content, detail: `添加评论：${content.slice(0, 30)}` }
    }
    case 'send_notification': {
      const content = cfg.content
      if (!content) {
        return { action: 'send_notification', success: false, detail: '未指定通知内容' }
      }
      return {
        action: 'send_notification',
        success: true,
        target: cfg.channel || 'inapp',
        value: content,
        detail: `发送${cfg.channel || '站内'}通知：${content.slice(0, 30)}`,
      }
    }
    default:
      return { action: action.type as any, success: false, detail: `未知动作类型：${action.type}` }
  }
}

// ========== 批量匹配（从多条规则中找出匹配的） ==========

export function findMatchingRules(
  rules: RuleLike[],
  task: TaskLike,
  ctx: EvalContext = {},
): RuleLike[] {
  return rules.filter(r => matchRule(r, task, ctx))
}

// ========== 预设模板 ==========

export const SYSTEM_TEMPLATES: Omit<RuleLike, 'id'>[] = [
  {
    triggerType: 'task_overdue',
    triggerConfig: {},
    conditionConfig: null,
    actions: [
      { type: 'add_comment', config: { content: '此任务已逾期，请尽快处理。' } },
      { type: 'send_notification', config: { content: '您有任务已逾期，请及时处理。', channel: 'inapp' } },
    ],
    isEnabled: false,
  },
  {
    triggerType: 'task_due_soon',
    triggerConfig: { days: 3 },
    conditionConfig: null,
    actions: [
      { type: 'add_comment', config: { content: '距离截止日还有 3 天，请注意进度。' } },
    ],
    isEnabled: false,
  },
  {
    triggerType: 'status_changed',
    triggerConfig: { toStatus: 'done' },
    conditionConfig: null,
    actions: [
      { type: 'add_label', config: { label: '已完成' } },
    ],
    isEnabled: false,
  },
  {
    triggerType: 'priority_changed',
    triggerConfig: { toPriority: 'high' },
    conditionConfig: null,
    actions: [
      { type: 'add_label', config: { label: '紧急' } },
    ],
    isEnabled: false,
  },
  {
    triggerType: 'label_added',
    triggerConfig: { label: 'Bug' },
    conditionConfig: { priorityLte: 'medium' },
    actions: [
      { type: 'set_priority', config: { priority: 'high' } },
    ],
    isEnabled: false,
  },
]
