/**
 * 职责：AI 规则引擎 —— 内置行业 × 任务类型经验库、规则匹配、提示词渲染、Agent 可插拔调用
 *
 * 覆盖需求：
 * - 需求 1：拆解不再是关键词硬编码，而是按「行业类型 × 任务类型」匹配经验模板生成
 * - 需求 2：所有 AI 场景的提示词都由规则页集中维护，此处只负责渲染与执行
 *
 * 模型接入：团队管理员在「设置 → AI 模型」配置后，经后端 POST /ai/complete 调真实模型（key 不出服务端）；
 * 未配置或调用失败时自动回退到本地规则引擎，保证功能始终可用。
 */
import dayjs from 'dayjs'
import { aiComplete, getAiStatus } from '@/api/llmApi'
import type { AiRule, AiScene, DecomposeTask, RuleMatchInput, SopFlow, SopNode } from '@/types'
import { newSopNodeId } from '@/types'

const presetTime = '2026-01-01T00:00:00.000Z'

/** 拆解场景默认提示词模板 */
const DECOMPOSE_PROMPT = `你是资深项目管理专家，熟悉{{industry}}行业的{{taskType}}工作流。

任务目标：{{title}}
背景说明：{{description}}
计划总工时：{{totalHours}} 小时
计划开始日期：{{startDate}}

可参考的标准拆解步骤（允许按实际情况增删）：
{{steps}}

请输出严格 JSON 数组，每项字段：
- title：子任务名称（动宾短语，不超过 20 字）
- estimatedHours：估时小时数（数字）
- priority：urgent / high / medium / low
- description：一句话交付标准

要求：步骤之间有先后依赖；估时合计约等于总工时；只输出 JSON，不要任何解释文字。
{{extra}}`

const SOP_PROMPT = `你是流程沉淀专家。请基于以下任务信息，输出标准作业流程（SOP）。

任务：{{title}}
行业：{{industry}}　类型：{{taskType}}
背景：{{description}}

输出 JSON：{ "steps": ["步骤1", "步骤2", ...] }，步骤数 4-8 条，每步一句话，可被他人直接照做。
只输出 JSON。`

const EXPERIENCE_PROMPT = `你是知识管理专家。请把以下执行经验提炼为可复用的知识卡。

任务：{{title}}
行业：{{industry}}　类型：{{taskType}}
原始记录：{{description}}

输出 JSON：{ "summary": "一句话结论", "keywords": ["关键词1","关键词2"], "advice": "下次可复用的做法" }
只输出 JSON。`

const SUMMARY_PROMPT = `你是团队负责人助理。请基于以下信息生成周期总结。

周期任务：{{title}}
行业：{{industry}}
补充说明：{{description}}

输出 JSON：{ "done": ["已完成事项"], "risk": ["风险与阻塞"], "next": ["下周计划"] }
只输出 JSON。`

const EVALUATE_PROMPT = `你是研发效能评估专家。请评估以下任务的推荐承接与风险。

任务：{{title}}
行业：{{industry}}　类型：{{taskType}}
估时：{{totalHours}} 小时
背景：{{description}}

输出 JSON：{ "level": "低/中/高", "reasons": ["原因1","原因2"], "suggestion": "排期或拆解建议" }
只输出 JSON。`

const REPORT_PROMPT = `你是项目复盘专家。请基于以下任务执行信息，生成一份任务完成总结报告。

任务名称：{{title}}
行业：{{industry}}　任务类型：{{taskType}}
任务描述：{{description}}
完成时间：{{startDate}}
执行记录：{{steps}}
协作评论：{{extra}}

输出严格 JSON：
{
  "summary": "完成情况概述，100 字以内",
  "notes": "执行过程中的注意点与关键判断",
  "sopImprovement": "对该类任务标准流程的优化建议",
  "suggestions": "下次可改进的地方"
}
要求：内容要具体到本任务，不要泛泛而谈。只输出 JSON。`

const PLAN_PROMPT = `你是时间管理教练。请为以下计划给出安排建议。

计划内容：{{title}}
行业：{{industry}}
补充说明：{{description}}
可用时长：{{totalHours}} 小时

输出 JSON：{ "slots": [{"label":"时段名","hours":2}], "tips": ["建议1"] }
只输出 JSON。`

/** 构造内置拆解规则 */
function decomposeRule(
  id: string,
  name: string,
  industry: string,
  taskType: string,
  priority: number,
  steps: string[],
  weights: number[],
): AiRule {
  return {
    id, name, scene: 'decompose', industry, taskType,
    enabled: true, priority, promptTemplate: DECOMPOSE_PROMPT,
    steps, weights, builtin: true, createdAt: presetTime, updatedAt: presetTime,
  }
}

/** 构造内置非拆解规则 */
function sceneRule(id: string, name: string, scene: AiScene, promptTemplate: string): AiRule {
  return {
    id, name, scene, industry: '通用', taskType: '通用',
    enabled: true, priority: 100, promptTemplate,
    steps: [], builtin: true, createdAt: presetTime, updatedAt: presetTime,
  }
}

/**
 * 内置经验库：行业 × 任务类型的标准工作流。
 * weights 为该行业实践中各环节的经验工时占比。
 */
export const BUILTIN_RULES: AiRule[] = [
  decomposeRule('rule-fe', '前端开发标准流程', '互联网/软件', '前端开发', 10,
    ['需求确认与技术方案', '组件与页面结构设计', '编码实现', '自测与联调', '提测与缺陷修复', '发布与验收'],
    [0.10, 0.15, 0.40, 0.15, 0.15, 0.05]),
  decomposeRule('rule-be', '后端开发标准流程', '互联网/软件', '后端开发', 10,
    ['接口与数据模型设计', '编码实现', '单元测试', '前后端联调', '压测与性能优化', '部署与灰度'],
    [0.15, 0.35, 0.15, 0.15, 0.10, 0.10]),
  decomposeRule('rule-ui', 'UI/UX 设计标准流程', '互联网/软件', 'UI/UX设计', 10,
    ['需求理解与用户画像', '竞品与参考收集', '信息架构与草图', '高保真设计', '设计评审', '标注与交付'],
    [0.10, 0.10, 0.20, 0.35, 0.10, 0.15]),
  decomposeRule('rule-qa', '测试与质量保障流程', '通用', '测试/质量', 20,
    ['测试计划与范围确认', '用例设计', '测试环境准备', '用例执行', '缺陷跟踪与回归', '测试报告输出'],
    [0.10, 0.25, 0.10, 0.30, 0.15, 0.10]),
  decomposeRule('rule-pm', '产品需求流程', '通用', '产品/需求', 20,
    ['需求调研与用户访谈', '竞品分析', '需求文档撰写', '原型设计与评审', '验收标准确认', '开发跟进与验收'],
    [0.20, 0.15, 0.20, 0.25, 0.10, 0.10]),
  decomposeRule('rule-ops-act', '电商活动运营流程', '电商/零售', '运营/活动', 10,
    ['活动策划与目标拆解', '资源与预算确认', '页面与素材搭建', '规则配置与埋点', '灰度测试', '正式上线', '数据复盘'],
    [0.15, 0.10, 0.25, 0.10, 0.15, 0.10, 0.15]),
  decomposeRule('rule-fin', '金融合规评审流程', '金融/保险', '评审/合规', 10,
    ['材料收集与完整性校验', '合规初审', '风险点评估', '交叉复核', '结论出具与归档'],
    [0.20, 0.25, 0.25, 0.20, 0.10]),
  decomposeRule('rule-data', '数据分析流程', '通用', '数据分析', 20,
    ['指标口径定义', '数据取数与清洗', '分析建模', '结论输出', '报告评审'],
    [0.15, 0.30, 0.25, 0.20, 0.10]),
  decomposeRule('rule-mfg', '制造交付流程', '制造/工业', '通用', 20,
    ['方案设计', '物料与产能准备', '试产验证', '质量检测', '批量生产', '交付验收'],
    [0.15, 0.20, 0.15, 0.15, 0.20, 0.15]),
  decomposeRule('rule-doc', '文档与报告流程', '通用', '文档/报告', 20,
    ['资料收集', '大纲与结构设计', '初稿撰写', '内部评审', '修订定稿与发布'],
    [0.20, 0.15, 0.30, 0.15, 0.20]),
  decomposeRule('rule-research', '调研与竞品分析流程', '通用', '调研/竞品', 20,
    ['调研目标与范围定义', '信息采集', '对比维度设计', '分析归纳', '结论与建议输出'],
    [0.15, 0.30, 0.15, 0.25, 0.15]),
  decomposeRule('rule-devops', '运维部署流程', '通用', '运维/部署', 20,
    ['部署方案与回滚预案', '环境准备', '配置与脚本', '灰度发布', '监控观察', '全量与收尾'],
    [0.15, 0.15, 0.20, 0.20, 0.20, 0.10]),
  // 兜底规则：任何行业/类型都能命中
  decomposeRule('rule-generic', '通用任务拆解流程', '通用', '通用', 90,
    ['目标澄清与方案设计', '核心工作实施', '内部检查与修正', '交付与验收', '复盘沉淀'],
    [0.15, 0.45, 0.15, 0.15, 0.10]),
  // 其他 AI 场景的默认提示词
  sceneRule('rule-sop', 'SOP 生成默认模板', 'sop', SOP_PROMPT),
  sceneRule('rule-exp', '经验总结默认模板', 'experience', EXPERIENCE_PROMPT),
  sceneRule('rule-sum', '周期总结默认模板', 'summary', SUMMARY_PROMPT),
  sceneRule('rule-eval', '智能评估默认模板', 'evaluate', EVALUATE_PROMPT),
  sceneRule('rule-plan', '计划建议默认模板', 'plan', PLAN_PROMPT),
  sceneRule('rule-report', '任务总结报告默认模板', 'taskReport', REPORT_PROMPT),
]

/** 规则匹配打分：行业精确 4 分 / 通用 1 分，任务类型同理，再减去优先级 */
export function matchRules(rules: AiRule[], input: RuleMatchInput): AiRule[] {
  const scored: { rule: AiRule; score: number }[] = []
  for (const r of rules) {
    if (r.scene !== input.scene || !r.enabled) continue
    let score = 0
    if (r.industry === input.industry) score += 4
    else if (r.industry === '通用') score += 1
    else continue
    if (r.taskType === input.taskType) score += 4
    else if (r.taskType === '通用') score += 1
    else continue
    scored.push({ rule: r, score: score * 10 - r.priority })
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.rule)
}

/** 取最匹配的一条规则（无匹配返回 null） */
export function pickRule(rules: AiRule[], input: RuleMatchInput): AiRule | null {
  return matchRules(rules, input)[0] ?? null
}

/** 渲染提示词模板：把 {{key}} 替换为实际值，未提供的变量替换为空串 */
export function renderTemplate(template: string, vars: Record<string, string | number | undefined>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    const v = vars[key]
    return v === undefined || v === null ? '' : String(v)
  })
}

export interface DecomposeRequest {
  goalTitle: string
  goalDescription?: string
  industry?: string
  taskType?: string
  totalEstimatedHours?: number
  startDate?: string
  extra?: string
}

/** 本地规则引擎：按规则步骤与经验工时占比生成子任务与排期 */
export function ruleBasedDecompose(rule: AiRule, req: DecomposeRequest): DecomposeTask[] {
  const total = Math.max(1, req.totalEstimatedHours ?? 40)
  const steps = rule.steps.length > 0 ? rule.steps : ['目标澄清', '实施执行', '检查验收']
  const weights =
    rule.weights && rule.weights.length === steps.length
      ? rule.weights
      : steps.map(() => 1 / steps.length)

  const raw = steps.map((_, i) => Math.max(1, Math.round(total * weights[i])))
  // 修正取整误差，保证合计等于总工时
  const diff = total - raw.reduce((a, b) => a + b, 0)
  if (raw.length > 0) raw[raw.length - 1] = Math.max(1, raw[raw.length - 1] + diff)

  let cursor = req.startDate ? dayjs(req.startDate) : dayjs()
  if (!cursor.isValid()) cursor = dayjs()

  return steps.map((s, i) => {
    const hours = raw[i]
    const start = cursor
    const days = Math.max(1, Math.ceil(hours / 8))
    const finish = start.add(days, 'day')
    cursor = finish.add(1, 'day')
    return {
      title: s,
      description: `来自「${req.goalTitle}」的${rule.taskType === '通用' ? '' : rule.taskType}标准环节`,
      estimatedHours: hours,
      isShared: false,
      priority: i === 0 ? 'high' : i >= steps.length - 1 ? 'low' : 'medium',
      earliestStart: start.format('YYYY-MM-DD'),
      earliestFinish: finish.format('YYYY-MM-DD'),
    }
  })
}

/** 兜底：无规则时按关键词简易拆分（保留原有启发式行为） */
export function fallbackDecompose(req: DecomposeRequest): DecomposeTask[] {
  const pieces = req.goalTitle
    .split(/[；;，,。\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
  const steps = pieces.length > 1 ? pieces : [req.goalTitle || '执行任务']
  const total = Math.max(1, req.totalEstimatedHours ?? 40)
  const base = Math.max(1, Math.floor(total / steps.length))
  let cursor = req.startDate ? dayjs(req.startDate) : dayjs()
  if (!cursor.isValid()) cursor = dayjs()
  return steps.map((s, i) => {
    const hours = i === steps.length - 1 ? total - base * (steps.length - 1) : base
    const start = cursor
    const finish = start.add(Math.max(1, Math.ceil(hours / 8)), 'day')
    cursor = finish.add(1, 'day')
    return {
      title: s,
      description: '',
      estimatedHours: hours,
      isShared: false,
      priority: 'medium' as const,
      earliestStart: start.format('YYYY-MM-DD'),
      earliestFinish: finish.format('YYYY-MM-DD'),
    }
  })
}

/** 团队是否已接入真实模型（GET /ai/status，30s 缓存；失败按未接入处理） */
export async function isAgentReady(): Promise<boolean> {
  return (await getAiStatus()).enabled
}

/** 调用团队模型：未接入时抛错，由调用方回退本地规则引擎 */
export async function callAgent(prompt: string): Promise<string> {
  if (!(await isAgentReady())) throw new Error('团队未配置 AI 模型')
  return aiComplete(prompt)
}

/** 从模型输出中解析子任务数组，解析失败时回退到规则结果 */
export function parseAgentTasks(text: string, fallback: DecomposeTask[]): DecomposeTask[] {
  try {
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) return fallback
    const arr = JSON.parse(match[0]) as unknown
    if (!Array.isArray(arr) || arr.length === 0) return fallback
    const allowed = ['urgent', 'high', 'medium', 'low']
    return arr.map((it: Record<string, unknown>, i: number) => ({
      title: String(it.title ?? `步骤 ${i + 1}`).slice(0, 60),
      description: String(it.description ?? ''),
      estimatedHours: Number(it.estimatedHours ?? 4) || 4,
      isShared: false,
      priority: allowed.includes(String(it.priority)) ? String(it.priority) : 'medium',
    })) as DecomposeTask[]
  } catch {
    return fallback
  }
}

export interface DecomposeResult {
  tasks: DecomposeTask[]
  rule: AiRule | null
  /** 产出来源：agent 模型 / 本地规则引擎 */
  source: 'agent' | 'rule'
  /** 实际发送给模型的提示词，便于在界面上查看与调试 */
  prompt: string
}

/**
 * 规则驱动的拆解入口：
 * 1. 按行业 + 任务类型匹配规则
 * 2. 用规则模板渲染提示词
 * 3. 配了 Agent 就调用模型，失败或未配置则用本地规则引擎
 */
export async function decomposeWithRules(
  req: DecomposeRequest,
  rules: AiRule[],
): Promise<DecomposeResult> {
  const rule = pickRule(rules, {
    scene: 'decompose',
    industry: req.industry,
    taskType: req.taskType,
  })
  const local = rule ? ruleBasedDecompose(rule, req) : fallbackDecompose(req)
  const prompt = rule
    ? renderTemplate(rule.promptTemplate, {
        title: req.goalTitle,
        description: req.goalDescription ?? '（未提供）',
        industry: req.industry ?? '通用',
        taskType: req.taskType ?? '通用',
        totalHours: req.totalEstimatedHours ?? 40,
        startDate: req.startDate ?? dayjs().format('YYYY-MM-DD'),
        steps: rule.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
        extra: req.extra ?? '',
      })
    : ''

  if (prompt) {
    try {
      const text = await callAgent(prompt)
      const parsed = parseAgentTasks(text, local)
      if (parsed.length > 0) return { tasks: parsed, rule, source: 'agent', prompt }
    } catch {
      // Agent 不可用：静默回退本地规则引擎，不阻断用户流程
    }
  }
  return { tasks: local, rule, source: 'rule', prompt }
}

export interface TaskReportRequest {
  title: string
  description: string
  industry: string
  taskType: string
  /** 执行记录，已格式化为文本 */
  logs: string
  /** 协作评论，已格式化为文本 */
  comments: string
  /** 完成时间（精确到分钟） */
  completedAt: string
}

export interface TaskReportResult {
  summary: string
  notes: string
  sopImprovement: string
  suggestions: string
  source: 'agent' | 'rule'
  prompt: string
}

/** 无 Agent 时的本地兜底：基于真实信息拼装，避免生成空洞套话 */
function localTaskReport(req: TaskReportRequest): Omit<TaskReportResult, 'source' | 'prompt'> {
  const logCount = req.logs ? req.logs.split('\n').filter(Boolean).length : 0
  const commentCount = req.comments ? req.comments.split('\n').filter(Boolean).length : 0
  return {
    summary: `「${req.title}」于 ${req.completedAt} 完成，属于 ${req.industry} / ${req.taskType} 类任务。${req.description ? `目标：${req.description.slice(0, 80)}` : ''}`,
    notes:
      logCount > 0
        ? `执行期间共留下 ${logCount} 条执行记录，关键进展已在执行页留痕，建议后续沿用同样的记录节奏。${commentCount > 0 ? `协作区另有 ${commentCount} 条沟通记录，涉及的问题已在过程中消化。` : ''}`
        : '本次任务未记录执行过程，建议下次在执行页同步记录关键节点，便于复盘与交接。',
    sopImprovement: '建议把本次实际执行顺序整理为标准步骤，补充到该任务类型的 SOP 模板中，后续同类任务可直接复用。',
    suggestions: '建议复盘本次的阻塞点与返工环节，在下次排期时预留缓冲，并把高频问题沉淀为检查项。',
  }
}

/** 从模型输出中解析总结 JSON，解析失败返回 null */
function parseReportJson(text: string): Omit<TaskReportResult, 'source' | 'prompt'> | null {
  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    const obj = JSON.parse(match[0]) as Record<string, unknown>
    const pick = (k: string) => (typeof obj[k] === 'string' ? String(obj[k]) : '')
    const summary = pick('summary')
    if (!summary) return null
    return {
      summary,
      notes: pick('notes'),
      sopImprovement: pick('sopImprovement'),
      suggestions: pick('suggestions'),
    }
  } catch {
    return null
  }
}

/**
 * 需求 7：基于执行页全部信息生成完成总结。
 * 配了 Agent 就调用模型并按规则模板渲染提示词，否则用本地兜底总结。
 */
export async function generateTaskReport(
  req: TaskReportRequest,
  rules: AiRule[],
): Promise<TaskReportResult> {
  const rule = pickRule(rules, { scene: 'taskReport', industry: req.industry, taskType: req.taskType })
  const local = localTaskReport(req)
  const prompt = rule
    ? renderTemplate(rule.promptTemplate, {
        title: req.title,
        description: req.description || '（未填写）',
        industry: req.industry,
        taskType: req.taskType,
        startDate: req.completedAt,
        steps: req.logs || '（暂无执行记录）',
        extra: req.comments || '（暂无协作评论）',
      })
    : ''

  if (prompt) {
    try {
      const text = await callAgent(prompt)
      const parsed = parseReportJson(text)
      if (parsed) return { ...parsed, source: 'agent', prompt }
    } catch {
      // Agent 不可用：回退本地总结
    }
  }
  return { ...local, source: 'rule', prompt }
}

export interface SopGenRequest {
  title: string
  description?: string
  industry?: string
  taskType?: string
  /** 补充上下文（如完成总结、执行记录），AI 生成新流程时可用 */
  extra?: string
}

export interface SopGenResult {
  steps: SopNode[]
  rule: AiRule | null
  source: 'agent' | 'rule'
  prompt: string
}

/** 无 Agent 时的本地 SOP 兜底：复用「行业 × 任务类型」拆解经验模板的标准环节 */
function localSopSteps(req: SopGenRequest): SopNode[] {
  const rule = pickRule(rulesFromNoop(), { scene: 'decompose', industry: req.industry, taskType: req.taskType })
    ?? pickRule(rulesFromNoop(), { scene: 'decompose', industry: '通用', taskType: '通用' })
  const titles = rule && rule.steps.length > 0
    ? rule.steps
    : ['目标澄清与方案确认', '执行实施', '检查与修正', '交付与验收', '复盘沉淀']
  return titles.map((t) => ({ id: newSopNodeId(), title: t, children: [] }))
}

// 本地兜底不持有 rules 引用（避免循环依赖调用方上下文），用空规则表触发通用兜底
function rulesFromNoop(): AiRule[] {
  return BUILTIN_RULES.filter((r) => r.scene === 'decompose')
}

/** 从模型输出解析 { steps: [...] } JSON，失败返回 null */
function parseSopJson(text: string): SopNode[] | null {
  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    const obj = JSON.parse(match[0]) as { steps?: unknown }
    if (!Array.isArray(obj.steps) || obj.steps.length === 0) return null
    const toNode = (raw: unknown): SopNode | null => {
      if (typeof raw === 'string') return { id: newSopNodeId(), title: raw.slice(0, 60), children: [] }
      if (raw && typeof raw === 'object') {
        const o = raw as Record<string, unknown>
        const title = String(o.title ?? o.name ?? o.step ?? '').trim()
        if (!title) return null
        const children = Array.isArray(o.children) ? (o.children.map(toNode).filter(Boolean) as SopNode[]) : []
        return { id: newSopNodeId(), title: title.slice(0, 60), note: typeof o.note === 'string' ? o.note : undefined, children }
      }
      return null
    }
    const steps = obj.steps.map(toNode).filter(Boolean) as SopNode[]
    return steps.length > 0 ? steps : null
  } catch {
    return null
  }
}

/**
 * SOP 流程生成：读取「AI 规则」页的 sop 场景规则模板（可自配），
 * 配置了 Agent 就调模型，失败或未配置则复用行业经验模板的本地规则。
 */
export async function generateSopFlow(req: SopGenRequest, rules: AiRule[]): Promise<SopGenResult> {
  const rule = pickRule(rules, { scene: 'sop', industry: req.industry, taskType: req.taskType })
  const prompt = rule
    ? renderTemplate(rule.promptTemplate, {
        title: req.title,
        description: req.description || '（未提供）',
        industry: req.industry ?? '通用',
        taskType: req.taskType ?? '通用',
        extra: req.extra ?? '',
      })
    : ''
  if (prompt) {
    try {
      const text = await callAgent(prompt)
      const steps = parseSopJson(text)
      if (steps) return { steps, rule, source: 'agent', prompt }
    } catch {
      // Agent 不可用：回退本地规则
    }
  }
  return { steps: localSopSteps(req), rule, source: 'rule', prompt }
}

/** 把生成的顶层步骤包装成 SOP 流程对象 */
export function toSopFlow(steps: SopNode[], source: SopFlow['source']): SopFlow {
  return { steps, source, updatedAt: new Date().toISOString() }
}
