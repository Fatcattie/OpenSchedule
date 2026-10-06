/**
 * 职责：项目服务 —— 项目列表 / 项目统计 / 看板列聚合 / 项目创建。
 */
import { db, findProject, findUser, nextId, now } from '@/data'
import { ApiError, type Project, type ProjectStatus, type Task, type User } from '@/types'
import { boardColumnOrder, getStatusStyle } from '@/theme'
import { isSubmissionRecord } from '@/utils/submission'
import { httpClient, simulateLatency } from './client'
import { USE_MOCK } from './config'

/** 项目筛选：进行中 / 已归档 / 全部 */
export type ProjectFilter = 'active' | 'archived' | 'all'

/** 项目卡片数据（项目列表页渲染用） */
export interface ProjectCardData {
  project: Project
  /** 完成率 0..1 */
  progress: number
  taskCount: number
  doneCount: number
  owner: User | null
}

/** 看板列（按状态分列） */
export interface BoardColumn {
  status: Task['status']
  label: string
  color: string
  tasks: Task[]
}

/** 计算项目完成率（已完成 / 总数，忽略已取消；提报记录不计入，ARCH §7） */
function computeProgress(projectId: string): { progress: number; taskCount: number; doneCount: number } {
  const tasks = db.tasks.filter(
    (task) =>
      task.projectId === projectId && task.status !== 'cancelled' && !isSubmissionRecord(task),
  )
  const doneCount = tasks.filter((task) => task.status === 'done').length
  const taskCount = tasks.length
  return {
    progress: taskCount === 0 ? 0 : doneCount / taskCount,
    taskCount,
    doneCount,
  }
}

/** 项目列表（含进度与任务数） */
export async function listProjectCards(filter: ProjectFilter = 'active'): Promise<ProjectCardData[]> {
  if (USE_MOCK) {
    await simulateLatency()
    const projects = db.projects.filter((project) => {
      if (filter === 'all') return true
      if (filter === 'archived') return project.status === 'archived'
      return project.status === 'active'
    })
    return projects.map((project) => {
      const stats = computeProgress(project.id)
      return {
        project: { ...project },
        progress: stats.progress,
        taskCount: stats.taskCount,
        doneCount: stats.doneCount,
        owner: findUser(project.ownerId),
      }
    })
  }
  // TODO(real-api): GET /projects?status=:filter
  return httpClient.get<ProjectCardData[]>('/projects', { query: { status: filter } })
}

/** 项目详情 */
export async function getProject(projectId: string): Promise<Project> {
  if (USE_MOCK) {
    await simulateLatency()
    const project = findProject(projectId)
    if (!project) throw new ApiError(40401, '项目不存在或不可见')
    return { ...project }
  }
  // TODO(real-api): GET /projects/:projectId
  return httpClient.get<Project>(`/projects/${projectId}`)
}

/** 项目统计（进度 / 任务数 / 已完成数 / 负责人） */
export async function getProjectStats(projectId: string): Promise<ProjectCardData> {
  if (USE_MOCK) {
    await simulateLatency()
    const project = findProject(projectId)
    if (!project) throw new ApiError(40401, '项目不存在或不可见')
    const stats = computeProgress(projectId)
    return {
      project: { ...project },
      progress: stats.progress,
      taskCount: stats.taskCount,
      doneCount: stats.doneCount,
      owner: findUser(project.ownerId),
    }
  }
  // TODO(real-api): GET /projects/:projectId/stats
  return httpClient.get<ProjectCardData>(`/projects/${projectId}/stats`)
}

/** 看板列（todo / in_progress / blocked / done 四列，列内按 sortOrder 升序） */
export async function listBoardColumns(projectId: string): Promise<BoardColumn[]> {
  if (USE_MOCK) {
    await simulateLatency()
    const project = findProject(projectId)
    if (!project) throw new ApiError(40401, '项目不存在或不可见')
    const tasks = db.tasks.filter(
      (task) => task.projectId === projectId && !isSubmissionRecord(task),
    )
    return boardColumnOrder.map((status) => {
      const style = getStatusStyle(status)
      return {
        status,
        label: style.label,
        color: style.color,
        tasks: tasks
          .filter((task) => task.status === status)
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder),
      }
    })
  }
  // TODO(real-api): GET /projects/:projectId/board
  return httpClient.get<BoardColumn[]>(`/projects/${projectId}/board`)
}

/** 项目状态筛选选项（列表页分段控件） */
export const PROJECT_FILTER_OPTIONS: { value: ProjectFilter; label: string }[] = [
  { value: 'active', label: '进行中' },
  { value: 'archived', label: '已归档' },
  { value: 'all', label: '全部' },
]

/** 创建项目入参（manager 直接创建，PRD §8.3） */
export interface CreateProjectInput {
  name: string
  description?: string
  ownerId?: string | null
  deadline?: string | null
}

/**
 * 构造并落库一条正式项目（mock 内部复用：createProject / 审核落地 / 免审直落）。
 * 产出恒为 `status='active'`，`ownerId` 缺省回落为创建人。
 */
export function insertProject(input: CreateProjectInput, actorId: string): Project {
  const timestamp = now()
  const project: Project = {
    id: nextId('project'),
    tenantId: db.tenant.id,
    name: input.name,
    description: input.description ?? null,
    ownerId: input.ownerId ?? actorId,
    status: 'active',
    deadline: input.deadline ?? null,
    workflowId: null,
    createdBy: actorId,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  db.projects.push(project)
  return project
}

/** 创建项目（manager 直接创建，立即落地，无需审核） */
export async function createProject(input: CreateProjectInput, actorId: string): Promise<Project> {
  if (USE_MOCK) {
    await simulateLatency()
    return { ...insertProject(input, actorId) }
  }
  // TODO(real-api): POST /projects  body: { ...input }
  return httpClient.post<Project>('/projects', input)
}

/** 项目状态中文文案（兜底导出，供页面直接引用） */
export const PROJECT_STATUS_TEXT: Record<ProjectStatus, string> = {
  active: '进行中',
  archived: '已归档',
  completed: '已完成',
}
