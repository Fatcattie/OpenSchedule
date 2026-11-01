/**
 * 职责：mock 接口实现（fixture）—— 后端未就绪时用内存态数据模拟（刷新页面重置），错误码与状态机规则按规格 3.1/3.3 演示
 *
 * 位置说明（R8 mock→fixture 节点）：本文件已从 `src/api/mock/` 移至 `src/__fixtures__/mock/`，
 * 与生产代码路径 `src/api/` 分离；唯一入口是 `src/api/mock/loader.ts` 的懒加载（`getMockHandlers()`），
 * 仅在 `USE_MOCK=true` 时被 dynamic import 成独立 chunk。
 *
 * TODO(后端就绪后): 设置 VITE_USE_MOCK=false（或删除 loader 与各 api 模块中的 USE_MOCK 分支），即切换到真实接口
 */
import { ApiClientError } from '@/api/errors'
import { TASK_TRANSITIONS } from '@/types'
import type { Attachment, AttachmentDownload, AttachmentResourceType } from '@/api/attachmentApi'
import type { ImportErrorRow, ImportedTask, ImportResult } from '@/api/importExportApi'
import type { SearchHit, SearchType } from '@/api/searchApi'
import type { PeriodSummary, SaveSummaryInput, SaveSummaryResult, SummaryPeriod, SummaryTaskItem } from '@/api/summaryApi'
import type { AuthTokens, LoginInput, MeResponse, RegisterInput } from '@/types'
import type { CreateProjectInput, Project, UpdateProjectInput } from '@/types'
import type { CreateCommentInput, CreateTaskInput, MoveTaskInput, Task, TaskComment, TaskPriority, TaskStatus } from '@/types'
import type { BurndownData, CreateDependencyInput, GanttData, GanttRow, LoadData, PlanResult, TaskDependency } from '@/types'
import type { CandidateScore, ComplexityTier, MemberProfile, MemberProfileStats, MemberStat, MembersStatsResult, MyStatsResult, RecommendationResult, UpdateProfileInput } from '@/types'
import type { TodayItem } from '@/api/todayApi'
import type { PageParams, Paged } from '@/types'
import { mockComments as seedComments, mockMe, mockProjects as seedProjects, mockTasks as seedTasks, mockTenant } from './data'

// 内存态数据（深拷贝种子，避免共享引用；页面刷新后重置）
const projects: Project[] = structuredClone(seedProjects)
const tasks: Task[] = structuredClone(seedTasks)
const comments: TaskComment[] = structuredClone(seedComments)
// 收尾模块内存态（附件/总结草稿无种子数据，从空开始累计）
const attachments: Attachment[] = []
const summaryDrafts = new Map<string, SaveSummaryResult>() // key: period（同周期覆盖写）

/** 模拟网络延迟，让三态（加载中）可感知 */
const delay = (ms = 350) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const now = () => new Date().toISOString()
const uuid = () => crypto.randomUUID()

function notFound(resource: string): never {
  throw new ApiClientError(40401, `${resource}不存在或不可见`, [], 404)
}

function paginate<T>(items: T[], params: PageParams = {}): Paged<T> {
  const page = params.page ?? 1
  const pageSize = Math.min(params.pageSize ?? 20, 100)
  const start = (page - 1) * pageSize
  return { items: items.slice(start, start + pageSize), total: items.length, page, pageSize }
}

// ─────────────────────────── 认证（/auth） ───────────────────────────

/** 模拟 POST /auth/login：任意合法邮箱可登录；密码 error 演示登录失败分支 */
export async function mockLogin(input: LoginInput): Promise<AuthTokens> {
  await delay()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    throw new ApiClientError(40001, '邮箱格式不正确', [], 400)
  }
  if (input.password === 'error') {
    // 401x 段：认证失败（具体码以后端为准，TODO 对齐）
    throw new ApiClientError(40103, '邮箱或密码错误', [], 401)
  }
  return { accessToken: 'mock.access.' + uuid(), refreshToken: 'mock.refresh.' + uuid() }
}

/** 模拟 POST /auth/register */
export async function mockRegister(input: RegisterInput): Promise<AuthTokens> {
  await delay()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    throw new ApiClientError(40001, '邮箱格式不正确', [], 400)
  }
  return { accessToken: 'mock.access.' + uuid(), refreshToken: 'mock.refresh.' + uuid() }
}

/** 模拟 POST /auth/logout（真实后端吊销 refresh；mock 仅返回成功） */
export async function mockLogout(): Promise<void> {
  await delay(150)
}

/** 模拟 GET /auth/me：当前用户 + 所属租户/角色 */
export async function mockFetchMe(): Promise<MeResponse> {
  await delay()
  return { user: structuredClone(mockMe), tenant: structuredClone(mockTenant), roles: ['tenant.admin'] }
}

// ─────────────────────────── 项目（/projects） ───────────────────────────

/** 模拟 GET /projects（分页） */
export async function mockListProjects(params: PageParams = {}): Promise<Paged<Project>> {
  await delay()
  return paginate(projects.map((p) => structuredClone(p)), params)
}

/** 模拟 POST /projects */
export async function mockCreateProject(input: CreateProjectInput): Promise<Project> {
  await delay()
  if (!input.name?.trim()) throw new ApiClientError(40001, '项目名称不能为空', [], 400)
  const project: Project = {
    id: 'project-' + uuid().slice(0, 8),
    tenantId: mockTenant.id,
    name: input.name.trim(),
    description: input.description ?? null,
    ownerId: mockMe.id, // 创建者自动成为项目负责人（规格 3.4）
    status: 'active',
    deadline: input.deadline ?? null,
    workflowId: null,
    createdBy: mockMe.id,
    createdAt: now(),
    updatedAt: now(),
  }
  projects.unshift(project)
  return structuredClone(project)
}

/** 模拟 GET /projects/:id */
export async function mockGetProject(id: string): Promise<Project> {
  await delay()
  const project = projects.find((p) => p.id === id)
  if (!project) notFound('项目')
  return structuredClone(project)
}

/** 模拟 PATCH /projects/:id */
export async function mockUpdateProject(id: string, input: UpdateProjectInput): Promise<Project> {
  await delay()
  const project = projects.find((p) => p.id === id)
  if (!project) notFound('项目')
  if (input.name !== undefined) project.name = input.name
  if (input.description !== undefined) project.description = input.description
  if (input.deadline !== undefined) project.deadline = input.deadline ?? null
  project.updatedAt = now()
  return structuredClone(project)
}

/** 模拟 POST /projects/:id/archive */
export async function mockArchiveProject(id: string): Promise<Project> {
  await delay()
  const project = projects.find((p) => p.id === id)
  if (!project) notFound('项目')
  project.status = 'archived'
  project.updatedAt = now()
  return structuredClone(project)
}

// ─────────────────────────── 任务（/tasks、/projects/:id/tasks） ───────────────────────────

/** 模拟 GET /projects/:id/tasks */
export async function mockListProjectTasks(projectId: string, params: PageParams & { status?: TaskStatus } = {}): Promise<Paged<Task>> {
  await delay()
  let list = tasks.filter((t) => t.projectId === projectId)
  if (params.status) list = list.filter((t) => t.status === params.status)
  list = [...list].sort((a, b) => a.sortOrder - b.sortOrder)
  return paginate(list.map((t) => structuredClone(t)), params)
}

/** 模拟 GET /me/today */
export async function mockGetToday(limit = 50): Promise<TodayItem[]> {
  await delay()
  return tasks
    .filter((task) => task.assigneeId === mockMe.id && task.status !== 'done' && task.status !== 'cancelled')
    .sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999'))
    .slice(0, limit)
    .map((task) => ({
      id: task.id,
      title: task.title,
      type: 'team' as const,
      status: task.status,
      priority: task.priority,
      dueAt: task.dueAt,
      projectId: task.projectId,
    }))
}

/** 模拟 POST /projects/:id/tasks */
export async function mockCreateTask(projectId: string, input: CreateTaskInput): Promise<Task> {
  await delay()
  if (!input.title?.trim()) throw new ApiClientError(40001, '任务标题不能为空', [], 400)
  if (input.title.trim().length > 200) throw new ApiClientError(40001, '标题不超过 200 字符', [], 400)
  const maxOrder = Math.max(0, ...tasks.filter((t) => t.projectId === projectId).map((t) => t.sortOrder))
  const task: Task = {
    id: 'task-' + uuid().slice(0, 8),
    tenantId: mockTenant.id,
    projectId,
    parentId: input.parentId ?? null,
    title: input.title.trim(),
    description: input.description ?? null,
    status: 'todo',
    priority: input.priority ?? 'medium',
    assigneeId: input.assigneeId ?? null,
    dueAt: input.dueAt ?? null,
    estimatedHours: input.estimatedHours ?? null,
    actualHours: null,
    completedAt: null,
    startedAt: null,
    createdBy: mockMe.id,
    tags: input.tags ?? [],
    sortOrder: maxOrder + 1,
    workflowColumnId: null,
    isAiGenerated: false,
    version: 1,
    createdAt: now(),
    updatedAt: now(),
  }
  tasks.push(task)
  return structuredClone(task)
}

/** 模拟 GET /tasks/:id */
export async function mockGetTask(id: string): Promise<Task> {
  await delay()
  const task = tasks.find((t) => t.id === id)
  if (!task) notFound('任务')
  return structuredClone(task)
}

/** 模拟 PATCH /tasks/:id（字段更新，乐观锁校验） */
export async function mockUpdateTask(id: string, input: { title?: string; description?: string | null; version: number }): Promise<Task> {
  await delay()
  const task = tasks.find((t) => t.id === id)
  if (!task) notFound('任务')
  if (input.version !== task.version) {
    throw new ApiClientError(40901, '乐观锁冲突：任务已被他人更新，请刷新重试', [], 409)
  }
  if (input.title !== undefined) task.title = input.title
  if (input.description !== undefined) task.description = input.description
  task.version += 1
  task.updatedAt = now()
  return structuredClone(task)
}

/** 模拟 POST /tasks/:id/move（状态流转：乐观锁 40901 + 非法迁移 40902 + allowed_transitions） */
export async function mockMoveTask(id: string, input: MoveTaskInput): Promise<Task> {
  await delay()
  const task = tasks.find((t) => t.id === id)
  if (!task) notFound('任务')
  if (input.version !== task.version) {
    throw new ApiClientError(40901, '乐观锁冲突：任务已被他人更新，请刷新重试', [], 409)
  }
  const to = input.status ?? task.status
  if (to !== task.status && !TASK_TRANSITIONS[task.status].includes(to)) {
    // 规格 3.3：非法迁移返 40902，details 必带 allowed_transitions（前端据此渲染可用按钮）
    throw new ApiClientError(40902, `非法状态迁移: ${task.status} → ${to}`, [{ allowed_transitions: TASK_TRANSITIONS[task.status] }], 409)
  }
  task.status = to
  if (input.sortOrder !== undefined) task.sortOrder = input.sortOrder
  task.version += 1
  task.updatedAt = now()
  return structuredClone(task)
}

/** 模拟 POST /tasks/:id/claim（T1：领取即开始，assignee 空 → 我） */
export async function mockClaimTask(id: string): Promise<Task> {
  await delay()
  const task = tasks.find((t) => t.id === id)
  if (!task) notFound('任务')
  if (task.assigneeId) {
    throw new ApiClientError(40902, '任务已有负责人，不可重复领取', [], 409)
  }
  task.assigneeId = mockMe.id
  task.status = 'in_progress'
  task.startedAt = now()
  task.version += 1
  task.updatedAt = now()
  return structuredClone(task)
}

/** 模拟 POST /tasks/:id/complete（T4/T7：actual_hours 必填，落 completed_at，★D3 采集点） */
export async function mockCompleteTask(id: string, input: { summary?: string; actualHours?: number }): Promise<Task> {
  await delay()
  const task = tasks.find((t) => t.id === id)
  if (!task) notFound('任务')
  if (!['in_progress', 'blocked'].includes(task.status)) {
    throw new ApiClientError(40902, `非法状态迁移: ${task.status} → done`, [{ allowed_transitions: TASK_TRANSITIONS[task.status] }], 409)
  }
  if (input.actualHours === undefined || input.actualHours < 0) {
    throw new ApiClientError(40001, '实际工时必填且 ≥0', [], 400)
  }
  task.status = 'done'
  task.actualHours = input.actualHours
  task.completedAt = now()
  task.version += 1
  task.updatedAt = now()
  return structuredClone(task)
}

/** 模拟 POST /tasks/:id/reopen（T9：completed_at 置空、actual_hours 保留、原因必填） */
export async function mockReopenTask(id: string, input: { reason: string }): Promise<Task> {
  await delay()
  const task = tasks.find((t) => t.id === id)
  if (!task) notFound('任务')
  if (task.status !== 'done') {
    throw new ApiClientError(40902, `非法状态迁移: ${task.status} → todo`, [{ allowed_transitions: TASK_TRANSITIONS[task.status] }], 409)
  }
  if (!input.reason || input.reason.trim().length < 4) {
    throw new ApiClientError(40001, '重开原因必填且不少于 4 字符', [], 400)
  }
  task.status = 'todo'
  task.completedAt = null
  task.version += 1
  task.updatedAt = now()
  return structuredClone(task)
}

// ─────────────────────────── 评论（/tasks/:id/comments） ───────────────────────────

/** 模拟 GET /tasks/:id/comments（按创建时间升序） */
export async function mockListComments(taskId: string): Promise<Paged<TaskComment>> {
  await delay()
  const list = comments.filter((c) => c.taskId === taskId).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return paginate(list.map((c) => structuredClone(c)))
}

/** 模拟 POST /tasks/:id/comments */
export async function mockCreateComment(taskId: string, input: CreateCommentInput): Promise<TaskComment> {
  await delay()
  if (!input.content?.trim()) throw new ApiClientError(40001, '评论内容不能为空', [], 400)
  if (input.content.length > 5000) throw new ApiClientError(40001, '评论不超过 5000 字符', [], 400)
  const comment: TaskComment = {
    id: 'comment-' + uuid().slice(0, 8),
    tenantId: mockTenant.id,
    taskId,
    authorId: mockMe.id,
    parentId: input.parentId ?? null,
    content: input.content.trim(),
    mentions: [], // TODO(Phase 2): @提及解析结果
    isDecision: false,
    createdAt: now(),
    updatedAt: now(),
  }
  comments.push(comment)
  return structuredClone(comment)
}

// ─────────────────────────── 附件（/attachments） ───────────────────────────

/** 模拟 POST /attachments（multipart：file + resource_type/resource_id；返回与后端一致的元数据字段） */
export async function mockUploadAttachment(
  file: File,
  resourceType: AttachmentResourceType,
  resourceId: string,
): Promise<Attachment> {
  await delay()
  if (!file.name) throw new ApiClientError(40001, '文件名不能为空', [], 400)
  const id = 'att-' + uuid().slice(0, 8)
  const attachment: Attachment = {
    id,
    resourceType,
    resourceId,
    objectKey: `mock/${id}-${file.name}`,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    createdAt: now(),
  }
  attachments.push(attachment)
  return structuredClone(attachment)
}

/** 模拟 GET /attachments/:id（嵌套 {attachment, downloadUrl, expiresAt}；mock 下载地址直接指向对象存储 key） */
export async function mockGetAttachment(id: string): Promise<AttachmentDownload> {
  await delay()
  const attachment = attachments.find((a) => a.id === id)
  if (!attachment) notFound('附件')
  return {
    attachment: {
      id: attachment.id,
      resourceType: attachment.resourceType,
      resourceId: attachment.resourceId,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      createdAt: attachment.createdAt,
    },
    downloadUrl: `https://mock-storage.example.com/${attachment.objectKey}`,
    expiresAt: new Date(Date.now() + 300_000).toISOString(), // 5 分钟时效（与后端 300s 一致）
  }
}

// ─────────────────────────── 全局搜索（/search） ───────────────────────────

/** 命中片段：关键词前后各 30 字符 + 省略号（与后端 SearchService.snippet 同语义） */
function snippetAround(text: string, idx: number, len: number): string {
  const start = Math.max(0, idx - 30)
  const end = Math.min(text.length, idx + len + 30)
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}

/** 模拟 GET /search?q=&type=：扁平 SearchHit[] 数组，按 type 分组由前端渲染 */
export async function mockSearch(q: string, type: SearchType): Promise<SearchHit[]> {
  await delay()
  const keyword = q.trim().toLowerCase()
  if (!keyword) return []
  const hits: SearchHit[] = []

  if (type === 'all' || type === 'task') {
    for (const t of tasks) {
      const text = [t.title, t.description ?? '', t.tags.join(' ')].join(' ')
      const idx = text.toLowerCase().indexOf(keyword)
      if (idx >= 0) {
        hits.push({
          type: 'task',
          id: t.id,
          title: t.title,
          snippet: snippetAround(text, idx, keyword.length),
          projectId: t.projectId,
          taskId: t.id,
          createdAt: t.createdAt,
        })
      }
    }
  }

  if (type === 'all' || type === 'project') {
    for (const p of projects) {
      const text = [p.name, p.description ?? ''].join(' ')
      const idx = text.toLowerCase().indexOf(keyword)
      if (idx >= 0) {
        hits.push({
          type: 'project',
          id: p.id,
          title: p.name,
          snippet: snippetAround(text, idx, keyword.length),
          projectId: p.id,
          taskId: null,
          createdAt: p.createdAt,
        })
      }
    }
  }

  if (type === 'all' || type === 'comment') {
    for (const c of comments) {
      const idx = c.content.toLowerCase().indexOf(keyword)
      if (idx >= 0) {
        const task = tasks.find((t) => t.id === c.taskId)
        hits.push({
          type: 'comment',
          id: c.id,
          title: task?.title ?? '(任务已删除)',
          snippet: snippetAround(c.content, idx, keyword.length),
          projectId: task?.projectId ?? null,
          taskId: c.taskId,
          createdAt: c.createdAt,
        })
      }
    }
  }

  return hits
}

// ─────────────────────────── 导入导出（/import/tasks、/export/tasks） ───────────────────────────

/** CSV 值转义：含逗号/引号/换行的值加引号包裹（Excel 兼容） */
function escapeCsv(value: string): string {
  if (/[",\r\n]/.test(value)) return '"' + value.replace(/"/g, '""') + '"'
  return value
}

/** 模拟 POST /import/tasks?project_id=：projectId 必填（query 参数）；返回 {imported, failed, errors, created}（line=物理行号） */
export async function mockImportTasksCsv(file: File, projectId: string): Promise<ImportResult> {
  await delay(600)
  if (!file.name.toLowerCase().endsWith('.csv')) {
    throw new ApiClientError(40001, '仅支持 .csv 文件', [], 400)
  }
  const text = await file.text()
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) throw new ApiClientError(40001, 'CSV 内容为空', [], 400)
  const errors: ImportErrorRow[] = []
  const created: ImportedTask[] = []
  const targetProjectId = projectId
  lines.slice(1).forEach((line, index) => {
    const physicalLine = index + 2 // 表头=第 1 行，首数据行=第 2 行（与后端物理行号一致）
    const cols = line.split(',').map((c) => c.trim())
    const title = cols[0]
    if (!title) {
      errors.push({ line: physicalLine, reason: '任务标题为空' })
      return
    }
    if (title.length > 200) {
      errors.push({ line: physicalLine, reason: '标题超过 200 字符' })
      return
    }
    const VALID_PRIORITIES: TaskPriority[] = ['urgent', 'high', 'medium', 'low']
    const priority: TaskPriority = VALID_PRIORITIES.includes(cols[2] as TaskPriority) ? (cols[2] as TaskPriority) : 'medium'
    const maxOrder = Math.max(0, ...tasks.filter((t) => t.projectId === targetProjectId).map((t) => t.sortOrder))
    const newTask: Task = {
      id: 'task-' + uuid().slice(0, 8),
      tenantId: mockTenant.id,
      projectId: targetProjectId,
      parentId: null,
      title,
      description: cols[1] || null,
      status: 'todo',
      priority,
      assigneeId: null,
      dueAt: cols[3] || null,
      estimatedHours: cols[4] ? Number(cols[4]) : null,
      actualHours: null,
      completedAt: null,
      startedAt: null,
      createdBy: mockMe.id,
      tags: cols[5] ? cols[5].split(';').map((s) => s.trim()).filter(Boolean) : [],
      sortOrder: maxOrder + created.length + 1,
      workflowColumnId: null,
      isAiGenerated: false,
      version: 1,
      createdAt: now(),
      updatedAt: now(),
    }
    tasks.push(newTask)
    created.push({ id: newTask.id, title: newTask.title })
  })
  return { imported: created.length, failed: errors.length, errors, created }
}

/** 模拟 GET /export/tasks?project_id=：内存任务生成 CSV（BOM 头保证 Excel 中文不乱码） */
export async function mockExportTasksCsv(projectId?: string): Promise<Blob> {
  await delay()
  const list = tasks.filter((t) => (projectId ? t.projectId === projectId : true))
  const header = 'title,status,priority,due_at,estimated_hours,actual_hours,assignee_id'
  const rows = list.map((t) =>
    [
      t.title,
      t.status,
      t.priority,
      t.dueAt ?? '',
      t.estimatedHours ?? '',
      t.actualHours ?? '',
      t.assigneeId ?? '',
    ]
      .map((v) => escapeCsv(String(v)))
      .join(','),
  )
  const csv = '\ufeff' + [header, ...rows].join('\n')
  return new Blob([csv], { type: 'text/csv;charset=utf-8' })
}

// ─────────────────────────── 个人周期总结（/me/summaries） ───────────────────────────

/** 按周期统计当前用户任务（★D3：actual_hours/completed_at 聚合）并生成 PeriodSummary 结构 */
function buildPeriodSummary(period: SummaryPeriod): PeriodSummary {
  const now = new Date()
  let start: Date
  let end: Date
  if (period === 'day') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  } else if (period === 'week') {
    end = now
    start = new Date(now.getTime() - 7 * 86_400_000)
  } else if (period === 'month') {
    end = now
    start = new Date(now.getTime() - 30 * 86_400_000)
  } else {
    // year
    start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0)
    end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
  }
  const window = { start: start.toISOString(), end: end.toISOString() }

  const periodDone = tasks.filter(
    (t) =>
      t.assigneeId === mockMe.id &&
      t.status === 'done' &&
      t.completedAt !== null &&
      new Date(t.completedAt) >= start &&
      new Date(t.completedAt) <= end,
  )

  const items: SummaryTaskItem[] = periodDone.map((t) => ({
    id: t.id,
    type: 'team' as const,
    title: t.title,
    dueAt: t.dueAt,
    completedAt: t.completedAt!,
    actualHours: t.actualHours,
    projectId: t.projectId,
    projectName: projects.find((p) => p.id === t.projectId)?.name ?? null,
    overdue: !!t.dueAt && new Date(t.completedAt!) > new Date(t.dueAt),
  })).sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())

  const withDue = items.filter((i) => i.dueAt !== null)
  const onTime = withDue.filter((i) => !i.overdue)
  const stats = {
    completedCount: items.length,
    onTimeCount: onTime.length,
    overdueCount: withDue.length - onTime.length,
    actualHoursTotal: Math.round(items.reduce((sum, i) => sum + (i.actualHours ?? 0), 0) * 10) / 10,
    onTimeRate: withDue.length > 0 ? Math.round((onTime.length / withDue.length) * 1000) / 10 : null,
  }

  return {
    period,
    window,
    stats,
    overdueTasks: items.filter((i) => i.overdue),
    completedTasks: items,
    draft: summaryDrafts.get(period) ?? null,
  }
}

/** 模拟 GET /me/summaries?period=：后端恒返回聚合数据（draft 无记录时为 null） */
export async function mockGetSummary(period: SummaryPeriod): Promise<PeriodSummary> {
  await delay()
  return buildPeriodSummary(period)
}

/** 模拟 POST /me/summaries（body {period, content}；同周期覆盖写草稿） */
export async function mockSaveSummary(input: SaveSummaryInput): Promise<SaveSummaryResult> {
  await delay()
  if (!input.content.trim()) throw new ApiClientError(40001, '总结内容不能为空', [], 400)
  if (input.content.length > 20000) throw new ApiClientError(40001, '总结不超过 20000 字符', [], 400)
  const draft: SaveSummaryResult = {
    id: 'summary-' + uuid().slice(0, 8),
    period: input.period,
    content: input.content,
    updatedAt: now(),
  }
  summaryDrafts.set(input.period, draft)
  return structuredClone(draft)
}

// ─────────────────────────── 计划/报表（B15/B16） ───────────────────────────

/** mock 依赖数据（内存态，页面刷新重置） */
const mockDependencies: TaskDependency[] = []

/** 模拟 GET /reports/projects/:projectId/gantt */
export async function mockGetGantt(projectId: string): Promise<GanttData> {
  await delay()
  const projectTasks = tasks.filter(t => t.projectId === projectId && !['done', 'cancelled'].includes(t.status))
  const windowStart = new Date(Date.now() - 3 * 86400000)
  const windowEnd = new Date(Date.now() + 14 * 86400000)

  const rows: GanttRow[] = projectTasks.map((task, i) => {
    const start = new Date(windowStart.getTime() + i * 2 * 86400000)
    const hours = task.estimatedHours ?? 8
    const durationDays = Math.max(1, Math.ceil((hours as number) / 8))
    const end = new Date(start.getTime() + durationDays * 86400000)
    return {
      taskId: task.id,
      title: task.title,
      status: task.status,
      assigneeId: task.assigneeId,
      start: start.toISOString(),
      end: end.toISOString(),
      progress: task.status === 'done' ? 100 : task.status === 'in_progress' ? 50 : 0,
      critical: i % 3 === 0, // mock 关键路径
      milestone: task.estimatedHours === 0,
      dependencies: [],
    }
  })

  return {
    projectId,
    window: {
      start: windowStart.toISOString(),
      end: windowEnd.toISOString(),
    },
    rows,
  }
}

/** 模拟 GET /reports/projects/:projectId/plan（CPM 计算） */
export async function mockGetPlan(projectId: string): Promise<PlanResult> {
  await delay()
  const projectTasks = tasks.filter(t => t.projectId === projectId)
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const cpmTasks = projectTasks.map((task, i) => {
    const es = new Date(today.getTime() + i * 2 * 86400000)
    const hours = task.estimatedHours ?? 8
    const durationDays = Math.max(1, Math.ceil((hours as number) / 8))
    const ef = new Date(es.getTime() + durationDays * 86400000)
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      durationDays,
      es: es.toISOString(),
      ef: ef.toISOString(),
      ls: es.toISOString(),
      lf: ef.toISOString(),
      slackDays: 0,
      critical: i < 3,
      milestone: task.estimatedHours === 0,
      eta: ef.toISOString(),
      dueAt: task.dueAt,
    }
  })

  const projectEta = cpmTasks.length > 0
    ? cpmTasks.reduce((max, t) => t.ef > max ? t.ef : max, cpmTasks[0].ef)
    : today.toISOString()

  return {
    projectId,
    calculatedAt: now(),
    tasks: cpmTasks,
    criticalPath: cpmTasks.filter(t => t.critical).map(t => t.id),
    projectEta,
    projectSlackDays: 0,
    milestones: cpmTasks.filter(t => t.milestone).map(t => t.id),
    assumptions: ['工期=estimated_hours/8 天，无估时默认 1 天；起点=今天 00:00 UTC；周末顺延'],
  }
}

/** 模拟 GET /reports/projects/:projectId/burndown?days=N */
export async function mockGetBurndown(projectId: string, days = 14): Promise<BurndownData> {
  await delay()
  const projectTasks = tasks.filter(t => t.projectId === projectId)
  const totalActive = projectTasks.filter(t => !['done', 'cancelled'].includes(t.status)).length
  const now = new Date()
  const startDate = new Date(now)
  startDate.setUTCDate(startDate.getUTCDate() - days + 1)
  startDate.setUTCHours(0, 0, 0, 0)

  const points = Array.from({ length: days }, (_, i) => {
    const date = new Date(startDate)
    date.setUTCDate(date.getUTCDate() + i)
    const progress = i / (days - 1)
    return {
      date: date.toISOString().slice(0, 10),
      remaining: Math.max(0, Math.round(totalActive * (1 - progress) + (Math.random() - 0.5) * 2)),
      completed: Math.round(totalActive * progress),
      baseline: totalActive,
    }
  })

  return {
    projectId,
    days,
    points,
  }
}

/** 模拟 GET /reports/load?projectId=&days=N */
export async function mockGetLoad(_projectId?: string, days = 14): Promise<LoadData> {
  await delay()
  const now = new Date()
  const startDate = new Date(now)
  startDate.setUTCDate(startDate.getUTCDate() - days + 1)
  startDate.setUTCHours(0, 0, 0, 0)

  const members = ['user-001', 'user-002', 'user-003']
  const memberNames: Record<string, string> = {
    'user-001': '张伟',
    'user-002': '李娜',
    'user-003': '王强',
  }

  const memberLoads = members.map(userId => {
    const loads = Array.from({ length: days }, (_, i) => {
      const date = new Date(startDate)
      date.setUTCDate(date.getUTCDate() + i)
      // mock: 随机 0-3 个任务，0-16 小时
      const taskCount = Math.floor(Math.random() * 4)
      const hours = Math.round(taskCount * (2 + Math.random() * 4) * 10) / 10
      return {
        date: date.toISOString().slice(0, 10),
        taskCount,
        hours,
      }
    })
    return {
      userId,
      displayName: memberNames[userId] ?? userId.slice(0, 8),
      loads,
    }
  })

  return {
    days,
    start: startDate.toISOString().slice(0, 10),
    members: memberLoads,
  }
}

/** 模拟 GET /reports/projects/:projectId/dependencies */
export async function mockListDependencies(projectId: string): Promise<TaskDependency[]> {
  await delay()
  return mockDependencies.filter(d => d.projectId === projectId)
}

/** 模拟 POST /reports/projects/:projectId/dependencies */
export async function mockCreateDependency(projectId: string, input: CreateDependencyInput): Promise<TaskDependency> {
  await delay()
  if (input.prevTaskId === input.nextTaskId) {
    throw new ApiClientError(40001, '前置任务与后置任务不能相同', [], 400)
  }
  const dep: TaskDependency = {
    id: 'dep-' + uuid().slice(0, 8),
    projectId,
    prevTaskId: input.prevTaskId,
    nextTaskId: input.nextTaskId,
    type: input.type ?? 'FS',
    lagDays: input.lagDays ?? 0,
    isShared: input.isShared ?? false,
    createdAt: now(),
  }
  mockDependencies.push(dep)
  return structuredClone(dep)
}

/** 模拟 DELETE /reports/dependencies/:id */
export async function mockDeleteDependency(id: string): Promise<{ id: string; deleted: boolean }> {
  await delay()
  const idx = mockDependencies.findIndex(d => d.id === id)
  if (idx < 0) throw new ApiClientError(40401, '依赖不存在', [], 404)
  mockDependencies.splice(idx, 1)
  return { id, deleted: true }
}

// ─────────────────────────── 智能评估（B17） ───────────────────────────

/** 项目成员花名册（模拟 user_role scope=project；与种子数据 assignee 保持一致） */
const EVAL_ROSTER: Record<string, string[]> = {
  'project-001': ['user-001', 'user-002', 'user-003'],
  'project-002': ['user-001', 'user-002'],
}

/** 全部候选成员（花名册并集），用于未归属项目的父级/普通任务兜底候选池 */
const ALL_EVAL_MEMBERS: string[] = Array.from(new Set(Object.values(EVAL_ROSTER).flat()))

/**
 * 读取工作台 localStorage 任务（与 @/hooks/useWorkspaceTasks 共享 key='tasks'），
 * 作为推荐任务回退来源：管理员选中的工作台任务可能不在内存态种子 tasks 中。
 */
function readStoredWorkspaceTasks(): Task[] {
  try {
    // useLocalStorageState 前缀为 os_ws_v1_；key='tasks' 对应实际 localStorage key
    const raw = localStorage.getItem('os_ws_v1_tasks')
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? (arr as Task[]) : []
  } catch {
    return []
  }
}

const EVAL_DISPLAY_NAMES: Record<string, string> = {
  'user-001': '张伟',
  'user-002': '李娜',
  'user-003': '王强',
}

/** 成员画像内存态（冷启动自评数据，页面刷新重置） */
const evalProfiles = new Map<
  string,
  { skillTags: string[]; complexityTier: ComplexityTier | null; selfAssessed: boolean }
>([
  ['user-001', { skillTags: ['前端', '基建', '测试'], complexityTier: 'high', selfAssessed: true }],
  ['user-002', { skillTags: ['设计', '原型', '调研'], complexityTier: 'medium', selfAssessed: true }],
  // 自评未完成成员：复杂度档位缺失 → 推荐时给 0.6 中性分（演示 未设置 分支）
  ['user-003', { skillTags: ['前端', '架构', '接入'], complexityTier: 'high', selfAssessed: false }],
])

const ACTIVE_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'blocked']

/** 保留 2 位小数（与契约 score 精度一致） */
const round2 = (n: number) => Math.round(n * 100) / 100
const pct = (n: number) => Math.round(n * 100)

/** 复杂度档位推导（v1 规则）：<4h low；<16h medium；≥16h high；无估时 medium */
function deriveTaskComplexity(task: Task): ComplexityTier {
  const h = task.estimatedHours
  if (h === null) return 'medium'
  if (h < 4) return 'low'
  if (h < 16) return 'medium'
  return 'high'
}

/** Jaccard 相似度：交集 / 并集（技能匹配因子） */
function jaccard(a: string[], b: string[]): number {
  const setB = new Set(b)
  const inter = a.filter(x => setB.has(x)).length
  const union = new Set([...a, ...b]).size
  return union === 0 ? 0 : inter / union
}

/** 成员历史绩效聚合（完成率/准时率/负载；由 tasks 计算，不落表） */
function computeMemberStats(userId: string): MemberProfileStats {
  const mine = tasks.filter(t => t.assigneeId === userId)
  const done = mine.filter(t => t.status === 'done')
  const denominator = mine.filter(t => t.status !== 'cancelled').length // done + cancelled 之外的已认领
  const completionRate = denominator > 0 ? round2(done.length / denominator) : 0
  const withDue = done.filter(t => t.dueAt !== null)
  const onTime = withDue.filter(t => t.completedAt !== null && t.completedAt! <= t.dueAt!)
  const onTimeRate = withDue.length > 0 ? round2(onTime.length / withDue.length) : 0
  const activeLoad = mine.filter(t => ACTIVE_STATUSES.includes(t.status)).length
  return { completedCount: done.length, completionRate, onTimeRate, activeLoad }
}

/** 模拟 GET /evaluations/me/profile */
export async function mockGetMyProfile(): Promise<MemberProfile> {
  await delay()
  const p = evalProfiles.get(mockMe.id)!
  return { userId: mockMe.id, ...p, stats: computeMemberStats(mockMe.id) }
}

/** 模拟 PUT /evaluations/me/profile（upsert，字段可选） */
export async function mockUpdateMyProfile(input: UpdateProfileInput): Promise<MemberProfile> {
  await delay()
  const current = evalProfiles.get(mockMe.id)!
  evalProfiles.set(mockMe.id, {
    skillTags: input.skillTags ?? current.skillTags,
    complexityTier: input.complexityTier !== undefined ? input.complexityTier : current.complexityTier,
    selfAssessed: input.selfAssessed ?? current.selfAssessed,
  })
  const p = evalProfiles.get(mockMe.id)!
  return { userId: mockMe.id, ...p, stats: computeMemberStats(mockMe.id) }
}

/** 模拟 GET /evaluations/projects/:projectId/members/stats?days=N（hours 聚合取窗口内完成的任务） */
export async function mockGetMembersStats(projectId: string, days = 30): Promise<MembersStatsResult> {
  await delay()
  const windowStart = new Date(Date.now() - days * 86_400_000).toISOString()
  const members: MemberStat[] = (EVAL_ROSTER[projectId] ?? []).map(userId => {
    const stats = computeMemberStats(userId)
    const windowDone = tasks.filter(
      t => t.assigneeId === userId && t.status === 'done' && t.completedAt !== null && t.completedAt >= windowStart,
    )
    const totalActualHours = round2(windowDone.reduce((s, t) => s + (t.actualHours ?? 0), 0))
    const totalEstimatedHours = round2(windowDone.reduce((s, t) => s + (t.estimatedHours ?? 0), 0))
    return {
      userId,
      displayName: EVAL_DISPLAY_NAMES[userId] ?? userId,
      ...stats,
      totalActualHours,
      totalEstimatedHours,
      avgActualHoursPerTask: windowDone.length > 0 ? round2(totalActualHours / windowDone.length) : 0,
    }
  })
  return { projectId, days, members }
}

const TIER_RANK: Record<ComplexityTier, number> = { low: 0, medium: 1, high: 2 }

/** 复杂度适配分：匹配 1.0 / 相邻 0.7 / 差两档 0.4 / 未设置 0.6 */
function complexityScore(memberTier: ComplexityTier | null, taskTier: ComplexityTier): number {
  if (!memberTier) return 0.6
  const diff = Math.abs(TIER_RANK[memberTier] - TIER_RANK[taskTier])
  if (diff === 0) return 1
  return diff === 1 ? 0.7 : 0.4
}

/** 基于结构化得分事实生成 reason（所有数字来自上面计算，禁止编造） */
function buildReason(args: {
  stats: MemberProfileStats
  skill: number
  history: number
  load: number
  complexity: number
  taskTags: string[]
  skillTags: string[]
  taskTier: ComplexityTier
  memberTier: ComplexityTier | null
}): string {
  const { stats, skill, history, load, complexity, taskTags, skillTags, taskTier, memberTier } = args
  const parts: string[] = []
  if (taskTags.length === 0) {
    parts.push(`技能匹配 ${skill.toFixed(2)}（任务无标签，中性分）`)
  } else {
    const inter = taskTags.filter(t => skillTags.includes(t)).length
    const union = new Set([...taskTags, ...skillTags]).size
    parts.push(`技能匹配 ${skill.toFixed(2)}（标签重叠 ${inter}/${union}）`)
  }
  if (stats.completedCount === 0) {
    parts.push(`历史绩效 ${history.toFixed(2)}（冷启动中性分）`)
  } else {
    parts.push(`历史绩效 ${history.toFixed(2)}（完成率 ${pct(stats.completionRate)}%/准时率 ${pct(stats.onTimeRate)}%）`)
  }
  parts.push(`负载 ${load.toFixed(2)}（活跃 ${stats.activeLoad} 项）`)
  if (!memberTier) {
    parts.push('复杂度适配 0.60（未设置档位，中性分）')
  } else if (memberTier === taskTier) {
    parts.push('复杂度适配 1.00（档位匹配）')
  } else if (Math.abs(TIER_RANK[memberTier] - TIER_RANK[taskTier]) === 1) {
    parts.push(`复杂度适配 ${complexity.toFixed(2)}（${memberTier} vs ${taskTier}，相邻档）`)
  } else {
    parts.push(`复杂度适配 ${complexity.toFixed(2)}（${memberTier} vs ${taskTier}，差两档）`)
  }
  return parts.join('、')
}

/** 模拟 POST /evaluations/tasks/:taskId/recommend（多因子加权规则引擎，无 LLM；只建议不指派） */
export async function mockGetTaskRecommendation(taskId: string): Promise<RecommendationResult> {
  await delay()
  let task = tasks.find(t => t.id === taskId)
  if (!task) {
    const stored = readStoredWorkspaceTasks().find(t => t.id === taskId)
    if (stored) task = stored as Task
  }
  if (!task) notFound('任务')
  const taskTags = task.tags ?? []
  const taskTier = deriveTaskComplexity(task)
  // 项目有花名册则用项目花名册，否则兜底全部成员（父级/普通任务也能出候选人）
  const rosterForTask = EVAL_ROSTER[task.projectId ?? ''] ?? []
  const members = rosterForTask.length > 0 ? rosterForTask : ALL_EVAL_MEMBERS

  const candidates: CandidateScore[] = members
    .filter(userId => userId !== task.assigneeId) // 排除当前 assignee
    .map(userId => {
      const stats = computeMemberStats(userId)
      const profile = evalProfiles.get(userId)
      const skillTags = profile?.skillTags ?? []
      const skill = taskTags.length === 0 ? 0.6 : round2(jaccard(taskTags, skillTags))
      const history = stats.completedCount === 0 ? 0.5 : round2(0.5 * stats.completionRate + 0.5 * stats.onTimeRate)
      const load = round2(1 - Math.min(stats.activeLoad / 5, 1)) // 1 - min(活跃数/5, 1)
      const complexity = complexityScore(profile?.complexityTier ?? null, taskTier)
      const score = round2(0.4 * skill + 0.3 * history + 0.2 * load + 0.1 * complexity)
      return {
        userId,
        displayName: EVAL_DISPLAY_NAMES[userId] ?? userId,
        score,
        scoreBreakdown: { skill, history, load, complexity },
        reason: buildReason({
          stats,
          skill,
          history,
          load,
          complexity,
          taskTags,
          skillTags,
          taskTier,
          memberTier: profile?.complexityTier ?? null,
        }),
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3) // Top-3

  // 冷启动：所有候选 completedCount === 0（提示「自评画像模式」）
  // 冷启动示例：project-002 的 task-011（负责人 user-002）→ 候选仅 user-001（无历史完成记录）
  const coldStart = candidates.length > 0 && candidates.every(c => computeMemberStats(c.userId).completedCount === 0)
  return {
    taskId: task.id,
    taskTitle: task.title,
    taskTags,
    taskComplexity: taskTier,
    candidates,
    coldStart,
    generatedAt: now(),
  }
}

/** 模拟 GET /evaluations/me/stats?days=N（entries 按天聚合 time_entries；mock 用确定性分布自洽演示） */
export async function mockGetMyStats(days = 30): Promise<MyStatsResult> {
  await delay()
  const stats = computeMemberStats(mockMe.id)
  const windowStart = Date.now() - days * 86_400_000
  // time_entries 语义：窗口内进行中/已完成任务的已累计工时（actualHours 随计时器累加）
  const inWindow = tasks.filter(t => {
    if (t.assigneeId !== mockMe.id || t.actualHours === null) return false
    const at = t.completedAt ?? t.startedAt ?? t.createdAt
    return at !== null && new Date(at).getTime() >= windowStart
  })
  const totalActualHours = round2(inWindow.reduce((s, t) => s + (t.actualHours ?? 0), 0))
  const totalEstimatedHours = round2(inWindow.reduce((s, t) => s + (t.estimatedHours ?? 0), 0))

  // 按天分布：确定性权重（7 天周期，总和=totalActualHours，末位吸收舍入误差；刷新结果稳定）
  const start = new Date(windowStart)
  start.setUTCHours(0, 0, 0, 0)
  const weights = Array.from({ length: days }, (_, i) => (i % 7) + 1)
  const sumW = weights.reduce((s, w) => s + w, 0)
  let acc = 0
  const entries = weights.map((w, i) => {
    const date = new Date(start)
    date.setUTCDate(date.getUTCDate() + i)
    const hours = round2((totalActualHours * w) / sumW)
    acc += hours
    return { date: date.toISOString().slice(0, 10), hours }
  })
  if (entries.length > 0) {
    entries[entries.length - 1].hours = round2(entries[entries.length - 1].hours + totalActualHours - acc)
  }

  return {
    userId: mockMe.id,
    days,
    totalActualHours,
    totalEstimatedHours,
    completedCount: stats.completedCount,
    completionRate: stats.completionRate,
    onTimeRate: stats.onTimeRate,
    activeLoad: stats.activeLoad,
    entries,
  }
}

// ========== B18 周报 + 仪表盘 mock ==========

export function mockGetWeeklyReport(projectId: string, weekStart?: string): any {
  return {
    projectId,
    weekStart: weekStart ?? '2026-08-18',
    weekEnd: '2026-08-25',
    summary: {
      totalTasks: 42,
      completedTasks: 12,
      cancelledTasks: 2,
      newTasks: 5,
      overdueTasks: 3,
      totalActualHours: 86,
      totalEstimatedHours: 120,
      completionRate: 0.706,
      onTimeRate: 0.833,
    },
    memberBreakdown: [
      { userId: 'u1', displayName: '张三', completedCount: 5, actualHours: 32, estimatedHours: 36 },
      { userId: 'u2', displayName: '李四', completedCount: 4, actualHours: 28, estimatedHours: 32 },
      { userId: 'u3', displayName: '王五', completedCount: 2, actualHours: 18, estimatedHours: 24 },
      { userId: 'u4', displayName: '赵六', completedCount: 1, actualHours: 8, estimatedHours: 16 },
    ],
    highlights: [
      '本周完成 12 项任务',
      '准时率 83%',
      '新增 5 项任务',
      '累计工时 86 小时',
    ],
    risks: ['3 项任务已逾期', '下周未完成任务估时合计较高（94.5 小时，28 项）'],
    generatedAt: new Date().toISOString(),
    isTemplate: true,
  }
}

export function mockListWeeklyReports(projectId: string, limit = 10): any {
  const reports = []
  const base = new Date('2026-08-18T00:00:00.000Z')
  for (let i = 0; i < Math.min(limit, 4); i++) {
    const d = new Date(base)
    d.setUTCDate(d.getUTCDate() - i * 7)
    reports.push({
      weekStart: d.toISOString().slice(0, 10),
      summary: {
        completedTasks: 12 - i * 2,
        newTasks: 5 - i,
        overdueTasks: 3 + i,
      },
      generatedAt: new Date().toISOString(),
    })
  }
  return { projectId, reports }
}

export function mockGetDashboard(projectId: string): any {
  return {
    projectId,
    stats: {
      totalTasks: 56,
      activeTasks: 28,
      completedThisWeek: 12,
      overdueTasks: 3,
      totalMembers: 6,
      totalActualHoursThisWeek: 86,
    },
    trends: {
      completionTrend: [
        { week: '2026-07-28', completedCount: 8 },
        { week: '2026-08-04', completedCount: 10 },
        { week: '2026-08-11', completedCount: 9 },
        { week: '2026-08-18', completedCount: 12 },
      ],
      hoursTrend: [
        { week: '2026-07-28', hours: 65 },
        { week: '2026-08-04', hours: 78 },
        { week: '2026-08-11', hours: 72 },
        { week: '2026-08-18', hours: 86 },
      ],
    },
    statusDistribution: {
      todo: 15,
      in_progress: 10,
      blocked: 3,
      done: 25,
      cancelled: 3,
    },
    topMembers: [
      { userId: 'u1', displayName: '张三', completedCount: 5, actualHours: 32 },
      { userId: 'u2', displayName: '李四', completedCount: 4, actualHours: 28 },
      { userId: 'u3', displayName: '王五', completedCount: 2, actualHours: 18 },
      { userId: 'u4', displayName: '赵六', completedCount: 1, actualHours: 8 },
      { userId: 'u5', displayName: '钱七', completedCount: 0, actualHours: 0 },
    ],
  }
}

// ========== B19 重叠检测 mock ==========

export function mockGetOverlap(projectId: string, _options?: any): any {
  return {
    projectId,
    generatedAt: new Date().toISOString(),
    summary: {
      timeConflicts: 2,
      resourceConflicts: 3,
      dependencyHubs: 2,
      totalAffectedTasks: 12,
      severity: 'medium',
    },
    dimensions: {
      time: [
        {
          assigneeId: 'u1',
          assigneeName: '张三',
          taskIds: ['t1', 't2'],
          taskTitles: ['用户登录模块', '权限系统设计'],
          overlapStart: '2026-08-19',
          overlapEnd: '2026-08-22',
          overlapDays: 4,
          severity: 'high',
        },
        {
          assigneeId: 'u2',
          assigneeName: '李四',
          taskIds: ['t3', 't4', 't5'],
          taskTitles: ['首页改版', '详情页优化', '列表页重构'],
          overlapStart: '2026-08-20',
          overlapEnd: '2026-08-21',
          overlapDays: 2,
          severity: 'medium',
        },
      ],
      resource: [
        { assigneeId: 'u1', assigneeName: '张三', date: '2026-08-19', totalHours: 12, threshold: 8, taskCount: 2, taskIds: ['t1', 't2'], severity: 'medium' },
        { assigneeId: 'u1', assigneeName: '张三', date: '2026-08-20', totalHours: 15, threshold: 8, taskCount: 2, taskIds: ['t1', 't2'], severity: 'high' },
        { assigneeId: 'u2', assigneeName: '李四', date: '2026-08-20', totalHours: 10, threshold: 8, taskCount: 3, taskIds: ['t3', 't4', 't5'], severity: 'low' },
      ],
      dependency: [
        {
          hubTaskId: 't0',
          hubTaskTitle: '需求评审与技术方案',
          downstreamCount: 4,
          downstreamTasks: [
            { id: 't1', title: '用户登录模块' },
            { id: 't2', title: '权限系统设计' },
            { id: 't3', title: '首页改版' },
            { id: 't6', title: 'API 接口规范' },
          ],
          isOnCriticalPath: true,
          benefitScore: 56,
        },
        {
          hubTaskId: 't6',
          hubTaskTitle: 'API 接口规范',
          downstreamCount: 3,
          downstreamTasks: [
            { id: 't7', title: '前端对接' },
            { id: 't8', title: '后端开发' },
            { id: 't9', title: '联调测试' },
          ],
          isOnCriticalPath: false,
          benefitScore: 32,
        },
      ],
    },
  }
}

// ========== B19 模板库 mock ==========

const MOCK_TEMPLATES = [
  {
    id: 'tpl-001',
    name: '网站开发标准流程',
    description: '从需求到上线的完整 Web 项目模板，含 12 个标准任务与依赖关系',
    type: 'project',
    category: '软件开发',
    isPublic: true,
    taskCount: 12,
    tags: ['网站', '前端', '后端', '全栈'],
    ownerId: 'u0',
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 'tpl-002',
    name: '产品迭代 Sprint',
    description: '双周迭代标准模板，含需求评审、开发、测试、发布全流程',
    type: 'project',
    category: '产品迭代',
    isPublic: true,
    taskCount: 8,
    tags: ['Sprint', '敏捷', '迭代'],
    ownerId: 'u0',
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  },
  {
    id: 'tpl-003',
    name: '市场活动筹备',
    description: '线上/线下活动从策划到复盘的标准任务清单',
    type: 'project',
    category: '市场营销',
    isPublic: true,
    taskCount: 10,
    tags: ['活动', '运营', '市场'],
    ownerId: 'u1',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
  },
  {
    id: 'tpl-004',
    name: '我的私人模板',
    description: '个人工作流模板，不公开',
    type: 'project',
    category: '个人',
    isPublic: false,
    taskCount: 5,
    tags: ['私人'],
    ownerId: 'u1',
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
  },
]

export function mockListTemplates(params?: any): any {
  let list = [...MOCK_TEMPLATES]
  if (params?.keyword) {
    const kw = params.keyword.toLowerCase()
    list = list.filter(t => t.name.toLowerCase().includes(kw) || t.tags.some((tag: string) => tag.toLowerCase().includes(kw)))
  }
  if (params?.type) list = list.filter(t => t.type === params.type)
  if (params?.isPublic != null) list = list.filter(t => t.isPublic === params.isPublic)
  return list
}

export function mockGetTemplate(id: string): any {
  const tpl = MOCK_TEMPLATES.find(t => t.id === id) ?? MOCK_TEMPLATES[0]
  return {
    ...tpl,
    taskSnapshot: [
      { id: 's1', title: '需求调研', status: 'todo', priority: 'high', estimatedHours: 8, tags: ['需求'] },
      { id: 's2', title: '技术方案', status: 'todo', priority: 'high', estimatedHours: 16, tags: ['技术'] },
      { id: 's3', title: 'UI 设计', status: 'todo', priority: 'medium', estimatedHours: 12, tags: ['设计'] },
      { id: 's4', title: '前端开发', status: 'todo', priority: 'high', estimatedHours: 24, tags: ['前端'] },
      { id: 's5', title: '后端开发', status: 'todo', priority: 'high', estimatedHours: 32, tags: ['后端'] },
    ],
    dependencySnapshot: [
      { prevTaskRef: 's1', nextTaskRef: 's2', type: 'FS', isShared: true },
      { prevTaskRef: 's1', nextTaskRef: 's3', type: 'FS', isShared: true },
      { prevTaskRef: 's2', nextTaskRef: 's4', type: 'FS' },
      { prevTaskRef: 's2', nextTaskRef: 's5', type: 'FS' },
      { prevTaskRef: 's3', nextTaskRef: 's4', type: 'FS' },
    ],
  }
}

export function mockCreateTemplate(input: any): any {
  return {
    id: 'tpl-' + Date.now(),
    name: input.name,
    description: input.description,
    type: input.type ?? 'project',
    category: input.category,
    isPublic: input.isPublic ?? false,
    taskCount: input.taskSnapshot?.length ?? 0,
    tags: input.tags ?? [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function mockApplyTemplate(id: string, input: any): any {
  const tpl = mockGetTemplate(id)
  return {
    projectId: 'proj-' + Date.now(),
    projectName: input.name,
    taskCount: tpl.taskCount ?? 5,
    dependencyCount: tpl.dependencySnapshot?.length ?? 0,
  }
}

export function mockSaveAsTemplate(projectId: string, input: any): any {
  return {
    id: 'tpl-' + Date.now(),
    name: input.name,
    description: input.description,
    type: 'project',
    category: input.category,
    isPublic: input.isPublic ?? false,
    taskCount: 8,
    tags: input.tags ?? [],
    sourceProjectId: projectId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

// ========== B20 自动化规则 mock ==========

const MOCK_RULES = [
  {
    id: 'rule-001',
    name: '任务逾期自动提醒',
    description: '任务逾期时自动添加评论并通知负责人',
    projectId: null,
    triggerType: 'task_overdue',
    triggerConfig: {},
    conditionConfig: null,
    actions: [
      { type: 'add_comment', config: { content: '此任务已逾期，请尽快处理。' } },
      { type: 'send_notification', config: { content: '您有任务已逾期，请及时处理。', channel: 'inapp' } },
    ],
    isEnabled: true,
    isSystem: false,
    triggerCount: 12,
    lastTriggeredAt: '2026-08-20T08:00:00.000Z',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-20T08:00:00.000Z',
  },
  {
    id: 'rule-002',
    name: '临期 3 天提醒',
    description: '截止日前 3 天自动提醒',
    projectId: null,
    triggerType: 'task_due_soon',
    triggerConfig: { days: 3 },
    conditionConfig: null,
    actions: [{ type: 'add_comment', config: { content: '距离截止日还有 3 天，请注意进度。' } }],
    isEnabled: false,
    isSystem: false,
    triggerCount: 0,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
  },
  {
    id: 'rule-003',
    name: 'Bug 标签自动提优先级',
    description: '添加 Bug 标签且优先级不高于 medium 时，自动提为 high',
    projectId: 'p1',
    triggerType: 'label_added',
    triggerConfig: { label: 'Bug' },
    conditionConfig: { priorityLte: 'medium' },
    actions: [{ type: 'set_priority', config: { priority: 'high' } }],
    isEnabled: true,
    isSystem: false,
    triggerCount: 5,
    lastTriggeredAt: '2026-08-19T14:30:00.000Z',
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-19T14:30:00.000Z',
  },
  {
    id: 'rule-004',
    name: '完成自动标记',
    description: '任务变为已完成时自动添加「已完成」标签',
    projectId: null,
    triggerType: 'status_changed',
    triggerConfig: { toStatus: 'done' },
    conditionConfig: null,
    actions: [{ type: 'add_label', config: { label: '已完成' } }],
    isEnabled: true,
    isSystem: false,
    triggerCount: 28,
    lastTriggeredAt: '2026-08-21T09:15:00.000Z',
    createdAt: '2026-07-25T00:00:00.000Z',
    updatedAt: '2026-08-21T09:15:00.000Z',
  },
]

export function mockListRules(params?: any): any {
  let list = [...MOCK_RULES]
  if (params?.projectId) {
    list = list.filter(r => r.projectId === params.projectId || r.projectId === null)
  }
  if (params?.triggerType) {
    list = list.filter(r => r.triggerType === params.triggerType)
  }
  if (params?.isEnabled != null) {
    list = list.filter(r => r.isEnabled === (params.isEnabled === 'true' || params.isEnabled === true))
  }
  return list
}

export function mockGetRule(id: string): any {
  return MOCK_RULES.find(r => r.id === id) ?? MOCK_RULES[0]
}

export function mockCreateRule(input: any): any {
  return {
    id: 'rule-' + Date.now(),
    ...input,
    isEnabled: input.isEnabled ?? true,
    isSystem: false,
    triggerCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function mockUpdateRule(id: string, input: any): any {
  const rule = mockGetRule(id)
  return { ...rule, ...input, updatedAt: new Date().toISOString() }
}

export function mockDeleteRule(id: string): any {
  return { id, deleted: true }
}

export function mockToggleRule(id: string, isEnabled: boolean): any {
  return { id, isEnabled }
}

export function mockTriggerRule(id: string, _taskId: string): any {
  if (id === 'rule-001') {
    return {
      matched: true,
      actions: [
        { action: 'add_comment', success: true, target: 'comment', value: '此任务已逾期，请尽快处理。', detail: '添加评论：此任务已逾期…' },
        { action: 'send_notification', success: true, target: 'inapp', value: '您有任务已逾期，请及时处理。', detail: '发送站内通知' },
      ],
    }
  }
  return { matched: false, actions: [], reason: '规则与当前任务不匹配' }
}

export function mockListRuleTemplates(): any {
  return [
    { id: 'tpl-overdue-reminder', name: '任务逾期自动提醒', description: '任务逾期时自动添加评论并通知负责人', triggerType: 'task_overdue', triggerConfig: {}, conditionConfig: null, actions: [{ type: 'add_comment', config: { content: '此任务已逾期，请尽快处理。' } }, { type: 'send_notification', config: { content: '您有任务已逾期，请及时处理。', channel: 'inapp' } }], category: '时间提醒' },
    { id: 'tpl-due-soon-3d', name: '临期 3 天提醒', description: '截止日前 3 天自动提醒，避免遗漏', triggerType: 'task_due_soon', triggerConfig: { days: 3 }, conditionConfig: null, actions: [{ type: 'add_comment', config: { content: '距离截止日还有 3 天，请注意进度。' } }], category: '时间提醒' },
    { id: 'tpl-done-archive', name: '完成自动标记', description: '任务变为已完成时，自动添加「已完成」标签', triggerType: 'status_changed', triggerConfig: { toStatus: 'done' }, conditionConfig: null, actions: [{ type: 'add_label', config: { label: '已完成' } }], category: '状态管理' },
    { id: 'tpl-high-priority-urgent', name: '高优先级自动标记', description: '任务设为高优先级时，自动添加「紧急」标签', triggerType: 'priority_changed', triggerConfig: { toPriority: 'high' }, conditionConfig: null, actions: [{ type: 'add_label', config: { label: '紧急' } }], category: '优先级' },
    { id: 'tpl-bug-auto-high', name: 'Bug 自动提优先级', description: '添加 Bug 标签且优先级不高于 medium 时，自动提为 high', triggerType: 'label_added', triggerConfig: { label: 'Bug' }, conditionConfig: { priorityLte: 'medium' }, actions: [{ type: 'set_priority', config: { priority: 'high' } }], category: '标签联动' },
  ]
}

// ========== B22 开放 API + Webhook mock ==========

const MOCK_API_KEYS = [
  {
    id: 'ak1',
    name: 'CI/CD 流水线',
    keyPrefix: 'os_sk_a1b2...',
    scopes: ['tasks:read', 'tasks:write', 'projects:read'],
    expiresAt: null,
    lastUsedAt: '2026-08-21T10:30:00.000Z',
    createdAt: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 'ak2',
    name: '飞书集成',
    keyPrefix: 'os_sk_c3d4...',
    scopes: ['*'],
    expiresAt: '2026-12-31T23:59:59.000Z',
    lastUsedAt: '2026-08-20T18:45:00.000Z',
    createdAt: '2026-07-15T00:00:00.000Z',
  },
  {
    id: 'ak3',
    name: '数据看板（只读）',
    keyPrefix: 'os_sk_e5f6...',
    scopes: ['projects:read', 'tasks:read', 'reports:read'],
    expiresAt: null,
    lastUsedAt: null,
    createdAt: '2026-08-10T00:00:00.000Z',
  },
]

export function mockListApiKeys(): any {
  return [...MOCK_API_KEYS]
}

export function mockCreateApiKey(input: any): any {
  return {
    id: 'ak_' + Date.now(),
    name: input.name,
    keyPrefix: 'os_sk_' + Math.random().toString(16).slice(2, 6) + '...',
    scopes: input.scopes ?? ['*'],
    expiresAt: input.expiresAt ?? null,
    lastUsedAt: null,
    createdAt: new Date().toISOString(),
    secret: 'os_sk_' + 'a'.repeat(48), // mock 完整 Key
  }
}

export function mockRevokeApiKey(id: string): any {
  return { id, revoked: true }
}

const MOCK_WEBHOOKS = [
  {
    id: 'wh1',
    name: '飞书任务同步',
    url: 'https://open.feishu.cn/open-apis/.../webhook',
    events: ['task.created', 'task.updated', 'task.deleted'],
    isActive: true,
    triggerCount: 156,
    failureCount: 0,
    lastTriggeredAt: '2026-08-21T10:30:00.000Z',
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
  },
  {
    id: 'wh2',
    name: '企业微信通知',
    url: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send',
    events: ['task.completed', 'task.created'],
    isActive: true,
    triggerCount: 42,
    failureCount: 2,
    lastTriggeredAt: '2026-08-20T16:20:00.000Z',
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
  },
  {
    id: 'wh3',
    name: '测试环境 Webhook',
    url: 'https://webhook.site/test-123',
    events: ['project.created', 'project.updated'],
    isActive: false,
    triggerCount: 0,
    failureCount: 5,
    lastTriggeredAt: null,
    createdAt: '2026-08-18T00:00:00.000Z',
    updatedAt: '2026-08-19T00:00:00.000Z',
  },
]

export function mockListWebhookEvents(): any {
  return [
    { type: 'task.created', name: '任务创建', category: '任务', description: '新任务被创建时触发' },
    { type: 'task.updated', name: '任务更新', category: '任务', description: '任务属性变更时触发（状态/优先级/负责人等）' },
    { type: 'task.deleted', name: '任务删除', category: '任务', description: '任务被删除时触发' },
    { type: 'task.completed', name: '任务完成', category: '任务', description: '任务状态变为已完成时触发' },
    { type: 'project.created', name: '项目创建', category: '项目', description: '新项目被创建时触发' },
    { type: 'project.updated', name: '项目更新', category: '项目', description: '项目属性变更时触发' },
    { type: 'project.deleted', name: '项目删除', category: '项目', description: '项目被删除时触发' },
  ]
}

export function mockListWebhooks(): any {
  return [...MOCK_WEBHOOKS]
}

export function mockGetWebhook(id: string): any {
  return MOCK_WEBHOOKS.find(w => w.id === id) ?? MOCK_WEBHOOKS[0]
}

export function mockCreateWebhook(input: any): any {
  return {
    id: 'wh_' + Date.now(),
    name: input.name,
    url: input.url,
    events: input.events,
    isActive: input.isActive ?? true,
    triggerCount: 0,
    failureCount: 0,
    lastTriggeredAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    signingSecret: 'a'.repeat(64), // mock
  }
}

export function mockUpdateWebhook(id: string, input: any): any {
  const hook = mockGetWebhook(id)
  return { ...hook, ...input, updatedAt: new Date().toISOString() }
}

export function mockDeleteWebhook(id: string): any {
  return { id, deleted: true }
}

export function mockToggleWebhook(id: string, isActive: boolean): any {
  return { id, isActive }
}

export function mockTestWebhook(_id: string): any {
  return {
    wouldSendTo: 'https://example.com/webhook',
    payload: {
      event: 'ping',
      timestamp: new Date().toISOString(),
      deliveryId: 'wh_dlv_test_abc123',
      tenantId: 'tn_mock',
      data: { message: 'Hello from OpenSchedule Webhook!' },
    },
    headers: {
      'X-Webhook-Event': 'ping',
      'X-Webhook-Timestamp': String(Math.floor(Date.now() / 1000)),
      'X-Webhook-Signature': 'sha256=' + 'a'.repeat(64),
      'X-Webhook-Delivery-Id': 'wh_dlv_test_abc123',
    },
    note: 'v1 仅返回模拟数据，不实际发送 HTTP 请求。生产环境会 POST 到目标 URL。',
  }
}

// ========== B21 日历集成 mock ==========

export function mockListCalendarProviders(): any {
  return [
    { provider: 'feishu', name: '飞书日历', icon: 'feishu', features: ['单向同步', '忙闲查询', '全天事件'] },
  ]
}

const MOCK_CALENDAR_ACCOUNTS = [
  {
    id: 'ca1',
    provider: 'feishu',
    accountName: '我的飞书日历',
    calendarId: 'primary',
    isActive: true,
    lastSyncedAt: '2026-08-21T10:30:00.000Z',
    syncCount: 156,
    failureCount: 0,
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-08-21T10:30:00.000Z',
  },
]

export function mockListCalendarAccounts(): any {
  return [...MOCK_CALENDAR_ACCOUNTS]
}

export function mockBindAccount(input: any): any {
  return {
    id: 'ca_' + Date.now(),
    provider: input.provider,
    accountName: input.accountName,
    calendarId: input.calendarId || 'primary',
    isActive: true,
    lastSyncedAt: null,
    syncCount: 0,
    failureCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function mockSyncTask(taskId: string): any {
  return {
    taskId,
    eventId: 'evt_' + Math.random().toString(36).slice(2, 10),
    eventUid: `mock-${taskId}@openschedule.local`,
    syncState: 'synced',
    syncedAt: new Date().toISOString(),
  }
}

export function mockSyncProject(_projectId: string): any {
  const tasks = [
    { taskId: 't1', eventId: 'evt_a1', syncState: 'synced' },
    { taskId: 't2', eventId: 'evt_b2', syncState: 'synced' },
    { taskId: 't3', eventId: 'evt_c3', syncState: 'synced' },
    { taskId: 't4', error: '没有截止日，跳过' },
  ]
  return {
    total: 4,
    success: 3,
    failed: 1,
    results: tasks,
  }
}

export function mockGetTaskMapping(taskId: string): any {
  return [
    {
      id: 'cem1',
      accountId: 'ca1',
      taskId,
      eventId: 'evt_abc123',
      eventUid: `openschedule-task-${taskId}@tn_mock`,
      syncState: 'synced',
      lastSyncedAt: '2026-08-21T10:30:00.000Z',
      lastSyncError: null,
      createdAt: '2026-08-20T00:00:00.000Z',
    },
  ]
}

export function mockGetBusyFree(userId: string, startDate: string, endDate: string): any {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const busyIntervals: any[] = []
  const meetingNames = ['产品评审会', '技术周会', '需求澄清', '代码 Review', '站会', '架构讨论', '对齐会', '复盘会']

  let idx = 0
  let cur = new Date(start)
  while (cur <= end) {
    // 上午 10:00-12:00
    const amStart = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 10, 0, 0)
    const amEnd = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 12, 0, 0)
    if (amStart >= start && amEnd <= end) {
      busyIntervals.push({
        start: amStart.toISOString(),
        end: amEnd.toISOString(),
        summary: meetingNames[idx % meetingNames.length],
        status: 'busy',
      })
    }
    // 下午 14:00-15:30
    const pmStart = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 14, 0, 0)
    const pmEnd = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 15, 30, 0)
    if (pmStart >= start && pmEnd <= end) {
      busyIntervals.push({
        start: pmStart.toISOString(),
        end: pmEnd.toISOString(),
        summary: meetingNames[(idx + 3) % meetingNames.length],
        status: 'busy',
      })
    }
    idx++
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1)
  }

  // 计算 freeSlots 和 dayLoads（简化，真实由后端算）
  const freeSlots: any[] = []
  const dayLoads: any[] = []
  cur = new Date(start)
  while (cur <= end) {
    const dateStr = formatDate(cur)
    // 空闲：9-10, 12-14, 15:30-18
    freeSlots.push({
      date: dateStr,
      slots: [
        { start: new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 9, 0).toISOString(),
          end: new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 10, 0).toISOString(),
          status: 'free' },
        { start: new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 12, 0).toISOString(),
          end: new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 14, 0).toISOString(),
          status: 'free' },
        { start: new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 15, 30).toISOString(),
          end: new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 18, 0).toISOString(),
          status: 'free' },
      ],
    })
    // 每天忙 3.5 小时 = 38.9% 负载
    dayLoads.push({
      date: dateStr,
      loadRatio: 210 / 540,
      busyMinutes: 210,
      totalWorkMinutes: 540,
    })
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1)
  }

  return {
    userId,
    startDate,
    endDate,
    busyIntervals,
    freeSlots,
    dayLoads,
  }
}

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function mockGetBatchBusyFree(userIds: string[], startDate: string, endDate: string): any {
  const perUser: Record<string, any> = {}
  for (const uid of userIds) {
    perUser[uid] = mockGetBusyFree(uid, startDate, endDate)
  }
  // 共同空闲：9:00-10:00, 12:00-14:00, 15:30-18:00（mock 所有人会议时间一样）
  const commonFreeSlots: any[] = []
  const start = new Date(startDate)
  const end = new Date(endDate)
  let cur = new Date(start)
  while (cur <= end) {
    commonFreeSlots.push({
      date: formatDate(cur),
      slots: [
        { start: new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 9, 0).toISOString(),
          end: new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 10, 0).toISOString(),
          status: 'free' },
        { start: new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 12, 0).toISOString(),
          end: new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 14, 0).toISOString(),
          status: 'free' },
        { start: new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 15, 30).toISOString(),
          end: new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 18, 0).toISOString(),
          status: 'free' },
      ],
    })
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1)
  }

  return {
    startDate,
    endDate,
    userIds,
    perUser,
    commonFreeSlots,
  }
}

/** 模拟飞书日历事件（反向同步来源：记录事件作为个人计划导入） */
const MOCK_FEISHU_EVENTS = [
  { eventId: 'fsev-001', summary: '产品需求对齐会', description: '与产品确认本期迭代范围', startAt: '2026-09-05T10:00:00.000Z', endAt: '2026-09-05T11:00:00.000Z', allDay: false },
  { eventId: 'fsev-002', summary: '个人学习：重构与设计模式', description: null, startAt: '2026-09-06T19:00:00.000Z', endAt: '2026-09-06T20:30:00.000Z', allDay: false },
  { eventId: 'fsev-003', summary: '健身 - 力量训练', description: null, startAt: '2026-09-07T06:30:00.000Z', endAt: '2026-09-07T07:30:00.000Z', allDay: false },
  { eventId: 'fsev-004', summary: '家庭聚餐（全天）', description: '周末家人聚会', startAt: '2026-09-12T00:00:00.000Z', endAt: '2026-09-12T23:59:59.000Z', allDay: true },
]

/** 模拟 GET /calendar/feishu/events：拉取飞书日历近期事件 */
export function mockListFeishuEvents(): any[] {
  return structuredClone(MOCK_FEISHU_EVENTS)
}

// =============================================================
// AI proposals mock (B23)
// =============================================================

const proposals: any[] = []
let proposalSeq = 1

function nextProposalId() { return 'prop_' + (proposalSeq++) }

function heuristicDecompose(goalTitle: string, totalHours?: number) {
  const parts = goalTitle.split(/[；;。\n、，,]+/).map((s: string) => s.trim()).filter(Boolean)
  const keywordHours: Array<[RegExp, number]> = [
    [/设计|架构|方案/, 8],
    [/开发|实现|编码|搭建/, 16],
    [/测试|验证|验收/, 8],
    [/文档|说明|总结/, 4],
    [/调研|评估|选型/, 8],
    [/部署|发布|上线/, 4],
    [/联调|对接|集成/, 8],
  ]
  const sharedKeywords = ['公共', '共享', '基础', '通用', '脚手架']
  const highKeywords = ['紧急', '尽快', '修复', '故障', 'bug']

  const tasks = parts.length === 0
    ? [{ title: goalTitle, description: '', estimatedHours: 8, isShared: false, priority: 'medium' }]
    : parts.map((title: string) => {
        let estimatedHours = 8
        for (const [re, h] of keywordHours) {
          if (re.test(title)) { estimatedHours = h; break }
        }
        const isShared = sharedKeywords.some(k => title.includes(k))
        const priority = highKeywords.some(k => title.toLowerCase().includes(k)) ? 'high' : 'medium'
        return { title, description: '', estimatedHours, isShared, priority }
      })

  if (totalHours && tasks.length > 0) {
    const total = Math.max(totalHours, tasks.length)
    const base = Math.floor(total / tasks.length)
    tasks.forEach((t: any, i: number) => {
      t.estimatedHours = i === tasks.length - 1 ? total - base * (tasks.length - 1) : base
    })
  }

  const dependencies: any[] = []
  for (let i = 0; i < tasks.length - 1; i++) {
    dependencies.push({ fromIndex: i, toIndex: i + 1, type: 'FS', lagDays: 0 })
  }

  return {
    tasks,
    dependencies,
    warnings: tasks.length > 12 ? ['拆解片段超过 12 个，质量可能下降'] : [],
  }
}

export async function mockCreateDecompose(input: any) {
  await delay()
  const { tasks, dependencies, warnings } = input.templateId
    ? {
        tasks: [
          { title: '模板任务A', description: '', estimatedHours: 8, isShared: false, priority: 'medium' },
          { title: '模板任务B', description: '', estimatedHours: 16, isShared: false, priority: 'medium' },
        ],
        dependencies: [{ fromIndex: 0, toIndex: 1, type: 'FS', lagDays: 0 }],
        warnings: [] as string[],
      }
    : heuristicDecompose(input.goalTitle, input.totalEstimatedHours)

  const start = new Date()
  const tasksWithSchedule = tasks.map((t: any, i: number) => {
    const startDate = new Date(start)
    startDate.setDate(startDate.getDate() + i * 2)
    const endDate = new Date(startDate)
    const dur = Math.max(1, Math.ceil((t.estimatedHours ?? 8) / 8) - 1)
    endDate.setDate(endDate.getDate() + dur)
    return {
      ...t,
      earliestStart: startDate.toISOString().slice(0, 10),
      earliestFinish: endDate.toISOString().slice(0, 10),
    }
  })

  const proposal = {
    id: nextProposalId(),
    type: 'decompose',
    status: 'pending' as const,
    source: 'manual_request',
    relatedProjectId: input.relatedProjectId || null,
    summary: '将「' + input.goalTitle + '」拆解为 ' + tasks.length + ' 个子任务',
    tasks: tasksWithSchedule,
    dependencies,
    warnings,
    diffSummary: { add: tasks.map((t: any) => ({ title: t.title, estimatedHours: t.estimatedHours })) },
    createdAt: now(),
    updatedAt: now(),
    expiresAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
  }
  proposals.unshift(proposal)
  return proposal
}

export async function mockListProposals(params: any = {}) {
  await delay()
  let filtered = [...proposals]
  if (params.type) filtered = filtered.filter((p: any) => p.type === params.type)
  if (params.status) filtered = filtered.filter((p: any) => p.status === params.status)
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const start = (page - 1) * pageSize
  return {
    items: filtered.slice(start, start + pageSize).map((p: any) => ({
      id: p.id, type: p.type, status: p.status, summary: p.summary,
      taskCount: p.tasks?.length ?? 0, relatedProjectId: p.relatedProjectId, createdAt: p.createdAt,
      source: p.source, dependencies: p.dependencies, warnings: p.warnings, diffSummary: p.diffSummary,
      updatedAt: p.updatedAt, expiresAt: p.expiresAt, tasks: p.tasks,
    })),
    total: filtered.length,
    page,
    pageSize,
  }
}

export async function mockGetProposal(id: string) {
  await delay()
  const p = proposals.find((x: any) => x.id === id)
  if (!p) throw new ApiClientError(40401, '建议不存在', [], 404)
  return p
}

export async function mockApplyProposal(id: string) {
  await delay()
  const p = proposals.find((x: any) => x.id === id)
  if (!p) throw new ApiClientError(40401, '建议不存在', [], 404)
  if (p.status !== 'pending') throw new ApiClientError(40001, '当前状态不可应用', [], 400)
  p.status = 'applied'
  p.updatedAt = now()
  const taskIds = p.tasks.map(() => uuid())
  return {
    projectId: p.relatedProjectId || 'mock_proj',
    taskCount: p.tasks.length,
    dependencyCount: p.dependencies?.length ?? 0,
    taskIds,
  }
}

export async function mockRejectProposal(id: string, _reason?: string) {
  await delay()
  const p = proposals.find((x: any) => x.id === id)
  if (!p) throw new ApiClientError(40401, '建议不存在', [], 404)
  p.status = 'rejected'
  p.updatedAt = now()
  return { id, status: 'rejected' }
}

// =============================================================
// 健康度 & 临期保障 mock（B24）
// =============================================================

const HEALTH_CACHE: Record<string, any> = {}

function computeMockHealth(projectId: string) {
  let hash = 0
  for (let i = 0; i < projectId.length; i++) {
    hash = ((hash << 5) - hash) + projectId.charCodeAt(i)
    hash |= 0
  }
  const seed = Math.abs(hash) % 100
  const score = 55 + (seed % 35)
  const level: 'green' | 'yellow' | 'red' = score >= 70 ? 'green' : score >= 40 ? 'yellow' : 'red'

  const progress = score + (seed % 10) - 5
  const schedule = score - 5 + (seed % 15)
  const workload = score + (seed % 20) - 10
  const quality = 80 + (seed % 15)

  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

  const risks: any[] = []
  if (schedule < 70) {
    risks.push({
      id: 'r1', type: 'schedule_risk', severity: 'high',
      title: '2 个任务已逾期',
      description: '有 2 个任务超过截止日期仍未完成，请优先处理',
      relatedTaskIds: ['t1', 't2'],
      metric: { name: '逾期任务数', value: 2, threshold: 1, unit: '个' },
    })
  }
  if (workload < 70) {
    risks.push({
      id: 'r2', type: 'overload', severity: 'medium',
      title: '1 名成员任务过载',
      description: '有 1 名成员同时处理超过 5 个进行中任务',
      relatedTaskIds: [],
      metric: { name: '过载比例', value: 25, threshold: 30, unit: '%' },
    })
  }
  if (quality < 90) {
    risks.push({
      id: 'r3', type: 'blocked_task', severity: 'medium',
      title: '1 个任务被阻塞',
      description: '阻塞率 10%，建议排查阻塞原因',
      relatedTaskIds: ['t3'],
      metric: { name: '阻塞率', value: 10, threshold: 5, unit: '%' },
    })
  }

  const suggestionCount = Math.max(1, 3 - Math.floor((score - 60) / 15))
  const allSuggestions = [
    '⚠️ 优先处理已逾期任务，评估是否需要调整截止日期',
    '📉 进度落后于预期，建议拆解关键路径任务',
    '👥 部分成员任务过载，建议重新分配工作',
    '🚧 梳理阻塞任务的阻塞原因，协调相关人员尽快解除',
  ]

  return {
    projectId,
    score: clamp(score),
    level,
    dimensions: {
      progress: clamp(progress),
      schedule: clamp(schedule),
      workload: clamp(workload),
      quality: clamp(quality),
    },
    risks,
    suggestions: allSuggestions.slice(0, suggestionCount),
    computedAt: new Date().toISOString(),
    taskStats: {
      total: 15, done: 5, inProgress: 6, blocked: 1, todo: 3, overdue: 2, nearDue: 3,
    },
  }
}

export async function mockGetProjectHealth(projectId: string) {
  await delay()
  if (!HEALTH_CACHE[projectId]) {
    HEALTH_CACHE[projectId] = computeMockHealth(projectId)
  }
  return HEALTH_CACHE[projectId]
}

export async function mockGetProjectRisks(projectId: string) {
  await delay()
  const health = await mockGetProjectHealth(projectId)
  return health.risks
}

export async function mockGetPortfolioHealth(): Promise<any> {
  await delay()
  return {
    items: [
      { projectId: 'p1', projectName: 'OpenSchedule 开发', score: 85, level: 'green', riskCount: 1, taskCount: 32, progress: 65, endDate: '2026-09-30' },
      { projectId: 'p2', projectName: '官网改版', score: 58, level: 'yellow', riskCount: 3, taskCount: 18, progress: 40, endDate: '2026-09-15' },
      { projectId: 'p3', projectName: '数据迁移', score: 42, level: 'red', riskCount: 5, taskCount: 8, progress: 25, endDate: '2026-08-28' },
    ],
    total: 3,
    greenCount: 1, yellowCount: 1, redCount: 1, averageScore: 62,
  }
}

export async function mockGenerateEmergency(projectId: string) {
  await delay()
  return {
    proposalId: 'prop_emergency_' + Date.now(),
    projectId,
    actions: [
      {
        id: 'a1', actionType: 'rush',
        title: '集中冲刺 2 个临期任务',
        rationale: '2 个任务 3 天内到期，剩余工时均 ≤ 8 小时，短期集中投入可按期交付',
        impact: '预计可将 2 个临期任务转为按期交付',
        targetTaskIds: ['t1', 't2'], effortHours: 12, riskReductionEstimate: 15,
      },
      {
        id: 'a2', actionType: 'reassign',
        title: '优先解决关键阻塞点',
        rationale: '任务 A 被阻塞，影响下游 3 个任务，是当前最大瓶颈',
        impact: '解除阻塞后可释放 3 个下游任务的推进空间',
        targetTaskIds: ['t3'], riskReductionEstimate: 10,
      },
      {
        id: 'a3', actionType: 'de-prioritize',
        title: '优先级重排：聚焦高优临期任务',
        rationale: '有 3 个高优先级任务即将到期，建议暂缓 2 个低优先级任务',
        impact: '集中资源确保高优任务按期交付',
        targetTaskIds: ['t1', 't2', 't4', 't5', 't6'], riskReductionEstimate: 8,
      },
    ],
    riskScoreBefore: 55, riskScoreAfterEstimate: 22,
    summary: '检测到 3 项可执行的应急措施，预计可将风险分从 55 降至 22',
    generatedAt: new Date().toISOString(),
  }
}


// =============================================================
// 跨项目资源池 mock（B25）
// =============================================================



export async function mockGetResourcePoolOverview(): Promise<any> {
  await delay()
  return {
    members: [
      {
        assigneeId: 'u1', name: '张三',
        projects: [
          { projectId: 'p1', projectName: 'OpenSchedule 开发', hours: 24, taskCount: 4, inProgressCount: 2 },
          { projectId: 'p2', projectName: '官网改版', hours: 16, taskCount: 2, inProgressCount: 1 },
        ],
        totalHours: 40, capacityHours: 40, utilization: 100, loadLevel: 'overload',
        inProgressCount: 3, todoCount: 3, dueSoonCount: 2, criticalTaskCount: 2,
      },
      {
        assigneeId: 'u2', name: '李四',
        projects: [
          { projectId: 'p1', projectName: 'OpenSchedule 开发', hours: 12, taskCount: 2, inProgressCount: 1 },
          { projectId: 'p3', projectName: '数据迁移', hours: 20, taskCount: 3, inProgressCount: 1 },
        ],
        totalHours: 32, capacityHours: 40, utilization: 80, loadLevel: 'heavy',
        inProgressCount: 2, todoCount: 3, dueSoonCount: 1, criticalTaskCount: 1,
      },
      {
        assigneeId: 'u3', name: '王五',
        projects: [
          { projectId: 'p2', projectName: '官网改版', hours: 20, taskCount: 3, inProgressCount: 2 },
        ],
        totalHours: 20, capacityHours: 40, utilization: 50, loadLevel: 'normal',
        inProgressCount: 2, todoCount: 1, dueSoonCount: 0, criticalTaskCount: 0,
      },
      {
        assigneeId: 'u4', name: '赵六',
        projects: [
          { projectId: 'p3', projectName: '数据迁移', hours: 8, taskCount: 1, inProgressCount: 1 },
        ],
        totalHours: 8, capacityHours: 40, utilization: 20, loadLevel: 'idle',
        inProgressCount: 1, todoCount: 0, dueSoonCount: 0, criticalTaskCount: 0,
      },
      {
        assigneeId: 'u5', name: '钱七',
        projects: [],
        totalHours: 0, capacityHours: 40, utilization: 0, loadLevel: 'idle',
        inProgressCount: 0, todoCount: 0, dueSoonCount: 0, criticalTaskCount: 0,
      },
    ],
    totalCapacity: 200,
    totalAllocated: 100,
    utilization: 50,
    overloadCount: 1,
    idleCount: 2,
    topBottlenecks: ['u1', 'u2'],
    conflicts: [
      {
        id: 'c1', type: 'cross_project_overload', severity: 'high',
        title: '张三 跨项目过载',
        description: '同时在 2 个项目承担任务，利用率 100%，超出承载能力',
        assigneeId: 'u1', assigneeName: '张三',
        relatedProjectIds: ['p1', 'p2'], relatedTaskIds: [],
        metric: { name: '利用率', value: 100, threshold: 100, unit: '%' },
      },
      {
        id: 'c2', type: 'same_deadline_contention', severity: 'medium',
        title: '李四 一周内有 3 个高优任务到期',
        description: '多个项目的高优先级任务集中在同一周截止，存在交付风险',
        assigneeId: 'u2', assigneeName: '李四',
        relatedProjectIds: ['p1', 'p3'], relatedTaskIds: ['t1', 't2', 't3'],
        metric: { name: '高优临期任务', value: 3, threshold: 3, unit: '个' },
      },
    ],
  }
}

export async function mockGetResourceMember(assigneeId: string): Promise<any | null> {
  await delay()
  const overview = await mockGetResourcePoolOverview()
  return overview.members.find((m: any) => m.assigneeId === assigneeId) ?? null
}

export async function mockGetResourceConflicts(): Promise<any[]> {
  await delay()
  const overview = await mockGetResourcePoolOverview()
  return overview.conflicts
}

export async function mockGetResourceMatrix(): Promise<any> {
  await delay()
  return {
    projectIds: ['p1', 'p2', 'p3'],
    projectNames: ['OpenSchedule 开发', '官网改版', '数据迁移'],
    assigneeIds: ['u1', 'u2', 'u3', 'u4', 'u5'],
    assigneeNames: ['张三', '李四', '王五', '赵六', '钱七'],
    matrix: [
      [24, 16, 0],
      [12, 0, 20],
      [0, 20, 0],
      [0, 0, 8],
      [0, 0, 0],
    ],
  }
}

export async function mockGenerateRebalance(): Promise<any> {
  await delay()
  return {
    proposalId: 'prop_rebalance_' + Date.now(),
    actions: [
      {
        id: 'a1', actionType: 'reassign',
        title: '将 2 个低优任务从 张三 调整给 赵六',
        rationale: '张三 过载（100%），赵六 闲置（20%），迁移可平衡负载',
        fromAssigneeId: 'u1', toAssigneeId: 'u4',
        relatedTaskIds: ['t1', 't2'], estimatedHoursReduction: 16,
        impact: '预计将 张三 利用率从 100% 降至 ~60%',
      },
      {
        id: 'a2', actionType: 'defer_low_priority',
        title: '延后 3 个低优先级任务，优先保障高优交付',
        rationale: '整体资源偏紧，集中资源保障中高优任务按期交付',
        relatedTaskIds: ['t3', 't4', 't5'], estimatedHoursReduction: 24,
        impact: '集中资源保障中高优任务按期交付，低优任务顺延到下个周期',
      },
    ],
    overloadedMembers: 1,
    idleMembers: 2,
    utilizationBefore: 50,
    utilizationAfterEstimate: 40,
    summary: '识别到 1 名过载成员，2 名闲置成员，建议 2 项调整措施',
    generatedAt: new Date().toISOString(),
  }
}
