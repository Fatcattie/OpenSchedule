/**
 * 职责：任务/评论 DTO —— tasks、task_comments 表字段（snake_case）→ camelCase 对齐；状态机迁移表（规格 3.3）
 */

/** 任务基础五态（规格 3.3；PendingReview 为 Phase 2 扩展态，暂不启用） */
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled'
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low'

/** 紧急度便签（日历看板）：不紧急 / 紧急 / 重要 / 不重要 */
export type TaskUrgency = 'notUrgent' | 'urgent' | 'important' | 'notImportant'

/** 重要程度（任务/计划表单下拉）：重要 / 不重要 */
export type Importance = 'important' | 'notImportant'

/** 紧急程度（任务/计划表单下拉）：紧急 / 不紧急 */
export type UrgencyDegree = 'urgent' | 'notUrgent'

export const IMPORTANCE_META: Record<Importance, { label: string }> = {
  important: { label: '重要' },
  notImportant: { label: '不重要' },
}

export const URGENCY_DEGREE_META: Record<UrgencyDegree, { label: string }> = {
  urgent: { label: '紧急' },
  notUrgent: { label: '不紧急' },
}

/**
 * 由「重要程度 × 紧急程度」两个下拉推导日历看板便签（四选一，一一对应）：
 * 重要+紧急 → 紧急(黄)；重要+不紧急 → 重要(蓝)；不重要+紧急 → 不重要(红)；不重要+不紧急 → 不紧急(绿)
 */
export function deriveTaskUrgency(importance?: Importance | null, urgencyDegree?: UrgencyDegree | null): TaskUrgency {
  if (importance === 'important' && urgencyDegree === 'urgent') return 'urgent'
  if (importance === 'important') return 'important'
  if (urgencyDegree === 'urgent') return 'notImportant'
  return 'notUrgent'
}

/** SOP 流程节点（树形）：任务流程展示与编辑的最小单元 */
export interface SopNode {
  id: string
  /** 步骤标题 */
  title: string
  /** 补充说明（可空） */
  note?: string
  /** 子步骤 */
  children: SopNode[]
}

/** SOP 流程（树形，可含多个顶层步骤） */
export interface SopFlow {
  /** 顶层步骤（森林） */
  steps: SopNode[]
  /** 来源：manual 手写 / ai 生成 / inherited 继承 */
  source: 'manual' | 'ai' | 'inherited'
  updatedAt: string
}

/** 深拷贝 SOP 流程 */
export function cloneSopFlow(flow: SopFlow): SopFlow {
  return JSON.parse(JSON.stringify(flow)) as SopFlow
}

let sopNodeSeq = 0
/** 生成 SOP 节点 id */
export function newSopNodeId(): string {
  sopNodeSeq += 1
  return `sopn-${Date.now().toString(36)}-${sopNodeSeq}`
}

/** 把文本行（每行一步，两个空格缩进表示子级）转成 SOP 流程 */
export function sopFlowFromLines(lines: string[], source: SopFlow['source'] = 'manual'): SopFlow {
  const roots: SopNode[] = []
  const stack: { depth: number; node: SopNode }[] = []
  lines.forEach((raw) => {
    if (!raw.trim()) return
    const depth = Math.min(3, Math.floor((raw.length - raw.trimStart().length) / 2))
    const node: SopNode = { id: newSopNodeId(), title: raw.trim(), children: [] }
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop()
    if (depth === 0 || stack.length === 0) roots.push(node)
    else stack[stack.length - 1].node.children.push(node)
    stack.push({ depth, node })
  })
  return { steps: roots, source, updatedAt: new Date().toISOString() }
}

/** 把 SOP 流程摊平成文本行（缩进表达层级），供文本编辑器回填 */
export function sopFlowToLines(flow: SopFlow): string[] {
  const out: string[] = []
  const walk = (nodes: SopNode[], depth: number) => {
    nodes.forEach((n) => {
      out.push(`${'  '.repeat(depth)}${n.title}`)
      walk(n.children ?? [], depth + 1)
    })
  }
  walk(flow.steps, 0)
  return out
}

/** 收集 SOP 流程的全部步骤标题（摊平） */
export function sopFlowTitles(flow: SopFlow): string[] {
  const out: string[] = []
  const walk = (nodes: SopNode[]) => nodes.forEach((n) => { out.push(n.title); walk(n.children ?? []) })
  walk(flow.steps)
  return out
}

export interface Task {
  id: string
  tenantId: string // tasks.tenant_id（租户铁律）
  projectId: string | null // 团队任务必填；个人任务走 personal_tasks
  parentId: string | null // 任务树（parent_id 表达层级，深度 ≤4）
  title: string // 校验 1–200 字符
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  assigneeId: string | null // NULL=待领取（先到先得，A5 默认）
  dueAt: string | null
  /** 排期开始时间（日历排期与冲突检测用；mock 演示长跨度任务可在此直接给定） */
  startAt?: string | null
  /** 排期结束时间（与 dueAt 同步；日历跨格/超时长展示依据） */
  endAt?: string | null
  /** 紧急度便签（日历看板）：不紧急/紧急/重要/不重要（由重要程度×紧急程度推导） */
  urgency?: TaskUrgency
  /** 重要程度（表单下拉）：重要/不重要 */
  importance?: Importance
  /** 紧急程度（表单下拉）：紧急/不紧急 */
  urgencyDegree?: UrgencyDegree
  /** 创建时上传的说明图片（base64），用于增强任务/项目/计划可读性 */
  images?: string[]
  estimatedHours: number | null // numeric(6,1)
  actualHours: number | null // ★D3 实际工时
  completedAt: string | null // ★D3 完成时间（准时率数据源）
  startedAt: string | null // 首次领取/开始时间
  createdBy: string
  tags: string[]
  sortOrder: number // 看板列内排序
  workflowColumnId: string | null // 自定义列（Phase 2）
  isAiGenerated: boolean // AI 草稿落库标记
  version: number // 乐观锁（冲突返回 40901）
  createdAt: string
  updatedAt: string
}

/**
 * 任务模式（协作工作台需求 2 + 项目化改造）
 * - team：团队协作任务，可拆解子任务、可指派他人、可开启评审
 * - individual：独立任务，不支持 AI 拆解，由创建者本人独立完成
 * - project：团队协作项目，本身不产生执行记录；其 SOP 流程在项目审核通过后生成项目内任务
 */
export type TaskMode = 'team' | 'individual' | 'project'

/** 任务类别（需求 4 个人计划 / 需求 5 评审任务 / 项目化改造 团队协作项目） */
export type TaskKind = 'task' | 'review' | 'plan' | 'project'

/** 评审状态（需求 5）：none 无需评审 / pending 待评审 / passed 已通过 */
export type ReviewStatus = 'none' | 'pending' | 'passed'

/** 提报审核状态（需求 7）：none 非提报 / pending 待审核 / approved 已通过 / rejected 已驳回 */
export type ProposalStatus = 'none' | 'pending' | 'approved' | 'rejected'

/**
 * 审核事项类型（需求 3：所有需审核场景统一收口）
 * - proposal：普通人员提报新任务
 * - assign：负责人把子任务交给他人承接 / 创建者推荐承接人
 * - content：任务内容新增或修改
 * - completion：负责人提报任务完成
 */
export type ApprovalType = 'proposal' | 'assign' | 'content' | 'completion' | 'reschedule' | null

/** 审核状态：none 无需审核 / pending 待审核 / approved 已通过 / rejected 已驳回 */
export type ApprovalStatus = 'none' | 'pending' | 'approved' | 'rejected'

export const APPROVAL_STATUS_META: Record<ApprovalStatus, { label: string; color: string }> = {
  none: { label: '无需审核', color: 'default' },
  pending: { label: '待审核', color: 'gold' },
  approved: { label: '审核通过', color: 'green' },
  rejected: { label: '已驳回', color: 'red' },
}

export const APPROVAL_TYPE_META: Record<NonNullable<ApprovalType>, { label: string }> = {
  proposal: { label: '新任务提报' },
  assign: { label: '承接人指派' },
  content: { label: '任务内容变更' },
  completion: { label: '任务完成提报' },
  reschedule: { label: '调整时间申请' },
}

/** 图片/视频附件（需求 1：执行记录与评论支持上传媒体） */
export interface MediaAttachment {
  id: string
  type: 'image' | 'video'
  url: string
  name: string
  size?: number
}

/** 执行记录（需求 2：执行者在执行页记录执行情况） */
export interface ExecutionLog {
  id: string
  taskId: string
  authorId: string
  authorName: string
  content: string
  /** 需求 1：执行记录可上传图片/视频 */
  attachments: MediaAttachment[]
  createdAt: string
}

/** 执行页评论（需求 5：管理者与项目参与人员互动） */
export interface ExecutionComment {
  id: string
  taskId: string
  authorId: string
  authorName: string
  content: string
  /** 需求 1：评论可上传图片/视频 */
  attachments: MediaAttachment[]
  createdAt: string
}

/** 审核日志（需求 7：记录每一次审核动作的意见、原因和操作人） */
export interface AuditLog {
  id: string
  taskId: string
  /** 动作：通过 / 驳回 / 撤回 */
  action: 'approve' | 'reject' | 'withdraw'
  /** 预设审核意见 */
  opinion: 'agree' | 'reject' | 'rework' | 'other'
  /** 审核原因/备注 */
  reason: string
  operatorId: string
  operatorName: string
  createdAt: string
}

/** 每日完成节点（需求 5：周期超过一天的任务在执行页自行规划每日完成时间节点） */
export interface DailyPlanNode {
  id: string
  /** 日期（YYYY-MM-DD） */
  date: string
  /** 当日完成时间节点（HH:mm） */
  time: string
  /** 当日完成目标 */
  goal: string
  /** 是否已完成 */
  done: boolean
}

/** 个人提醒（今日聚焦自提报）：内容 + 提醒时间，面板展示今日需提醒事宜 */
export interface Reminder {
  id: string
  /** 提醒内容 */
  content: string
  /** 提醒时间（YYYY-MM-DD HH:mm） */
  remindAt: string
  /** 是否已读/已处理 */
  done: boolean
  createdBy: string
  createdAt: string
}

/** 任务完成总结（需求 6：提报完成必须填写） */
export interface TaskCompletion {
  /** 完成时间，精确到分钟 */
  completedAt: string
  /** 完成标签 */
  tags: string[]
  /** 执行注意点 */
  notes: string
  /** SOP 优化建议 */
  sopImprovement: string
  /** 其他优化建议 */
  suggestions: string
  /** 总结正文 */
  summary: string
  /** 是否由 AI 生成 */
  aiGenerated: boolean
}

/** 待审核的内容变更（需求 2：内容新增或修改需提审后才生效） */
export interface PendingContent {
  title: string
  description: string
  submittedBy: string
  submittedAt: string
  /** 调整时间申请：携带新的起止时间 */
  startAt?: string | null
  endAt?: string | null
}

/**
 * 协作工作台任务：在后端 Task 之上扩展工作台所需的协作语义字段。
 * 继承 Task 保证与看板、详情页等既有组件兼容。
 */
/** 重复类型：定期（日历锚定）/ 循环（滚动锚定） */
export type RecurrenceKind = 'scheduled' | 'cyclic'
/** 定期频率 */
export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly' | 'yearly'
/** 循环间隔单位（支持到分钟/小时） */
export type RecurrenceUnit = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'

/**
 * 重复规则（任务/计划上挂载）。
 * - 定期：按日历周期固定发生（每天 / 每周选星期 / 每月选日期 / 每年），可设间隔、固定时刻与结束方式。
 * - 循环：按间隔滚动发生，锚点可为「按完成顺延」或「固定间隔(日期)」，间隔可细到分钟/小时。
 * 生成方式采用「实体复制」：创建时即复制出各次执行子任务（共享 recurrenceGroupId + occurrenceIndex）。
 */
export interface RecurrenceRule {
  kind: RecurrenceKind
  // —— 定期 ——
  freq?: RecurrenceFreq
  /** 每 N 个周期（默认 1） */
  interval?: number
  /** 周几（0=周日…6=周六），weekly 用 */
  weekdays?: number[]
  /** 每月几号（1-31），monthly 用 */
  monthDay?: number
  /** 固定时刻 HH:mm（默认 09:00） */
  time?: string
  // —— 循环 ——
  /** 间隔数值 */
  everyValue?: number
  /** 间隔单位 */
  everyUnit?: RecurrenceUnit
  /** 循环锚点：completion=按完成顺延 / date=固定间隔 */
  anchor?: 'completion' | 'date'
  // —— 通用 ——
  /** 首次发生时间（ISO） */
  startDate: string
  /** 结束日期（ISO）或 null=无限 */
  endDate?: string | null
  /** 总次数上限（含首次），null=不限 */
  count?: number | null
}

export interface WorkspaceTask extends Task {
  /** 任务模式，默认 team */
  taskMode: TaskMode
  /** task 普通任务 / review 自动生成的评审任务 / plan 个人计划 */
  kind: TaskKind
  /** 是否需要评审（需求 5）：为 true 时成员完成提报后自动生成评审子任务 */
  needReview: boolean
  /** 评审状态 */
  reviewStatus: ReviewStatus
  /** 提报审核状态（需求 7）：pending 的任务不进入任务看板 */
  proposalStatus: ProposalStatus
  /** 评审参与人（需求 5：管理员可邀请多人） */
  participants: string[]
  /** 评审任务所服务的主任务 id（kind=review 时有值） */
  reviewOfTaskId: string | null
  /** 排期开始时间（日历排期与冲突检测用） */
  startAt: string | null
  /** 排期结束时间（日历排期与冲突检测用，与 dueAt 同步） */
  endAt: string | null
  /** 重要程度（表单下拉） */
  importance?: Importance
  /** 紧急程度（表单下拉） */
  urgencyDegree?: UrgencyDegree
  /** SOP 流程（任务必填，个人计划可空；子任务未配置时自动继承父级） */
  sop?: SopFlow | null
  /** 统一审核状态（需求 3）：任何待审事项都会置为 pending，任务表显示「待审核」 */
  approvalStatus: ApprovalStatus
  /** 当前待审事项类型 */
  approvalType: ApprovalType
  /** 推荐承接人（需求 1）：创建者推荐，管理审核通过后自动生效 */
  recommendedAssigneeId: string | null
  /** 待审核的内容变更（需求 2）：审核通过后覆盖 title/description */
  pendingContent: PendingContent | null
  /** 执行记录（需求 2） */
  executionLogs: ExecutionLog[]
  /** 执行页评论（需求 5） */
  comments: ExecutionComment[]
  /** 完成总结（需求 6）：提报完成必填 */
  completion: TaskCompletion | null
  /** 需求 7：审核日志，用于在审核页展示历史与悬停原因 */
  auditLogs: AuditLog[]
  /** 需求 5：每日完成节点规划（周期超过一天的任务在执行页维护，今日聚焦联动展示） */
  dailyPlans: DailyPlanNode[]
  /** 草稿标记（需求 4）：草稿不进入任务看板 */
  isDraft: boolean
  /**
   * 项目/父级任务内任务（或子任务）删除的待审核标记。
   * 当 approvalStatus='pending' 且 pendingDelete=true 时，表示该任务正等待管理人员审核删除。
   * 审核通过后从任务列表移除；驳回则恢复。
   */
  pendingDelete?: boolean
  /**
   * 父级任务/项目内新增或删除子任务后，尚未审核的 SOP 流程快照。
   * 用于父级任务执行页：新增/删除子任务会改变流程，需管理人员审核后才生效。
   */
  pendingSop?: SopFlow | null
  /** 创建时上传的说明图片（base64） */
  images?: string[]
  /** 重复规则：非空表示这是一个重复任务（实体复制出的每一次都会带上完整规则） */
  recurrence?: RecurrenceRule | null
  /** 重复组 id：同一规则生成的所有子任务共享，用于查找兄弟实例 */
  recurrenceGroupId?: string | null
  /** 第几次发生（从 0 开始） */
  occurrenceIndex?: number | null
  /** 该次发生日期（ISO，用于展示与完成标记） */
  occurrenceDate?: string | null
}

/** 任务模板（需求 4：常用任务另存为模板，后续一键创建） */
export interface TaskTemplate {
  id: string
  name: string
  title: string
  description: string
  priority: TaskPriority
  taskMode: TaskMode
  needReview: boolean
  industry: string
  taskType: string
  /** 子任务标题 */
  subtasks: string[]
  createdAt: string
}

export interface CreateTaskInput {
  title: string
  description?: string
  priority?: TaskPriority
  assigneeId?: string | null
  dueAt?: string | null
  estimatedHours?: number | null
  tags?: string[]
  parentId?: string | null
}

export interface UpdateTaskInput {
  title?: string
  description?: string | null
  priority?: TaskPriority
  dueAt?: string | null
  estimatedHours?: number | null
  tags?: string[]
  version: number // 乐观锁：变更必须携带 version
}

/** POST /tasks/:id/move（规格 3.5.1：{column_id?, status?, sort_order?, version}） */
export interface MoveTaskInput {
  status?: TaskStatus
  columnId?: string | null // 自定义列（Phase 2）
  sortOrder?: number
  version: number // 乐观锁，冲突 40901
  /** TODO(契约确认): 规格 3.3 中 T2/T8 阻塞/取消原因必填，但 move 请求体未列 reason 字段；先随请求携带，后端确认落点（可能走 PATCH） */
  reason?: string
}

/** POST /tasks/:id/complete（T4：actual_hours 必填，落 completed_at） */
export interface CompleteTaskInput {
  summary?: string
  actualHours?: number
}

/** POST /tasks/:id/reopen（T9：重开原因必填） */
export interface ReopenTaskInput {
  reason: string
  version: number
}

export interface TaskComment {
  id: string
  tenantId: string
  taskId: string
  authorId: string | null
  parentId: string | null // 回复串
  content: string // ≤5000 字符
  mentions: unknown // @解析结果 jsonb（Phase 2 渲染）
  isDecision: boolean // 关键决策标记（Phase 2 AI 摘要）
  createdAt: string
  updatedAt: string
}

export interface CreateCommentInput {
  content: string
  parentId?: string | null
}

/** 状态展示元数据（AntD Tag 颜色） */
export const TASK_STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  todo: { label: '待办', color: 'default' },
  in_progress: { label: '进行中', color: 'processing' },
  blocked: { label: '已阻塞', color: 'warning' },
  done: { label: '已完成', color: 'success' },
  cancelled: { label: '已取消', color: 'default' },
}

export const TASK_PRIORITY_META: Record<TaskPriority, { label: string; color: string }> = {
  urgent: { label: '紧急', color: 'red' },
  high: { label: '高', color: 'orange' },
  medium: { label: '中', color: 'blue' },
  low: { label: '低', color: 'default' },
}

/** 紧急度便签（日历看板）：绿=不紧急 / 黄=紧急 / 蓝=重要 / 红=不重要 */
export const TASK_URGENCY_META: Record<TaskUrgency, { label: string; color: string }> = {
  notUrgent: { label: '不紧急', color: '#52c41a' }, // 绿
  urgent: { label: '紧急', color: '#faad14' }, // 黄
  important: { label: '重要', color: '#1677ff' }, // 蓝
  notImportant: { label: '不重要', color: '#ff4d4f' }, // 红
}

/**
 * 需求 3：今日聚焦优先级排序权重（越小越靠前）
 * 重要紧急 > 紧急不重要 > 重要不紧急 > 不重要不紧急
 */
export const URGENCY_SORT_WEIGHT: Record<TaskUrgency, number> = {
  urgent: 0, // 重要+紧急
  notImportant: 1, // 不重要+紧急
  important: 2, // 重要+不紧急
  notUrgent: 3, // 不重要+不紧急
}

/**
 * 状态迁移表（规格 3.3 T1–T9，Phase 1 不含 PendingReview）
 * 说明：后端为权威 —— 非法迁移返 40902 + allowed_transitions；此处仅用于前端预渲染按钮
 */
export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  todo: ['in_progress', 'blocked', 'cancelled'], // T1 领取/开始、T2 阻塞、T8 取消
  in_progress: ['todo', 'done', 'blocked', 'cancelled'], // T3 退回、T4 完成、T5 阻塞、T8 取消
  blocked: ['in_progress', 'done', 'cancelled'], // T6 解除、T7 完成、T8 取消
  done: ['todo', 'in_progress'], // T9 重开（重开原因必填）
  cancelled: [],
}

/** 迁移动作的 UI 配置（按钮文案 + 是否需要原因/工时弹窗） */
export interface TransitionActionConfig {
  to: TaskStatus
  label: string
  /** T2/T5/T8/T9：阻塞/取消/重开原因必填（≥4 字符） */
  requireReason?: boolean
  /** T4/T7：完成须填 actual_hours */
  requireActualHours?: boolean
}

export const TASK_TRANSITION_ACTIONS: Record<TaskStatus, TransitionActionConfig[]> = {
  todo: [
    { to: 'in_progress', label: '开始执行' }, // T1（未分配时先领取）
    { to: 'blocked', label: '标记阻塞', requireReason: true }, // T2
    { to: 'cancelled', label: '取消任务', requireReason: true }, // T8
  ],
  in_progress: [
    { to: 'todo', label: '退回待办' }, // T3
    { to: 'done', label: '标记完成', requireActualHours: true }, // T4
    { to: 'blocked', label: '标记阻塞', requireReason: true }, // T5
    { to: 'cancelled', label: '取消任务', requireReason: true }, // T8
  ],
  blocked: [
    { to: 'in_progress', label: '解除阻塞' }, // T6
    { to: 'done', label: '标记完成', requireActualHours: true }, // T7
    { to: 'cancelled', label: '取消任务', requireReason: true }, // T8
  ],
  done: [
    { to: 'todo', label: '重开为待办', requireReason: true }, // T9
    { to: 'in_progress', label: '重开为进行中', requireReason: true }, // T9
  ],
  cancelled: [],
}

/** 看板默认三列（规格 3.3：默认工作流 = Todo → InProgress → Done） */
export const BOARD_COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'todo', label: '待办', color: '#1677ff' },
  { status: 'in_progress', label: '进行中', color: '#faad14' },
  { status: 'done', label: '已完成', color: '#52c41a' },
]

/** 任务模式展示元数据（需求 2 + 项目化改造） */
export const TASK_MODE_META: Record<TaskMode, { label: string; color: string; desc: string }> = {
  team: { label: '团队协作任务', color: 'blue', desc: '可拆解子任务、指派成员、开启评审' },
  individual: { label: '独立任务', color: 'default', desc: '本人独立完成，不支持 AI 拆解' },
  project: { label: '团队协作项目', color: 'purple', desc: '项目内按 SOP 流程自动生成任务，需审核通过后生效' },
}

/** 任务类别展示元数据 */
export const TASK_KIND_META: Record<TaskKind, { label: string; color: string }> = {
  task: { label: '任务', color: 'blue' },
  review: { label: '评审', color: 'purple' },
  plan: { label: '个人计划', color: 'cyan' },
  project: { label: '项目', color: 'geekblue' },
}

/** 评审状态展示元数据（需求 5） */
export const REVIEW_STATUS_META: Record<ReviewStatus, { label: string; color: string }> = {
  none: { label: '无需评审', color: 'default' },
  pending: { label: '待评审', color: 'orange' },
  passed: { label: '评审通过', color: 'green' },
}

/** 提报审核状态展示元数据（需求 7） */
export const PROPOSAL_STATUS_META: Record<ProposalStatus, { label: string; color: string }> = {
  none: { label: '已发布', color: 'blue' },
  pending: { label: '待审核', color: 'gold' },
  approved: { label: '审核通过', color: 'green' },
  rejected: { label: '已驳回', color: 'red' },
}
