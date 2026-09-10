/**
 * 职责：AI 规则 / 提示词模板类型定义
 *
 * 覆盖需求：
 * - 需求 1：AI 拆解按「行业类型 × 任务类型」匹配经验模板，并支持自定义规则
 * - 需求 2：所有 AI 辅助场景（拆解、SOP、经验、总结、评估…）都可在规则页集中管理提示词
 */

/** AI 辅助场景 */
export type AiScene =
  | 'decompose'
  | 'sop'
  | 'experience'
  | 'summary'
  | 'evaluate'
  | 'plan'
  /** 任务执行页的完成总结报告（需求 7） */
  | 'taskReport'

/** 场景展示元数据 */
export const AI_SCENE_META: Record<AiScene, { label: string; desc: string; color: string }> = {
  decompose: { label: '任务拆解', desc: '把目标拆解为可执行的子任务与排期', color: 'blue' },
  sop: { label: 'SOP 生成', desc: '任务完成后沉淀标准作业流程', color: 'green' },
  experience: { label: '经验总结', desc: '把执行经验整理为可复用的知识卡', color: 'cyan' },
  summary: { label: '周期总结', desc: '汇总周期内工作产出与风险', color: 'purple' },
  evaluate: { label: '智能评估', desc: '任务推荐、负载与匹配度评估', color: 'orange' },
  plan: { label: '计划建议', desc: '个人计划与时间安排建议', color: 'geekblue' },
  taskReport: { label: '任务总结', desc: '基于执行页信息生成完成总结报告', color: 'magenta' },
}

/** 行业类型选项 */
export const INDUSTRY_OPTIONS = [
  '通用',
  '互联网/软件',
  '电商/零售',
  '金融/保险',
  '制造/工业',
  '教育/培训',
  '医疗/健康',
  '政企/公共服务',
] as const

/** 任务类型选项 */
export const TASK_TYPE_OPTIONS = [
  '通用',
  '前端开发',
  '后端开发',
  'UI/UX设计',
  '测试/质量',
  '产品/需求',
  '运营/活动',
  '数据分析',
  '文档/报告',
  '调研/竞品',
  '运维/部署',
  '评审/合规',
] as const

/** 提示词可用变量（在模板中以 {{key}} 形式引用） */
export const PROMPT_VARIABLES: { key: string; desc: string }[] = [
  { key: 'title', desc: '任务标题' },
  { key: 'description', desc: '任务描述与背景' },
  { key: 'industry', desc: '行业类型' },
  { key: 'taskType', desc: '任务类型' },
  { key: 'totalHours', desc: '总估时（小时）' },
  { key: 'startDate', desc: '计划开始日期' },
  { key: 'steps', desc: '规则内置步骤（换行分隔）' },
  { key: 'extra', desc: '用户补充说明' },
]

/**
 * AI 规则
 * 匹配顺序：先按 scene + industry + taskType 精确匹配，再逐级回退到「通用」。
 */
export interface AiRule {
  id: string
  /** 规则名称 */
  name: string
  /** 适用场景 */
  scene: AiScene
  /** 行业类型，'通用' 表示不限制 */
  industry: string
  /** 任务类型，'通用' 表示不限制 */
  taskType: string
  /** 是否启用 */
  enabled: boolean
  /** 优先级，数值越小越优先 */
  priority: number
  /** 提示词模板，支持 {{variable}} 占位符 */
  promptTemplate: string
  /** 拆解步骤模板（scene=decompose 时使用） */
  steps: string[]
  /** 各步骤估时占比，长度与 steps 一致时生效，否则按步骤均分 */
  weights?: number[]
  /** 是否内置（内置规则不可删除，可停用） */
  builtin: boolean
  createdAt: string
  updatedAt: string
}

/** 规则匹配输入 */
export interface RuleMatchInput {
  scene: AiScene
  industry?: string
  taskType?: string
}
