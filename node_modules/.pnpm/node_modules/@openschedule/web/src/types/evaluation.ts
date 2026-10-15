/**
 * 职责：智能评估相关类型 —— 画像、任务推荐候选、项目成员工时统计、我的工时统计（契约 §B17）
 */

/** 复杂度档位（v1 推导规则：estimatedHours < 4 → low；< 16 → medium；≥ 16 → high；无估时 → medium） */
export type ComplexityTier = 'low' | 'medium' | 'high'

/** 画像内嵌统计（profile.stats，契约 §B17.1；由 tasks 聚合，不落表） */
export interface MemberProfileStats {
  completedCount: number
  completionRate: number // 0-1，done / (done + cancelled 之外的已认领)
  onTimeRate: number // 0-1，done 中 completedAt ≤ dueAt 的比例（无 dueAt 不计入分母）
  activeLoad: number // 活跃未完成任务数（todo/in_progress/blocked 且 assignee=我）
}

/** 我的画像：GET /evaluations/me/profile（契约 §B17.1） */
export interface MemberProfile {
  userId: string
  skillTags: string[]
  complexityTier: ComplexityTier | null // null=未设置
  selfAssessed: boolean // 是否已完成自评（冷启动画像模式标记）
  stats: MemberProfileStats
}

/** 更新画像入参：PUT /evaluations/me/profile（upsert，字段均可选） */
export interface UpdateProfileInput {
  skillTags?: string[]
  complexityTier?: ComplexityTier
  selfAssessed?: boolean
}

/** 得分拆解四项因子（契约 §B17.3：技能匹配 40% / 历史绩效 30% / 当前负载 20% / 复杂度适配 10%） */
export interface ScoreBreakdown {
  skill: number
  history: number
  load: number
  complexity: number
}

/** 候选人得分（契约 §B17.3，score 保留 2 位小数） */
export interface CandidateScore {
  userId: string
  displayName: string
  score: number
  scoreBreakdown: ScoreBreakdown
  reason: string // 基于结构化得分事实生成，禁止编造数字
}

/** 任务智能推荐结果：POST /evaluations/tasks/:taskId/recommend（契约 §B17.3，只建议不指派） */
export interface RecommendationResult {
  taskId: string
  taskTitle: string
  taskTags: string[]
  taskComplexity: ComplexityTier
  candidates: CandidateScore[] // 按 score 降序 Top-3（候选=项目成员排除当前 assignee）
  coldStart: boolean // 所有候选 completedCount === 0（自评画像模式）
  generatedAt: string
}

/** 成员统计行（契约 §B17.2；totalActualHours 从 time_entries 窗口内聚合） */
export interface MemberStat {
  userId: string
  displayName: string
  completedCount: number
  completionRate: number
  onTimeRate: number
  activeLoad: number
  totalActualHours: number
  totalEstimatedHours: number
  avgActualHoursPerTask: number
}

/** 项目成员工时统计：GET /evaluations/projects/:projectId/members/stats（契约 §B17.2） */
export interface MembersStatsResult {
  projectId: string
  days: number
  members: MemberStat[]
}

/** 按天工时条目（契约 §B17.4 entries，date=YYYY-MM-DD） */
export interface MemberDayEntry {
  date: string
  hours: number
}

/** 我的工时统计：GET /evaluations/me/stats?days=N（契约 §B17.4） */
export interface MyStatsResult {
  userId: string
  days: number
  totalActualHours: number
  totalEstimatedHours: number
  completedCount: number
  completionRate: number
  onTimeRate: number
  activeLoad: number
  entries: MemberDayEntry[]
}
