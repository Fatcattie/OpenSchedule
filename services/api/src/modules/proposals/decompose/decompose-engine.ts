/**
 * decompose-engine.ts —— AI 拆解引擎（纯函数，确定性）
 *
 * 两种模式：
 *  A. 模板模式：克隆模板任务快照 + {{goal}} 占位替换 + 模板依赖索引映射
 *  B. 启发式模式：按标点切分目标 + 关键词估时 + FS 串联依赖 + isShared 检测
 *
 * 排期：与 CPM 集成（calculateCPM），estimateHours → durationDays = hours/8
 */

import { calculateCPM, type TaskInput, type DependencyOutput } from '../../dependencies/cpm/cpm'

export interface TemplateTask {
  title: string
  description?: string | null
  estimatedHours?: number | null
  isShared?: boolean
  priority?: string | null
}

export interface DecomposeInput {
  goalTitle: string
  goalDescription?: string
  templateTasks?: TemplateTask[]
  templateDependencies?: Array<{ fromIndex: number; toIndex: number; type: string; lagDays?: number }>
  totalEstimatedHours?: number
  startDate?: string
}

export interface DecomposeTask {
  title: string
  description: string
  estimatedHours: number
  isShared: boolean
  priority: 'urgent' | 'high' | 'medium' | 'low'
  earliestStart?: string
  earliestFinish?: string
}

export interface DecomposeDependency {
  fromIndex: number
  toIndex: number
  type: 'FS' | 'SS' | 'FF' | 'SF'
  lagDays: number
}

export interface DecomposeResult {
  summary: string
  tasks: DecomposeTask[]
  dependencies: DecomposeDependency[]
  warnings: string[]
}

// ============ 关键词常量 ============

/** 关键词 → 估时（小时） */
const KEYWORD_HOURS: Array<[RegExp, number]> = [
  [/设计|架构|方案/, 8],
  [/开发|实现|编码|搭建|写代码/, 16],
  [/测试|验证|验收/, 8],
  [/文档|说明|手册|wiki|总结/, 4],
  [/调研|评估|选型|对比/, 8],
  [/部署|发布|上线|运维/, 4],
  [/联调|对接|集成/, 8],
  [/数据库|建模|表结构/, 8],
]

/** 默认估时（小时） */
const DEFAULT_HOURS = 8

/** isShared 检测关键词 */
const SHARED_KEYWORDS = ['公共', '共享', '基础', '通用', '脚手架', '依赖前置', '基建']

/** 高优先级检测关键词 */
const HIGH_PRIORITY_KEYWORDS = ['紧急', '尽快', 'bug', '缺陷', '修复', '故障']

/** 切分标点 */
const SPLIT_REGEX = /[；;。\n、，,]+/

/** 拆解片段数量告警阈值（方案书：>8-10 步质量退化） */
const MAX_STEPS = 12

/** 目标占位符 */
const GOAL_PLACEHOLDER = /\{\{\s*goal\s*\}\}/g

// ============ 主入口 ============

/**
 * 生成拆解建议（纯函数）
 */
export function decompose(input: DecomposeInput): DecomposeResult {
  const title = input.goalTitle.trim()
  const warnings: string[] = []

  if (input.templateTasks) {
    if (input.templateTasks.length === 0) {
      warnings.push('模板为空，已降级为启发式拆解')
      return decomposeHeuristic(input, title, warnings)
    }
    return decomposeFromTemplate(input, title, warnings)
  }
  return decomposeHeuristic(input, title, warnings)
}

// ============ A. 模板模式 ============

function decomposeFromTemplate(
  input: DecomposeInput,
  goalTitle: string,
  warnings: string[],
): DecomposeResult {
  const tplTasks = input.templateTasks!
  const tasks: DecomposeTask[] = tplTasks.map(t => ({
    title: t.title.replace(GOAL_PLACEHOLDER, goalTitle),
    description: t.description ?? '',
    estimatedHours: estimateHours(t.estimatedHours ?? null),
    isShared: !!t.isShared,
    priority: normalizePriority(t.priority),
  }))

  // 用户给了总估时且模板任务全部无估时 → 均分
  if (input.totalEstimatedHours && tasks.every(t => t.estimatedHours === DEFAULT_HOURS)) {
    const total = Math.max(input.totalEstimatedHours, tasks.length)
    const base = Math.floor(total / tasks.length)
    tasks.forEach((t, i) => {
      t.estimatedHours = i === tasks.length - 1 ? total - base * (tasks.length - 1) : base
    })
  }

  const dependencies: DecomposeDependency[] = (input.templateDependencies ?? []).map(d => ({
    fromIndex: d.fromIndex,
    toIndex: d.toIndex,
    type: normalizeDepType(d.type),
    lagDays: d.lagDays ?? 0,
  }))

  if (tasks.length === 0) {
    warnings.push('模板为空，未生成任何子任务')
  }

  return {
    summary: `基于模板将「${goalTitle}」拆解为 ${tasks.length} 个子任务`,
    tasks,
    dependencies,
    warnings,
  }
}

// ============ B. 启发式模式 ============

function decomposeHeuristic(
  input: DecomposeInput,
  goalTitle: string,
  warnings: string[],
): DecomposeResult {
  // 1. 切分
  const fragments = goalTitle.split(SPLIT_REGEX).map(s => s.trim()).filter(s => s.length > 0)

  let tasks: DecomposeTask[]
  if (fragments.length <= 1) {
    // 单段 → 单任务兜底
    tasks = [{
      title: goalTitle,
      description: input.goalDescription ?? '',
      estimatedHours: estimateFromTitle(goalTitle, input.totalEstimatedHours),
      isShared: isSharedTitle(goalTitle),
      priority: priorityFromTitle(goalTitle),
    }]
  } else {
    if (fragments.length > MAX_STEPS) {
      warnings.push(`拆解片段达 ${fragments.length} 个，超过 ${MAX_STEPS} 个建议上限，质量可能下降`)
    }
    tasks = fragments.map(frag => ({
      title: frag,
      description: input.goalDescription ?? '',
      estimatedHours: estimateFromTitle(frag, input.totalEstimatedHours),
      isShared: isSharedTitle(frag),
      priority: priorityFromTitle(frag),
    }))

    // 有总估时 → 均分覆盖
    if (input.totalEstimatedHours && tasks.length > 0) {
      const total = Math.max(input.totalEstimatedHours, tasks.length)
      const base = Math.floor(total / tasks.length)
      tasks = tasks.map((t, i) => ({
        ...t,
        estimatedHours: i === tasks.length - 1 ? total - base * (tasks.length - 1) : base,
      }))
    }
  }

  // 2. 依赖：按顺序 FS 串联
  const dependencies: DecomposeDependency[] = []
  for (let i = 0; i < tasks.length - 1; i++) {
    dependencies.push({
      fromIndex: i,
      toIndex: i + 1,
      type: 'FS',
      lagDays: 0,
    })
  }

  return {
    summary: `根据目标将「${goalTitle}」拆解为 ${tasks.length} 个子任务`,
    tasks,
    dependencies,
    warnings,
  }
}

// ============ 排期 ============

/**
 * 对拆解建议做 CPM 排期（就地填充 earliestStart/earliestFinish）
 * @returns 排期结果摘要（每任务的开始/结束日期）
 */
export function scheduleDecompose(
  result: DecomposeResult,
  options: { startDate?: string } = {},
): {
  tasks: DecomposeTask[]
  projectEta: string | null
  criticalPath: string[]
} {
  const startRaw = options.startDate ? new Date(options.startDate) : new Date()
  const startDate = new Date(Date.UTC(startRaw.getFullYear(), startRaw.getMonth(), startRaw.getDate()))

  const taskInputs: TaskInput[] = result.tasks.map((t, i) => ({
    id: `suggest-${i}`,
    title: t.title,
    status: 'todo',
    estimatedHours: t.estimatedHours,
    dueAt: null,
  }))

  const depOutputs: DependencyOutput[] = result.dependencies.map((d, i) => ({
    id: `dep-${i}`,
    prevTaskId: `suggest-${d.fromIndex}`,
    nextTaskId: `suggest-${d.toIndex}`,
    type: d.type,
    lagDays: d.lagDays,
    isShared: false,
  }))

  const plan = calculateCPM('suggest', taskInputs, depOutputs, startDate)

  // 填充任务排期
  const tasks = result.tasks.map((t, i) => {
    const pt = plan.tasks.find(p => p.id === `suggest-${i}`)
    return {
      ...t,
      earliestStart: pt?.es ?? undefined,
      earliestFinish: pt?.ef ?? undefined,
    }
  })

  return {
    tasks,
    projectEta: plan.projectEta ? plan.projectEta : null,
    criticalPath: plan.criticalPath ?? [],
  }
}

// ============ helpers ============

function estimateHours(tplHours: number | null): number {
  if (tplHours && tplHours > 0) return tplHours
  return DEFAULT_HOURS
}

function estimateFromTitle(title: string, totalHours?: number): number {
  if (totalHours && totalHours > 0) return DEFAULT_HOURS // 总估时模式由调用方均分
  for (const [regex, hours] of KEYWORD_HOURS) {
    if (regex.test(title)) return hours
  }
  return DEFAULT_HOURS
}

function isSharedTitle(title: string): boolean {
  const lower = title.toLowerCase()
  return SHARED_KEYWORDS.some(k => lower.includes(k))
}

function priorityFromTitle(title: string): DecomposeTask['priority'] {
  const lower = title.toLowerCase()
  if (HIGH_PRIORITY_KEYWORDS.some(k => lower.includes(k))) return 'high'
  return 'medium'
}

function normalizePriority(p?: string | null): DecomposeTask['priority'] {
  if (p === 'urgent' || p === 'high' || p === 'low') return p
  return 'medium'
}

function normalizeDepType(t?: string): DecomposeDependency['type'] {
  if (t === 'SS' || t === 'FF' || t === 'SF') return t
  return 'FS'
}
