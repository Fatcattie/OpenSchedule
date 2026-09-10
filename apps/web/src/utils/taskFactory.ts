/**
 * 职责：任务构建工厂 —— 把发布/创建表单的 payload 转成主任务 + 子任务
 *
 * 协作工作台、任务创建管理页共用同一套构建逻辑，避免两处字段漂移。
 */
import dayjs from 'dayjs'
import type { DecomposeTask, Importance, SopFlow, TaskMode, TaskPriority, UrgencyDegree, WorkspaceTask } from '@/types'
import { deriveTaskUrgency } from '@/types'

let seq = 0
/** 生成带序号的 id，避免同一毫秒内创建多个任务时冲突 */
export const newTaskId = (prefix: string) => `${prefix}-${Date.now()}-${(seq++).toString(36)}`

export interface PublishPayloadLite {
  title: string
  description: string
  priority: TaskPriority
  /** 重要程度：重要/不重要（日历便签联动） */
  importance: Importance
  /** 紧急程度：紧急/不紧急（日历便签联动） */
  urgencyDegree: UrgencyDegree
  taskMode: TaskMode
  needReview: boolean
  assigneeId: string | null
  /** 推荐承接人：填入则由管理审核后生效（需求 1） */
  recommendAssigneeId?: string | null
  startAt: string | null
  endAt: string | null
  subtasks: DecomposeTask[]
  industry: string
  taskType: string
  /** SOP 流程（团队协作任务必填；子任务通过继承机制读取父级流程） */
  sop?: SopFlow | null
  /** 说明图片（base64） */
  images?: string[]
}

export interface BuildOptions {
  createdBy: string
  projectId?: string | null
  parentId?: string | null
  sortOrderBase?: number
  /** 草稿任务不进入看板 */
  isDraft?: boolean
  /** 是否需要推送管理审核 */
  approval?: { status: 'none' | 'pending'; type?: 'proposal' | null }
  /** 需求 1：needReview 时自动生成的评审子任务默认承接人（通常为管理员） */
  reviewAssigneeId?: string | null
}

/** 把 SOP 流程的顶层步骤转成项目内任务（项目审核通过后调用） */
export function buildProjectTasksFromSop(
  project: WorkspaceTask,
  sop: SopFlow,
): WorkspaceTask[] {
  const now = new Date().toISOString()
  return sop.steps.map((step, i) => ({
    id: newTaskId('task'), tenantId: project.tenantId, projectId: project.id, parentId: null,
    title: step.title, description: step.note || null,
    status: 'todo', priority: project.priority, assigneeId: null,
    dueAt: project.endAt, estimatedHours: 2, actualHours: null, completedAt: null, startedAt: null,
    createdBy: project.createdBy,
    tags: ['项目任务', ...project.tags.filter((t) => t !== '团队协作项目' && t !== '团队协作')],
    sortOrder: i + 1, workflowColumnId: null, isAiGenerated: false,
    version: 1, createdAt: now, updatedAt: now,
    taskMode: 'team', kind: 'task', needReview: false, reviewStatus: 'none',
    proposalStatus: 'none', participants: [], reviewOfTaskId: null,
    startAt: project.startAt, endAt: project.endAt,
    importance: project.importance, urgencyDegree: project.urgencyDegree,
    urgency: project.urgency,
    sop: step.children.length > 0 ? { steps: step.children, source: 'inherited', updatedAt: now } : null,
    approvalStatus: 'none', approvalType: null, recommendedAssigneeId: null,
    pendingContent: null, executionLogs: [], comments: [], completion: null,
    auditLogs: [], dailyPlans: [], isDraft: false,
    pendingDelete: false, pendingSop: null,
  } as WorkspaceTask))
}

/** 返回 [主任务, ...(子任务), (评审子任务)]；无子任务时数组长度为 1 或 2 */
export function buildTaskFromPublish(
  payload: PublishPayloadLite,
  opts: BuildOptions,
): WorkspaceTask[] {
  const now = new Date().toISOString()
  const mainId = newTaskId('task')
  const isProject = payload.taskMode === 'project'
  const totalHours = isProject ? 0 : payload.subtasks.reduce((s, x) => s + (x.estimatedHours ?? 0), 0)
  const projectId = opts.projectId ?? 'project-001'
  const recommend = payload.recommendAssigneeId ?? null
  const needApproval = opts.approval?.status === 'pending'
  // 推荐承接人：由管理审核后生效，优先使用 assign 审核类型
  const finalApprovalStatus = recommend || needApproval ? 'pending' : 'none'
  const finalApprovalType = recommend ? 'assign' : needApproval ? (opts.approval?.type ?? 'proposal') : null
  const finalProposalStatus = recommend ? 'none' : needApproval ? 'pending' : 'none'

  const main: WorkspaceTask = {
    id: mainId, tenantId: 'tenant-001', projectId, parentId: opts.parentId ?? null,
    title: payload.title, description: payload.description || null,
    status: recommend ? 'todo' : payload.assigneeId ? 'in_progress' : 'todo',
    priority: payload.priority, assigneeId: recommend ? null : payload.assigneeId,
    dueAt: payload.endAt, estimatedHours: totalHours || (isProject ? 0 : 2),
    actualHours: null, completedAt: null, startedAt: recommend ? null : payload.assigneeId ? now : null,
    createdBy: opts.createdBy,
    tags: [payload.taskMode === 'individual' ? '独立任务' : isProject ? '团队协作项目' : '团队协作', payload.industry, payload.taskType],
    sortOrder: (opts.sortOrderBase ?? 0) + 1, workflowColumnId: null, isAiGenerated: false,
    version: 1, createdAt: now, updatedAt: now,
    taskMode: payload.taskMode, kind: isProject ? 'project' as const : 'task', needReview: isProject ? false : payload.needReview,
    reviewStatus: 'none',
    proposalStatus: finalProposalStatus,
    participants: [], reviewOfTaskId: null,
    startAt: payload.startAt, endAt: payload.endAt,
    importance: payload.importance ?? 'important',
    urgencyDegree: payload.urgencyDegree ?? 'notUrgent',
    urgency: deriveTaskUrgency(payload.importance, payload.urgencyDegree),
    sop: payload.sop ?? null,
    images: payload.images ?? [],
    approvalStatus: finalApprovalStatus,
    approvalType: finalApprovalType,
    recommendedAssigneeId: recommend,
    pendingContent: null, executionLogs: [], comments: [], completion: null,
    auditLogs: [],
    dailyPlans: [],
    isDraft: opts.isDraft ?? false,
    pendingDelete: false,
    pendingSop: null,
  }

  // 项目模式：SOP 流程作为项目内任务蓝图，子任务不在发布时生成，而在审核通过后按 SOP 生成
  if (isProject) {
    return [main]
  }

  const subs: WorkspaceTask[] = payload.subtasks.map((s, i) => ({
    id: newTaskId('sub'), tenantId: 'tenant-001', projectId, parentId: mainId,
    title: s.title, description: s.description || null, status: 'todo',
    priority: (s.priority as TaskPriority) ?? 'medium', assigneeId: null,
    dueAt: s.earliestFinish ? dayjs(s.earliestFinish).hour(18).toISOString() : payload.endAt,
    estimatedHours: s.estimatedHours ?? 2, actualHours: null, completedAt: null, startedAt: null,
    createdBy: opts.createdBy, tags: ['AI拆解'], sortOrder: i + 1, workflowColumnId: null, isAiGenerated: true,
    version: 1, createdAt: now, updatedAt: now,
    taskMode: payload.taskMode, kind: 'task', needReview: false, reviewStatus: 'none',
    proposalStatus: 'none', participants: [], reviewOfTaskId: null,
    startAt: s.earliestStart ? dayjs(s.earliestStart).hour(9).toISOString() : null,
    endAt: s.earliestFinish ? dayjs(s.earliestFinish).hour(18).toISOString() : null,
    // 子任务继承父级的重要程度/紧急程度（SOP 走继承读取，不复制）
    importance: payload.importance ?? 'important',
    urgencyDegree: payload.urgencyDegree ?? 'notUrgent',
    urgency: deriveTaskUrgency(payload.importance, payload.urgencyDegree),
    sop: null,
    approvalStatus: 'none', approvalType: null, recommendedAssigneeId: null,
    pendingContent: null, executionLogs: [], comments: [], completion: null,
    auditLogs: [],
    dailyPlans: [],
    isDraft: false,
    pendingDelete: false,
    pendingSop: null,
  }))

  // 需求 1：凡任务要求评审（needReview），发布时即在原任务下自动生成一个评审子任务。
  // 评审子任务单人承接（需求 2）；多人评审由管理邀请参与人时再按人拆成多个评审任务。
  const reviewSub: WorkspaceTask | null = payload.needReview && payload.taskMode === 'team'
    ? {
        id: newTaskId('review'), tenantId: 'tenant-001', projectId, parentId: mainId,
        title: `${payload.title} · 项目评审`,
        description: `「${payload.title}」要求评审，发布时自动生成；由管理承接并邀请参与人（每位参与人一个评审任务）`,
        status: 'todo', priority: payload.priority, assigneeId: opts.reviewAssigneeId ?? null,
        dueAt: payload.endAt ?? null, estimatedHours: 1, actualHours: null, completedAt: null, startedAt: null,
        createdBy: opts.createdBy, tags: ['评审'], sortOrder: payload.subtasks.length + 1,
        workflowColumnId: null, isAiGenerated: false,
        version: 1, createdAt: now, updatedAt: now,
        taskMode: 'team', kind: 'review', needReview: false, reviewStatus: 'none',
        proposalStatus: 'none', participants: [], reviewOfTaskId: mainId,
        startAt: payload.startAt, endAt: payload.endAt,
        importance: payload.importance ?? 'important',
        urgencyDegree: payload.urgencyDegree ?? 'notUrgent',
        urgency: deriveTaskUrgency(payload.importance, payload.urgencyDegree),
        sop: null,
        approvalStatus: 'none', approvalType: null, recommendedAssigneeId: null,
        pendingContent: null, executionLogs: [], comments: [], completion: null,
        auditLogs: [],
        dailyPlans: [],
        isDraft: false,
        pendingDelete: false,
        pendingSop: null,
      }
    : null

  return reviewSub ? [main, ...subs, reviewSub] : [main, ...subs]
}
