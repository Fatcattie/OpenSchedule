import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Tag,
  Tabs,
  Timeline,
  Typography,
  message,
} from 'antd'
import {
  AppstoreOutlined,
  AuditOutlined,
  BulbOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EditOutlined,
  FileTextOutlined,
  PlusOutlined,
  SettingOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { Link, useNavigate } from 'react-router-dom'
import { mockMe, mockProjects, mockTasks, mockUsers } from '@/api/mock/data'
import type { ApprovalStatus, DecomposeTask, TaskPriority, WorkspaceTask } from '@/types'
import { APPROVAL_TYPE_META, INDUSTRY_OPTIONS, TASK_TYPE_OPTIONS, deriveTaskUrgency } from '@/types'
import { clearWorkspaceStorage, useLocalStorageState } from '@/hooks/useLocalStorageState'
import { useCurrentRole } from '@/hooks/useCurrentRole'
import { useWorkspaceTasks } from '@/hooks/useWorkspaceTasks'
import { buildProjectTasksFromSop, buildTaskFromPublish } from '@/utils/taskFactory'
import { materializeRecurrence } from '@/utils/recurrence'
import { archiveSopFromTask, type SopLibraryDoc } from '@/utils/sopLibrary'
import { taskRoute } from '@/utils/taskTree'
import PublishTaskModal, { type PublishTaskPayload } from '@/components/workspace/PublishTaskModal'
import TaskBoardTree from '@/components/workspace/TaskBoardTree'
import CalendarBoard, { DayBoard } from '@/components/workspace/CalendarBoard'
import MoodIndexBar from '@/components/workspace/MoodIndexBar'
import TeamExecutionPanel from '@/components/workspace/TeamExecutionPanel'
import MergeTaskModal from '@/components/workspace/MergeTaskModal'
import ReviewActionModal, { type ReviewActionPayload } from '@/components/workspace/ReviewActionModal'
import PersonalPlanModal, { type PersonalPlanPayload } from '@/components/workspace/PersonalPlanModal'
import { useWikiKb } from '@/hooks/useWikiKb'
import SopFlowTree from '@/components/workspace/SopFlowTree'

const { Title, Text, Paragraph } = Typography

type CalendarView = 'day' | 'week' | 'month' | 'year'

/** 演示环境的管理员账号（评审任务由其自动承接） */
const MANAGER_ID = 'user-001'

/** 新建任务时的协作字段默认值，各处创建任务统一展开，避免遗漏 */
const COLLAB_DEFAULTS = {
  approvalStatus: 'none' as const,
  approvalType: null,
  recommendedAssigneeId: null,
  pendingContent: null,
  executionLogs: [],
  comments: [],
  completion: null,
  auditLogs: [],
  dailyPlans: [] as WorkspaceTask['dailyPlans'],
  isDraft: false,
  pendingDelete: false,
  pendingSop: null,
}

interface ExperienceNote { id: string; taskTitle: string; author: string; note: string; tags: string[]; createdAt: string }
// Wiki 知识卡模型见 @/types/wiki 的 WikiEntry
/** SOP 文档（与 sopLibrary.SopLibraryDoc 对齐，支持任务闭环沉淀的总结与流程图） */

const priorityMeta: Record<TaskPriority, { label: string; color: string }> = {
  urgent: { label: '紧急', color: 'red' }, high: { label: '高', color: 'orange' },
  medium: { label: '中', color: 'blue' }, low: { label: '低', color: 'default' },
}

/** 计算项目健康度（0-100）：完成率基础分，阻塞/逾期扣分 */
function projectHealth(tasks: WorkspaceTask[], projectId: string) {
  const projectTasks = tasks.filter(
    (t) => t.projectId === projectId && t.kind !== 'plan' && t.kind !== 'project' && t.status !== 'cancelled',
  )
  if (projectTasks.length === 0) return { score: 100, blocked: 0, overdue: 0, total: 0, done: 0 }
  const done = projectTasks.filter((t) => t.status === 'done').length
  const blocked = projectTasks.filter((t) => t.status === 'blocked').length
  const overdue = projectTasks.filter(
    (t) => t.status !== 'done' && t.dueAt && dayjs(t.dueAt).isBefore(dayjs(), 'day'),
  ).length
  const base = Math.round((done / projectTasks.length) * 100)
  const score = Math.max(0, base - blocked * 15 - overdue * 10)
  return { score, blocked, overdue, total: projectTasks.length, done }
}

/** 用户是否参与某项目 */
function isProjectMember(tasks: WorkspaceTask[], projectId: string, userId: string) {
  return tasks.some(
    (t) =>
      t.projectId === projectId &&
      (t.assigneeId === userId || t.createdBy === userId || t.participants.includes(userId)),
  )
}

export default function CollaborationWorkspacePage() {
  const navigate = useNavigate()
  /** 角色：由当前用户推导（演示环境默认管理员） */
  const role = useCurrentRole()
  const [view, setView] = useState<CalendarView>('day')
  const [date, setDate] = useState<Dayjs>(dayjs())
  /**
   * 与任务执行页、创建管理页共享同一份数据。
   * hook 内部会兼容历史 localStorage 数据（旧结构缺少协作字段时自动补齐）。
   */
  const [tasks, setTasks] = useWorkspaceTasks()
  const [activeTab, setActiveTab] = useState('overview')
  const [publishOpen, setPublishOpen] = useState(false)
  const [editTask, setEditTask] = useState<WorkspaceTask | null>(null)
  const [mergeTask, setMergeTask] = useState<WorkspaceTask | null>(null)
  const [reviewTask, setReviewTask] = useState<WorkspaceTask | null>(null)
  const [planOpen, setPlanOpen] = useState(false)
  const [planRange, setPlanRange] = useState<{ start: string; end: string } | null>(null)
  const [experienceOpen, setExperienceOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<WorkspaceTask | null>(null)
  const [experience, setExperience] = useLocalStorageState<ExperienceNote[]>('experience', [
    { id: 'exp-1', taskTitle: '视觉规范定稿', author: '李娜', note: '先锁定可复用的设计 token，再进行页面走查，返工明显减少。', tags: ['设计', '复用'], createdAt: '今天 09:20' },
    { id: 'exp-2', taskTitle: '技术选型确认', author: '王强', note: '先做最小可运行验证，再进入正式开发，能尽早暴露部署约束。', tags: ['架构', '验证'], createdAt: '昨天 16:40' },
  ])
  // Wiki 知识卡已迁移至「洞察与智能 / Wiki知识库」独立页（共享 useWikiKb 钩子，addExperience 仍写入）
  const [, setWikiKb] = useWikiKb()
  const [sops, setSops] = useLocalStorageState<SopLibraryDoc[]>('sops', [
    { id: 'sop-1', title: '需求文档评审 SOP', sourceTask: '需求文档评审', steps: ['确认目标和不做范围', '逐条核对验收标准', '记录依赖与风险', '输出评审结论并同步负责人'], references: 3 },
    { id: 'sop-2', title: '技术选型确认 SOP', sourceTask: '技术选型确认', steps: ['列出候选方案', '完成最小可运行验证', '比较成本与维护约束', '记录决策和回滚方案'], references: 2 },
  ])
  /** 需求 6：从「SOP 与经验」选择应用时预填到发布任务弹窗的流程 */
  const [applySop, setApplySop] = useState<SopLibraryDoc | null>(null)
  const [pomodoroTask, setPomodoroTask] = useState('需求文档评审')
  const [seconds, setSeconds] = useState(25 * 60)
  const [running, setRunning] = useState(false)
  const resetDemoData = () => {
    clearWorkspaceStorage()
    window.location.reload()
  }

  useEffect(() => {
    if (!running) return undefined
    const timer = window.setInterval(() => setSeconds((c) => (c > 0 ? c - 1 : 25 * 60)), 1000)
    return () => window.clearInterval(timer)
  }, [running])

  const todayPersonalTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.assigneeId === mockMe.id ||
          t.createdBy === mockMe.id ||
          (t.participants ?? []).includes(mockMe.id),
      ),
    [tasks],
  )

  const unassignedTasks = tasks.filter((t) => !t.assigneeId && t.status !== 'done' && t.status !== 'cancelled')
  const myTasks = tasks.filter((t) => t.assigneeId === mockMe.id)
  const completedTasks = tasks.filter((t) => t.status === 'done')
  const inProgressTasks = tasks.filter((t) => t.status === 'in_progress')
  const blockedTasks = tasks.filter((t) => t.status === 'blocked')

  /** 项目健康度：成员仅看参与项目，管理看全部 */
  const projectHealthList = useMemo(() => {
    const list = mockProjects
      .filter((p) => role === 'manager' || isProjectMember(tasks, p.id, mockMe.id))
      .map((p) => ({ project: p, health: projectHealth(tasks, p.id) }))
    const avgScore = list.length === 0 ? 100 : Math.round(list.reduce((s, item) => s + item.health.score, 0) / list.length)
    return { list, avgScore }
  }, [tasks, role])

  const shiftDate = (a: number) => setDate((c) => c.add(a, view === 'day' ? 'day' : view === 'week' ? 'week' : view === 'month' ? 'month' : 'year'))

  /**
   * 任务协作派生数据（需求 7）
   * - boardTasks：进入任务看板的任务（待审核提报与已驳回提报不进看板）
   * - pendingProposals：待管理员审核的提报
   */
  const boardTasks = useMemo(
    // 项目实体不进任务看板（只有项目内任务发布到任务列表）；待审核提报与已驳回提报不进看板
    () => tasks.filter((t) => t.kind !== 'project' && t.proposalStatus !== 'pending' && t.proposalStatus !== 'rejected' && !t.isDraft),
    [tasks],
  )

  /** 需求 3：所有待审核事项统一收口，管理人员在此处理 */
  const pendingApprovals = useMemo(
    () => tasks.filter((t) => t.approvalStatus === 'pending'),
    [tasks],
  )

  /** 按审核类型结算：通过则落地对应变更，驳回则清理待审内容 */
  const resolveApproval = (task: WorkspaceTask, approved: boolean) => {
    const now = new Date().toISOString()
    // 需求 6：完成提报审核通过 = 任务闭环，沉淀 SOP 到「SOP 与经验」看板
    if (approved && task.approvalType === 'completion') {
      const doc = archiveSopFromTask(tasks, task)
      if (doc) message.info(`SOP 已沉淀：「${doc.title}」可在「SOP 与经验」查看与应用`)
    }
    const nextTasks = tasks.map((t) => {
        if (t.id !== task.id) return t
        const base: WorkspaceTask = {
          ...t,
          approvalStatus: (approved ? 'approved' : 'rejected') as ApprovalStatus,
          updatedAt: now,
        }
        if (!approved) {
          return { ...base, pendingContent: t.approvalType === 'reschedule' ? null : t.pendingContent }
        }
        switch (t.approvalType) {
          case 'proposal':
            return { ...base, proposalStatus: 'approved' as const }
          case 'assign':
            return { ...base, assigneeId: t.recommendedAssigneeId ?? t.assigneeId }
          case 'content':
            return t.pendingContent
              ? {
                  ...base,
                  title: t.pendingContent.title,
                  description: t.pendingContent.description,
                  pendingContent: null,
                }
              : base
          case 'completion':
            return {
              ...base,
              status: 'done' as const,
              completedAt: t.completion?.completedAt ? dayjs(t.completion.completedAt).toISOString() : now,
            }
          case 'reschedule':
            return t.pendingContent
              ? {
                  ...base,
                  startAt: t.pendingContent.startAt ?? t.startAt,
                  endAt: t.pendingContent.endAt ?? t.endAt,
                  pendingContent: null,
                }
              : base
          default:
            return base
        }
      })
    setTasks(nextTasks)
    message.success(approved ? '审核已通过' : '已驳回该申请')
  }

  const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  const claimTask = (t: WorkspaceTask) => {
    setTasks((c) => c.map((i) => i.id === t.id ? { ...i, assigneeId: mockMe.id, status: 'in_progress', startedAt: new Date().toISOString() } : i))
    message.success(`已承接：${t.title}`)
  }

  /** 需求 1：管理重新指派承接人（直接生效） */
  const reassignTask = (t: WorkspaceTask, assigneeId: string) => {
    const name = mockUsers.find((u) => u.id === assigneeId)?.displayName ?? '新承接人'
    setTasks((c) => c.map((i) => i.id === t.id ? { ...i, assigneeId, updatedAt: new Date().toISOString() } : i))
    message.success(`已将「${t.title}」的承接人改派为 ${name}`)
  }

  /**
   * 发布任务/项目（需求 1）。
   * - 管理发布：直接生效；项目模式在 SOP 审核通过后（本函数不处理）生成项目内任务。
   * - 成员提报：进入待审核（approvalStatus='pending'），审核通过后才真正生效/生成任务。
   */
  const publishTask = (payload: PublishTaskPayload) => {
    const isProject = payload.taskMode === 'project'
    const needApproval = role !== 'manager'
    const [main, ...subs] = buildTaskFromPublish(payload, {
      createdBy: mockMe.id,
      sortOrderBase: tasks.length,
      approval: needApproval ? { status: 'pending', type: 'proposal' } : { status: 'none' },
      // 需求 1：needReview 任务发布时自动生成的评审子任务，默认由管理员承接
      reviewAssigneeId: MANAGER_ID,
    })

    // 管理直接发布的项目：按 SOP 立即生成项目内任务
    let generated: WorkspaceTask[] = []
    if (isProject && !needApproval && main.sop) {
      generated = buildProjectTasksFromSop(main, main.sop)
    }

    // 定期 / 循环：实体复制出各次执行子任务（团队协作项目不参与）
    let occurrenceTasks: WorkspaceTask[] = [main]
    if (!isProject && payload.recurrence) {
      main.recurrence = payload.recurrence
      occurrenceTasks = materializeRecurrence(main, payload.recurrence)
    }

    setTasks((c) => [...occurrenceTasks, ...subs, ...generated, ...c])
    setPublishOpen(false)

    if (isProject) {
      message.success(needApproval ? '项目已提报，等待管理人员审核' : `项目已发布，并按 SOP 生成 ${generated.length} 个任务`)
      return
    }
    const reviewCreated = subs.some((s) => s.kind === 'review')
    const recurrenceNote = !isProject && payload.recurrence ? `，并按重复规则生成 ${occurrenceTasks.length} 次执行` : ''
    message.success(
      needApproval
        ? '任务已提报，等待管理人员审核'
        : reviewCreated
          ? `任务已发布，并自动生成评审子任务${subs.length - 1 > 0 ? `与 ${subs.length - 1} 个子任务` : ''}${recurrenceNote}`
          : subs.length > 0 ? `任务已发布，并生成 ${subs.length} 个子任务${recurrenceNote}` : `任务已发布${recurrenceNote}`,
    )
  }

  /** 编辑任务（需求 6：仅管理人员可修改未承接任务，支持再次 AI 拆解） */
  const updateTask = (payload: PublishTaskPayload) => {
    if (!editTask) return
    const now = new Date().toISOString()
    setTasks((c) => {
      const next = c.map((t) => t.id === editTask.id ? {
        ...t,
        title: payload.title,
        description: payload.description || null,
        priority: payload.priority,
        // 重要程度/紧急程度与 SOP 随编辑结果刷新（日历便签联动）
        importance: payload.importance,
        urgencyDegree: payload.urgencyDegree,
        urgency: deriveTaskUrgency(payload.importance, payload.urgencyDegree),
        sop: payload.sop ?? t.sop ?? null,
        images: payload.images ?? t.images ?? [],
        taskMode: payload.taskMode,
        needReview: payload.needReview,
        assigneeId: payload.assigneeId,
        startAt: payload.startAt,
        endAt: payload.endAt,
        dueAt: payload.endAt ?? payload.startAt ?? t.dueAt,
        // 标签中的行业/任务类型随编辑结果刷新，其余自定义标签保留
        tags: [
          ...t.tags.filter(
            (x) =>
              x !== '独立任务' &&
              x !== '团队协作' &&
              !INDUSTRY_OPTIONS.includes(x as (typeof INDUSTRY_OPTIONS)[number]) &&
              !TASK_TYPE_OPTIONS.includes(x as (typeof TASK_TYPE_OPTIONS)[number]),
          ),
          payload.taskMode === 'individual' ? '独立任务' : '团队协作',
          payload.industry,
          payload.taskType,
        ],
        updatedAt: now,
      } : t)
      const subs: WorkspaceTask[] = payload.subtasks.map((s: DecomposeTask, i: number) => ({
        id: newId('sub'), tenantId: 'tenant-001', projectId: 'project-001', parentId: editTask.id,
        title: s.title, description: s.description || null, status: 'todo',
        priority: (s.priority as TaskPriority) ?? 'medium', assigneeId: null,
        dueAt: s.earliestFinish ? dayjs(s.earliestFinish).hour(18).toISOString() : payload.endAt,
        estimatedHours: s.estimatedHours ?? 2, actualHours: null, completedAt: null, startedAt: null,
        createdBy: mockMe.id, tags: ['AI拆解'], sortOrder: i + 1, workflowColumnId: null, isAiGenerated: true,
        version: 1, createdAt: now, updatedAt: now, ...COLLAB_DEFAULTS,
        taskMode: payload.taskMode, kind: 'task', needReview: false, reviewStatus: 'none',
        proposalStatus: 'none', participants: [], reviewOfTaskId: null,
        startAt: s.earliestStart ? dayjs(s.earliestStart).hour(9).toISOString() : null,
        endAt: s.earliestFinish ? dayjs(s.earliestFinish).hour(18).toISOString() : null,
        importance: payload.importance, urgencyDegree: payload.urgencyDegree,
        urgency: deriveTaskUrgency(payload.importance, payload.urgencyDegree), sop: null,
      }))
      return subs.length > 0 ? [...subs, ...next] : next
    })
    setEditTask(null)
    message.success('任务已更新')
  }

  /** 合并任务（需求 9）：源任务挂载到目标任务下，其子孙一并转移且层级关系不变 */
  const doMerge = (targetId: string) => {
    if (!mergeTask) return
    const target = tasks.find((t) => t.id === targetId)
    setTasks((c) => c.map((t) => t.id === mergeTask.id ? { ...t, parentId: targetId, updatedAt: new Date().toISOString() } : t))
    setMergeTask(null)
    message.success(`已将「${mergeTask.title}」并入「${target?.title ?? '目标任务'}」，其子任务一并转移`)
  }

  /**
   * 完成 / 提报完成（需求 5）
   * 需要评审的任务不直接完成，而是进入待评审，并自动生成评审子任务由管理员承接。
   */
  const completeTask = (t: WorkspaceTask) => {
    const now = new Date().toISOString()
    if (t.needReview) {
      // 需求 1：发布时已自动生成评审子任务的，不再重复生成，仅置主任务为待评审
      const existingReview = tasks.find((x) => x.parentId === t.id && x.kind === 'review')
      if (existingReview) {
        setTasks((c) => c.map((i) => i.id === t.id ? { ...i, reviewStatus: 'pending' as const, updatedAt: now } : i))
        message.success('已提报完成，请管理员在评审子任务中组织评审')
        return
      }
      const review: WorkspaceTask = {
        id: newId('review'), tenantId: 'tenant-001', projectId: t.projectId, parentId: t.id,
        title: `${t.title} · 项目评审`,
        description: `由「${t.title}」提报完成后自动生成，管理员承接并邀请参与人`,
        status: 'in_progress', priority: t.priority, assigneeId: MANAGER_ID,
        dueAt: dayjs().add(2, 'day').toISOString(), estimatedHours: 2, actualHours: null,
        completedAt: null, startedAt: now,
        createdBy: mockMe.id, tags: ['评审'], sortOrder: 0, workflowColumnId: null, isAiGenerated: false,
        version: 1, createdAt: now, updatedAt: now, ...COLLAB_DEFAULTS,
        taskMode: 'team', kind: 'review', needReview: false, reviewStatus: 'none',
        proposalStatus: 'none', participants: [], reviewOfTaskId: t.id,
        startAt: now, endAt: dayjs().add(2, 'day').toISOString(),
      }
    setTasks((c) => {
      const next = c.map((i) => i.id === t.id ? { ...i, reviewStatus: 'pending' as const, updatedAt: now } : i)
      return [review, ...next]
    })
    message.success('已提报完成，系统自动生成评审子任务并指派给管理员')
    return
  }
  // 非评审任务：完成必须通过执行页门禁（填完成时间+总结+管理审核），不在此直接置 done
  navigate(`/tasks/${t.id}/execution`)
  message.info('请在任务执行页填写完成时间与任务总结后提报完成')
}

  /** 管理员审批通过（需求 5：需评审的任务必须评审通过后才可审批） */
  const approveTask = (t: WorkspaceTask) => {
    if (t.needReview && t.reviewStatus !== 'passed') {
      message.warning('该任务需要评审，请等待评审任务完成后再审批')
      return
    }
    const now = new Date().toISOString()
    // 需求 6：审批通过 = 任务闭环，沉淀 SOP 到「SOP 与经验」看板
    const doc = archiveSopFromTask(tasks, { ...t, status: 'done' })
    setTasks((c) => c.map((i) => i.id === t.id ? { ...i, status: 'done', completedAt: now, updatedAt: now } : i))
    if (doc) message.info(`SOP 已沉淀：「${doc.title}」可在「SOP 与经验」查看与应用`)
    else message.success(`已审批通过：${t.title}`)
  }

  /**
   * 需求 2：邀请评审参与人 —— 评审任务涉及多人时按人拆成多个评审任务，
   * 每个评审任务仅一人承接执行（同主任务+同人去重，不重复创建）。
   */
  const inviteReviewers = (participants: string[]) => {
    if (!reviewTask) return
    const mainTask = reviewTask.reviewOfTaskId ? tasks.find((t) => t.id === reviewTask.reviewOfTaskId) : null
    const now = new Date().toISOString()
    setTasks((c) => {
      let next = c.map((t) => t.id === reviewTask.id ? { ...t, participants, updatedAt: now } : t)
      const created: WorkspaceTask[] = []
      participants.forEach((uid, i) => {
        const dup = next.some((t) => t.reviewOfTaskId === reviewTask.reviewOfTaskId && t.assigneeId === uid && t.kind === 'review')
        if (dup || !reviewTask.reviewOfTaskId) return
        const name = mockUsers.find((u) => u.id === uid)?.displayName ?? uid
        created.push({
          id: newId('review'), tenantId: 'tenant-001', projectId: reviewTask.projectId,
          parentId: reviewTask.reviewOfTaskId,
          title: `${mainTask?.title ?? reviewTask.title} · 评审（${name}）`,
          description: `多人评审按人拆分：${name} 独立承接本评审任务`,
          status: 'todo', priority: reviewTask.priority, assigneeId: uid,
          dueAt: reviewTask.dueAt, estimatedHours: 1, actualHours: null, completedAt: null, startedAt: null,
          createdBy: mockMe.id, tags: ['评审'], sortOrder: 100 + i, workflowColumnId: null, isAiGenerated: false,
          version: 1, createdAt: now, updatedAt: now, ...COLLAB_DEFAULTS,
          taskMode: 'team', kind: 'review', needReview: false, reviewStatus: 'none',
          proposalStatus: 'none', participants: [], reviewOfTaskId: reviewTask.reviewOfTaskId,
          startAt: reviewTask.startAt, endAt: reviewTask.endAt,
          importance: mainTask?.importance, urgencyDegree: mainTask?.urgencyDegree,
          urgency: mainTask?.urgency, sop: null,
        })
      })
      return created.length > 0 ? [...created, ...next] : next
    })
    message.success(`已设置 ${participants.length} 位评审参与人，并按人生成独立评审任务`)
  }

  /** 完成评审（需求 5）：评审完成后主任务方可审批通过；按人拆分的评审任务一并闭环 */
  const finishReview = (payload: ReviewActionPayload) => {
    if (!reviewTask) return
    const now = new Date().toISOString()
    setTasks((c) => c.map((t) => {
      if (t.id === reviewTask.id) {
        return { ...t, status: 'done', completedAt: now, participants: payload.participants, description: payload.conclusion, updatedAt: now }
      }
      // 同主任务下的按人评审子任务一并完成
      if (t.kind === 'review' && t.reviewOfTaskId && t.reviewOfTaskId === reviewTask.reviewOfTaskId && t.id !== reviewTask.id) {
        return { ...t, status: 'done', completedAt: now, updatedAt: now }
      }
      if (reviewTask.reviewOfTaskId && t.id === reviewTask.reviewOfTaskId) {
        return { ...t, reviewStatus: 'passed' as const, updatedAt: now }
      }
      return t
    }))
    setReviewTask(null)
    message.success('评审已完成，主任务现在可以审批通过')
  }

  /** 添加个人计划（需求 4）：两类角色均可，时间与任务冲突时不可提交 */
  const addPlan = (payload: PersonalPlanPayload) => {
    const now = new Date().toISOString()
    const plan: WorkspaceTask = {
      id: newId('plan'), tenantId: 'tenant-001', projectId: null, parentId: null,
      title: payload.title, description: payload.note || null, status: 'todo',
      priority: 'medium', assigneeId: mockMe.id,
      dueAt: payload.endAt, estimatedHours: 1, actualHours: null, completedAt: null, startedAt: null,
      createdBy: mockMe.id, tags: ['个人计划'], sortOrder: tasks.length + 1, workflowColumnId: null, isAiGenerated: false,
      version: 1, createdAt: now, updatedAt: now, ...COLLAB_DEFAULTS,
      taskMode: 'individual', kind: 'plan', needReview: false, reviewStatus: 'none',
      proposalStatus: 'none', participants: [], reviewOfTaskId: null,
      startAt: payload.startAt, endAt: payload.endAt,
      // 需求：个人计划同样带重要程度/紧急程度，日历便签联动
      importance: payload.importance ?? 'important',
      urgencyDegree: payload.urgencyDegree ?? 'notUrgent',
      urgency: deriveTaskUrgency(payload.importance, payload.urgencyDegree),
      images: payload.images ?? [],
      sop: null,
    }
    const plans = payload.recurrence ? materializeRecurrence(plan, payload.recurrence) : [plan]
    setTasks((c) => [...plans, ...c])
    setPlanOpen(false)
    setPlanRange(null)
    message.success(payload.recurrence ? `个人计划已添加，并按重复规则生成 ${plans.length} 次` : '个人计划已添加到日历')
  }

  /** 第五批需求 1：移除协作工作台的「提报」审核逻辑，与 /audit 重复 —— 提报审核统一走 /audit 页 */

  const addExperience = (values: { note: string; tags: string }) => {
    if (!selectedTask) return
    const tags = values.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean)
    const note: ExperienceNote = { id: `exp-${Date.now()}`, taskTitle: selectedTask.title, author: mockMe.displayName, note: values.note, tags, createdAt: '刚刚' }
    setExperience((c) => [note, ...c])
    setSops((c) => [{ id: `sop-${Date.now()}`, title: `${selectedTask.title} SOP`, sourceTask: selectedTask.title, steps: ['复盘目标与结果', values.note, '整理可复用步骤', '下次任务引用本 SOP'], references: 1 }, ...c])
    setWikiKb((c) => [{
      id: `wiki-${Date.now()}`,
      title: `${selectedTask.title} 经验卡`,
      summary: values.note.slice(0, 60),
      content: values.note,
      keywords: tags,
      source: `经验：${selectedTask.title}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, ...c])
    setExperienceOpen(false); setSelectedTask(null)
    message.success('经验已记录，并生成 SOP 与 Wiki 经验卡')
  }

  /* ── 总览视图 ── */
  const renderOverview = () => (
    <>
      <div className="welcome-strip">
        <div className="welcome-greeting">
          <h2>{dayjs().hour() < 12 ? '早上好' : dayjs().hour() < 18 ? '下午好' : '晚上好'}，{mockMe.displayName}</h2>
          <p>{dayjs().format('YYYY年MM月DD日 dddd')} · 北极星研发组 · 本周已完成 {completedTasks.filter((t) => dayjs(t.completedAt).isAfter(dayjs().startOf('week'))).length} 项任务</p>
          <div style={{ marginTop: 10 }}>
            <MoodIndexBar />
          </div>
        </div>
        <Space>
          {/* 第五批需求 1：协作工作台不再保留提报入口（与「提报」页重复），成员去 /report 提报；管理在工作台快速发布 */}
          {role === 'manager' && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setPublishOpen(true)}>发布任务/项目</Button>
          )}
          {/* 需求 8：一键跳转项目总览（项目看板已合并到项目页内，不再单独入口） */}
          <Button icon={<AppstoreOutlined />} onClick={() => navigate('/projects')}>项目总览</Button>
        </Space>
      </div>

      <div className="stat-grid">
        <div className="stat-card"><span className="stat-label">我的任务</span><span className="stat-value" style={{ color: 'var(--accent-cyan)' }}>{myTasks.length}</span><span className="stat-sub"><span className="up">{inProgressTasks.filter((t) => t.assigneeId === mockMe.id).length} 进行中</span></span></div>
        <div className="stat-card"><span className="stat-label">待承接</span><span className="stat-value" style={{ color: 'var(--accent-amber)' }}>{unassignedTasks.length}</span><span className="stat-sub"><span className="warn">{blockedTasks.length} 阻塞</span></span></div>
        <div className="stat-card"><span className="stat-label">已完成</span><span className="stat-value" style={{ color: 'var(--accent-blue)' }}>{completedTasks.length}</span><span className="stat-sub">累计 {tasks.length} 项任务</span></div>
        <div className="stat-card">
          <span className="stat-label">项目健康度</span>
          <span className="stat-value" style={{ color: projectHealthList.avgScore < 60 ? 'var(--accent-coral)' : projectHealthList.avgScore < 80 ? 'var(--accent-amber)' : 'var(--accent-cyan)' }}>
            {projectHealthList.avgScore}%
          </span>
          <span className="stat-sub">{role === 'manager' ? '全部' : '我参与的'} {projectHealthList.list.length} 个项目</span>
        </div>
      </div>

      <div className="workspace-grid">
        <div className="workspace-main">
          <Card title={<Space><CalendarOutlined />今日时间轴</Space>} extra={
            <Space>
              <Text type="secondary" style={{ fontSize: 12 }}>仅展示我涉及的任务与计划</Text>
              <Button size="small" onClick={() => setDate((c) => c.subtract(1, 'day'))}>前一天</Button>
              <Button size="small" onClick={() => setDate((c) => c.add(1, 'day'))}>后一天</Button>
            </Space>
          }>
            <DayBoard tasks={todayPersonalTasks} day={date} onSelect={(t) => navigate(taskRoute(tasks, t))} mode="compact" />
          </Card>

          <Card title={<Space><ThunderboltOutlined />优先任务流</Space>} extra={<Text type="secondary">按优先级·逾期·阻塞排序</Text>}>
            {tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled').sort((a, b) => {
              const order = { urgent: 0, high: 1, medium: 2, low: 3 }
              const sa = order[a.priority] ?? 2; const sb = order[b.priority] ?? 2
              if (sa !== sb) return sa - sb
              if (!a.dueAt) return 1; if (!b.dueAt) return -1
              return dayjs(a.dueAt).diff(dayjs(b.dueAt))
            }).slice(0, 8).map((t, i) => {
              const overdue = t.dueAt && dayjs(t.dueAt).isBefore(dayjs(), 'day')
              return (
                <div className="priority-task-item" key={t.id}>
                  <span className="priority-rank" style={{ color: i < 3 ? 'var(--accent-coral)' : undefined }}>{String(i + 1).padStart(2, '0')}</span>
                  <div className="priority-task-info">
                    <div className="task-title">{t.title}</div>
                    <div className="task-meta">
                      <Space size={4}>
                        <Tag color={priorityMeta[t.priority].color}>{priorityMeta[t.priority].label}</Tag>
                        {t.status === 'blocked' && <Tag color="error">阻塞</Tag>}
                        {overdue && <Tag color="error">逾期</Tag>}
                        {t.assigneeId ? <Text type="secondary" style={{ fontSize: 11 }}>{mockUsers.find((u) => u.id === t.assigneeId)?.displayName ?? '已指派'}</Text> : <Tag color="gold">待承接</Tag>}
                        {t.dueAt && <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(t.dueAt).format('MM-DD HH:mm')}</Text>}
                      </Space>
                    </div>
                  </div>
                  {role === 'member' && !t.assigneeId && <Button type="link" size="small" onClick={() => claimTask(t)}>承接</Button>}
                </div>
              )
            })}
          </Card>

          {role === 'manager' && <TeamExecutionPanel tasks={tasks} />}
        </div>

        <div className="workspace-side">
          <Card title="项目健康度" size="small">
            {projectHealthList.list.length === 0 ? (
              <Empty description="暂无项目数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <>
                <div className="health-bar-wrap">
                  {projectHealthList.list.map(({ project, health }) => {
                    const color = health.score >= 80 ? 'var(--accent-cyan)' : health.score >= 60 ? 'var(--accent-amber)' : 'var(--accent-coral)'
                    return (
                      <div key={project.id} className="health-row">
                        <span className="health-label" title={project.name}>{project.name}</span>
                        <div className="health-track">
                          <div className="health-fill" style={{ width: `${health.score}%`, background: color }} />
                        </div>
                        <Text style={{ fontSize: 11, width: 32, textAlign: 'right', color }}>{health.score}%</Text>
                      </div>
                    )
                  })}
                </div>
                <Divider style={{ margin: '14px 0' }} />
                <Space direction="vertical" style={{ width: '100%' }}>
                  {projectHealthList.list
                    .filter(({ health }) => health.blocked > 0 || health.overdue > 0)
                    .slice(0, 3)
                    .map(({ project, health }) => (
                      <Text key={project.id} type="secondary" style={{ fontSize: 12 }}>
                        ⚠ {project.name} {health.blocked > 0 ? `阻塞 ${health.blocked} 项` : ''}
                        {health.blocked > 0 && health.overdue > 0 ? ' · ' : ''}
                        {health.overdue > 0 ? `逾期 ${health.overdue} 项` : ''}
                      </Text>
                    ))}
                  {projectHealthList.list.every(({ health }) => health.blocked === 0 && health.overdue === 0) && (
                    <Text type="secondary" style={{ fontSize: 12 }}>暂无阻塞或逾期风险</Text>
                  )}
                </Space>
              </>
            )}
          </Card>
          {role === 'manager' && (
            <Card title="团队负载" size="small">
              {mockUsers.map((u) => {
                const count = tasks.filter((t) => t.assigneeId === u.id && t.status !== 'done' && t.status !== 'cancelled').length
                const pct = Math.min(count * 25, 100)
                return (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <Avatar size={28} icon={<UserOutlined />} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <Text style={{ fontSize: 12 }}>{u.displayName}</Text>
                        <Text style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: count > 3 ? 'var(--accent-coral)' : 'var(--text-tertiary)' }}>{count} 项</Text>
                      </div>
                      <div className="health-track"><div className="health-fill" style={{ width: `${pct}%`, background: count > 3 ? 'var(--accent-coral)' : 'var(--accent-cyan)' }} /></div>
                    </div>
                  </div>
                )
              })}
            </Card>
          )}
          <Card title={<Space><SettingOutlined />当前角色</Space>} size="small">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Tag color={role === 'manager' ? 'blue' : 'gold'} icon={role === 'manager' ? <SettingOutlined /> : <UserOutlined />}>
                {role === 'manager' ? '管理人员' : '普通人员'}
              </Tag>
              <Divider style={{ margin: '8px 0' }} />
              {role === 'manager' ? (
                <>
                  {/* 与顶部「发布任务」重复，此处改为管理已有任务：编辑未承接任务、合并、审批、再次 AI 拆解 */}
                  <Button type="primary" block icon={<SettingOutlined />} onClick={() => setActiveTab('tasks')}>管理任务</Button>
                </>
              ) : (
                <>
                  {/* 需求 4：普通人员无发布权限，仅可承接任务；提报统一在 /report 页面（第五批需求 1） */}
                  <Button type="primary" block icon={<CheckCircleOutlined />} onClick={() => setActiveTab('tasks')}>浏览并承接任务</Button>
                </>
              )}
              {/* 需求 4：两类角色均可安排个人计划 */}
              <Button block icon={<CalendarOutlined />} onClick={() => { setPlanRange(null); setPlanOpen(true) }}>安排个人计划</Button>
              <Button type="link" size="small" danger block onClick={resetDemoData}>重置演示数据</Button>
            </Space>
          </Card>
        </div>
      </div>
    </>
  )

  /** 任务看板（需求 3/5/6/7/9）：树形展示父子任务，承载承接、编辑、合并、评审、审批操作 */
  const renderTasks = () => (
    <Card
      title="任务看板"
      extra={
        role === 'manager' ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setPublishOpen(true)}>发布任务/项目</Button>
        ) : (
          <Text type="secondary">普通人员可承接任务或提报新任务</Text>
        )
      }
    >
      <TaskBoardTree
        tasks={boardTasks}
        role={role}
        currentUserId={mockMe.id}
        onClaim={claimTask}
        onEdit={(t) => setEditTask(t)}
        onMerge={(t) => setMergeTask(t)}
        onComplete={completeTask}
        onApprove={approveTask}
        onOpenReview={(t) => setReviewTask(t)}
        onReassign={reassignTask}
        onOpenExecution={(t) => navigate(`/tasks/${t.id}/execution`)}
      />
    </Card>
  )

  /** 第五批需求 1：移除协作工作台的「提报」tab/功能，与 /report 重复 —— 改为统一走「提报」页 */

  /** 需求 3：审核中心 —— 新任务提报、承接指派、内容变更、完成提报统一在此处理 */
  const renderApprovals = () => (
    <Card title="待审核事项" extra={<Tag color="gold">{pendingApprovals.length} 条待处理</Tag>}>
      {role !== 'manager' ? (
        <Text type="secondary">审核事项仅管理人员可见。</Text>
      ) : pendingApprovals.length === 0 ? (
        <Empty description="暂无待审核事项" />
      ) : (
        <List
          dataSource={pendingApprovals}
          renderItem={(t) => (
            <List.Item
              actions={[
                <Button key="ok" type="primary" size="small" onClick={() => resolveApproval(t, true)}>通过</Button>,
                <Button key="no" size="small" danger onClick={() => resolveApproval(t, false)}>驳回</Button>,
                <Link key="open" to={taskRoute(tasks, t)}>
                  <Button size="small" type="link">执行页</Button>
                </Link>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space wrap>
                    <Text strong>{t.title}</Text>
                    <Tag color="blue">{t.approvalType ? APPROVAL_TYPE_META[t.approvalType].label : '待审'}</Tag>
                  </Space>
                }
                description={
                  <Space direction="vertical" size={2}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      负责人：{mockUsers.find((u) => u.id === t.assigneeId)?.displayName ?? '待承接'}
                      {t.recommendedAssigneeId
                        ? ` · 推荐承接人：${mockUsers.find((u) => u.id === t.recommendedAssigneeId)?.displayName ?? '-'}`
                        : ''}
                    </Text>
                    {t.approvalType === 'content' && t.pendingContent && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        变更内容：{t.pendingContent.title}（由 {t.pendingContent.submittedBy} 提交）
                      </Text>
                    )}
                    {t.approvalType === 'completion' && t.completion && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        完成时间：{t.completion.completedAt} · 标签：{t.completion.tags.join('、')}
                      </Text>
                    )}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Card>
  )

  /** 需求 6：SOP 与经验看板 —— 展示总结字段与流程图，支持跳转发布任务时选择应用 */
  const renderSop = () => (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={15}>
        <Card
          title={<Space><FileTextOutlined />可复用 SOP</Space>}
          extra={<Text type="secondary" style={{ fontSize: 12 }}>任务闭环后自动沉淀；点击「应用」预填到新任务</Text>}
        >
          <List
            dataSource={sops}
            renderItem={(sop) => {
              const flow = sop.flow ? { steps: sop.flow, source: 'manual' as const, updatedAt: sop.archivedAt ?? '' } : null
              return (
                <List.Item
                  actions={[
                    <Button
                      key="apply"
                      type="link"
                      size="small"
                      onClick={() => {
                        setApplySop(sop)
                        setPublishOpen(true)
                        message.success(`已选择「${sop.title}」，发布任务时将预填该流程`)
                      }}
                    >
                      应用到新任务
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={<Space wrap><Text strong>{sop.title}</Text>{sop.archivedAt && <Tag color="green">任务闭环沉淀</Tag>}</Space>}
                    description={
                      <>
                        <Text type="secondary">来源任务：{sop.sourceTask} · 被引用 {sop.references} 次</Text>
                        {sop.summary && (
                          <Paragraph style={{ marginTop: 6, marginBottom: 4 }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>总结：</Text>
                            {sop.summary}
                          </Paragraph>
                        )}
                        {flow ? (
                          <div style={{ marginTop: 8 }}>
                            <SopFlowTree steps={flow.steps} source="manual" />
                          </div>
                        ) : (
                          <Timeline style={{ marginTop: 12 }} items={sop.steps.map((step) => ({ children: step }))} />
                        )}
                      </>
                    }
                  />
                </List.Item>
              )
            }}
          />
        </Card>
      </Col>
      <Col xs={24} lg={9}>
        <ExperiencePanel experience={experience} onAdd={() => { setSelectedTask(completedTasks[0] ?? null); setExperienceOpen(true) }} />
      </Col>
    </Row>
  )
  const renderPomodoro = () => <PomodoroPanel task={pomodoroTask} setTask={setPomodoroTask} seconds={seconds} running={running} setRunning={setRunning} reset={() => { setRunning(false); setSeconds(25 * 60) }} />

  const tabItems = [
    { key: 'overview', label: <Space><AppstoreOutlined />指挥舱</Space>, children: renderOverview() },
    { key: 'calendar', label: <Space><CalendarOutlined />日历</Space>, children: <CalendarBoard tasks={tasks} role={role} date={date} setDate={setDate} view={view} setView={setView} shiftDate={shiftDate} onAddPlan={(range) => { setPlanRange(range); setPlanOpen(true) }} onSelectTask={(t) => navigate(taskRoute(tasks, t))} /> },
    { key: 'tasks', label: <Space><TeamOutlined />任务协作</Space>, children: renderTasks() },
    // 第五批需求 1：协作工作台移除「提报」tab，避免与 /report 重复
    {
      key: 'approvals',
      label: (
        <Space>
          <AuditOutlined />审核
          {pendingApprovals.length > 0 && <Badge count={pendingApprovals.length} size="small" />}
        </Space>
      ),
      children: renderApprovals(),
    },
    { key: 'sop', label: <Space><FileTextOutlined />SOP 与经验</Space>, children: renderSop() },
    { key: 'pomodoro', label: <Space><ClockCircleOutlined />番茄钟</Space>, children: renderPomodoro() },
  ]

  return <div>
    <Row align="middle" justify="space-between" style={{ marginBottom: 20 }}>
      <Col><Title level={3} style={{ margin: 0, color: 'var(--text-primary)' }}>协作工作台</Title><Text type="secondary">计划、承接、执行、复盘和知识沉淀在同一条工作流中</Text></Col>
      <Col><Space>
        {/* 需求 3：有待审事项时推送管理人员提醒 */}
        {role === 'manager' && pendingApprovals.length > 0 && (
          <Badge count={pendingApprovals.length}>
            <Button size="small" icon={<AuditOutlined />} onClick={() => setActiveTab('approvals')}>
              待审核
            </Button>
          </Badge>
        )}
        <Button size="small" type="primary" icon={<FileTextOutlined />} onClick={() => setPublishOpen(true)}>
          {role === 'manager' ? '发布任务/项目' : '提报任务/项目'}
        </Button>
      </Space></Col>
    </Row>
    <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} type="card" />
    {/* 需求 1/2/5：发布任务弹窗已内置 AI 拆解、任务模式与评审开关；需求 6：支持从 SOP 看板预填流程 */}
    <PublishTaskModal
      open={publishOpen}
      role={role}
      tasks={tasks}
      initialSop={applySop?.flow ? { steps: applySop.flow, source: 'manual', updatedAt: applySop.archivedAt ?? '' } : null}
      onCancel={() => { setPublishOpen(false); setApplySop(null) }}
      onSubmit={(payload) => { publishTask(payload); setApplySop(null) }}
    />
    {/* 需求 6：编辑未承接任务，同样支持 AI 拆解 */}
    <PublishTaskModal
      open={Boolean(editTask)}
      role={role}
      tasks={tasks}
      editTask={editTask}
      onCancel={() => setEditTask(null)}
      onSubmit={updateTask}
    />
    {/* 需求 9：合并任务 */}
    <MergeTaskModal
      open={Boolean(mergeTask)}
      sourceTask={mergeTask}
      tasks={tasks}
      onCancel={() => setMergeTask(null)}
      onSubmit={doMerge}
    />
    {/* 需求 5：评审任务处理 */}
    <ReviewActionModal
      open={Boolean(reviewTask)}
      reviewTask={reviewTask}
      parentTask={reviewTask?.reviewOfTaskId ? tasks.find((t) => t.id === reviewTask.reviewOfTaskId) ?? null : null}
      onCancel={() => setReviewTask(null)}
      onInvite={inviteReviewers}
      onComplete={finishReview}
    />
    {/* 需求 4：个人计划，带时间冲突检测 */}
    <PersonalPlanModal
      open={planOpen}
      initialRange={planRange}
      tasks={tasks}
      onCancel={() => { setPlanOpen(false); setPlanRange(null) }}
      onSubmit={addPlan}
    />
    <Modal title="记录任务经验" open={experienceOpen} onCancel={() => setExperienceOpen(false)} footer={null} destroyOnHidden><Paragraph>任务：<Text strong>{selectedTask?.title ?? '请选择已完成任务'}</Text></Paragraph><Form layout="vertical" onFinish={addExperience}><Form.Item name="note" label="经验记录" rules={[{ required: true, message: '请记录可复用经验' }]}><Input.TextArea rows={5} placeholder="记录做法、关键判断、踩坑和下次建议" /></Form.Item><Form.Item name="tags" label="关键词" initialValue="流程, 复用"><Input placeholder="用逗号分隔，例如：流程, 评审, 客户" /></Form.Item><Button type="primary" htmlType="submit" block icon={<EditOutlined />}>保存并生成 SOP</Button></Form></Modal>
  </div>
}

// 日历看板（日/周/月/年）逻辑已迁移至 @/components/workspace/CalendarBoard

function ExperiencePanel({ experience, onAdd }: { experience: ExperienceNote[]; onAdd: () => void }) {
  return <Card title={<Space><BulbOutlined />经验记录</Space>} extra={<Button type="link" onClick={onAdd}>新增</Button>}><List size="small" dataSource={experience} renderItem={(item) => <List.Item><List.Item.Meta title={item.taskTitle} description={<><Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 4 }}>{item.note}</Paragraph><Space wrap>{item.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}<Text type="secondary">{item.author} · {item.createdAt}</Text></Space></>} /></List.Item>} /></Card>
}

// Wiki 知识库已重构为 WikiKnowledgeBase 组件（三栏 + 拓扑图）

function PomodoroPanel({ task, setTask, seconds, running, setRunning, reset }: { task: string; setTask: (v: string) => void; seconds: number; running: boolean; setRunning: (v: boolean) => void; reset: () => void }) {
  const percent = Math.round((seconds / (25 * 60)) * 100)
  return <Row gutter={[16, 16]}><Col xs={24} md={14}><Card title={<Space><ClockCircleOutlined />任务番茄钟</Space>}><Select value={task} onChange={setTask} style={{ width: '100%', marginBottom: 24 }} options={mockTasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled').map((t) => ({ value: t.title, label: t.title }))} /><Progress type="circle" percent={percent} format={() => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`} /><Divider /><Space><Button type="primary" onClick={() => setRunning(!running)}>{running ? '暂停' : '开始'}</Button><Button onClick={reset}>重置</Button></Space></Card></Col><Col xs={24} md={10}><Card title="提醒策略"><Descriptions column={1} size="small"><Descriptions.Item label="工作时长">25 分钟</Descriptions.Item><Descriptions.Item label="短休息">5 分钟</Descriptions.Item><Descriptions.Item label="长休息">4 个番茄钟后 15 分钟</Descriptions.Item><Descriptions.Item label="提醒对象">任务、事件、截止时间</Descriptions.Item></Descriptions><Alert type="info" showIcon message="完成番茄钟后可在任务详情记录实际工时，作为后续评估与 SOP 复盘依据。" /></Card></Col></Row>
}

