/**
 * 职责：mock 数据聚合与查询辅助 —— 提供可变的内存数据库（db）供 service 层读写，
 * 以及一组纯查询函数。移动端不 import Web 端任何文件，本模块自包含。
 */
import type {
  AiProposal,
  Attachment,
  AuditFeedItem,
  NotificationItem,
  NotificationPreference,
  PersonalTask,
  Project,
  Task,
  TaskComment,
  TaskDependency,
  TenantSummary,
  TimeEntry,
  User,
} from '@/types'
import {
  DEMO_MANAGER_IDS,
  DEMO_USER_IDS,
  TENANT_ID,
  day,
  demoDayAt,
  mockComments,
  mockMe,
  mockProjects,
  mockTasks,
  mockTenant,
  mockUsers,
} from './seed'
import {
  mockAiProposals,
  mockAttachments,
  mockAuditFeed,
  mockNotificationPreferences,
  mockNotifications,
  mockPersonalTasks,
  mockTaskDependencies,
  mockTimeEntries,
} from './seed-extra'

export {
  DEMO_MANAGER_IDS,
  DEMO_USER_IDS,
  TENANT_ID,
  day,
  demoDayAt,
  mockComments,
  mockMe,
  mockProjects,
  mockTasks,
  mockTenant,
  mockUsers,
}
export {
  mockAiProposals,
  mockAttachments,
  mockAuditFeed,
  mockNotificationPreferences,
  mockNotifications,
  mockPersonalTasks,
  mockTaskDependencies,
  mockTimeEntries,
}

/**
 * 内存数据库：mock 模式下所有写操作都作用于此，
 * 保证「操作后回读一致」的演示体验（刷新页面即复位）。
 */
export interface MockDatabase {
  tenant: TenantSummary
  users: User[]
  projects: Project[]
  tasks: Task[]
  comments: TaskComment[]
  timeEntries: TimeEntry[]
  personalTasks: PersonalTask[]
  aiProposals: AiProposal[]
  notifications: NotificationItem[]
  notificationPreferences: NotificationPreference[]
  taskDependencies: TaskDependency[]
  attachments: Attachment[]
  auditFeed: AuditFeedItem[]
}

/** 用种子数据构造内存数据库（深拷贝，避免污染原始种子常量） */
function buildDatabase(): MockDatabase {
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
  return {
    tenant: clone(mockTenant),
    users: clone(mockUsers),
    projects: clone(mockProjects),
    tasks: clone(mockTasks),
    comments: clone(mockComments),
    timeEntries: clone(mockTimeEntries),
    personalTasks: clone(mockPersonalTasks),
    aiProposals: clone(mockAiProposals),
    notifications: clone(mockNotifications),
    notificationPreferences: clone(mockNotificationPreferences),
    taskDependencies: clone(mockTaskDependencies),
    attachments: clone(mockAttachments),
    auditFeed: clone(mockAuditFeed),
  }
}

/** 全局唯一内存库实例 */
export const db: MockDatabase = buildDatabase()

/** 重置内存库（登出 / 演示复位用） */
export function resetDatabase(): void {
  const fresh = buildDatabase()
  Object.assign(db, fresh)
}

/** 递增 id 序号（mock 写操作生成 id 用） */
let idSeq = 1000
export function nextId(prefix: string): string {
  idSeq += 1
  return `${prefix}-${idSeq}`
}

/** 当前 ISO8601 UTC 时间戳 */
export function now(): string {
  return new Date().toISOString()
}

/** 通知写入入参（站内通知唯一写入口，M2-P1-03） */
export interface PushNotificationInput {
  /** 接收人 */
  userId: string
  /** 事件类型（见 NOTIFICATION_EVENT_LABEL） */
  type: string
  title: string
  body?: string | null
  /** 跳转参数 */
  data?: { taskId?: string } | null
}

/**
 * 向内存库追加一条站内通知（未读数由 status / readAt 决定）。
 * 采用 unshift，保证新通知位于队首（与 `mockNotifications` 既有字段风格一致）。
 */
export function pushNotification(input: PushNotificationInput): NotificationItem {
  const notification: NotificationItem = {
    id: nextId('notif'),
    tenantId: db.tenant.id,
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    data: input.data ?? null,
    channel: 'in_app',
    status: 'sent',
    readAt: null,
    createdAt: now(),
  }
  db.notifications.unshift(notification)
  return notification
}

/**
 * 去重写入器：同一 `userId` + 同一 `type` + 同一 `data.taskId` 已存在**未读**通知时**跳过写入**
 * （PRD M4-P0-04 / Q4-2）。
 *
 * - 「未读」判定字段 = **`readAt === null`**（与 `NotificationsScreen.tsx` 的点击已读判定、
 *   `focus.service.getUnreadCount` 同口径；**不**用 `status === 'sent'`）；
 * - `input.data?.taskId == null` ⇒ 无法构成去重三元组，**退化为无条件写入**（等同 `pushNotification`）；
 * - 未命中去重时**直接复用** `pushNotification(input)`，不复制任何字段构造逻辑；
 * - 去重命中时**不消耗 `nextId` 序号**（因为根本没有调用 `pushNotification`）。
 *
 * @returns 新写入的通知；**去重命中（跳过写入）时返回 `null`**
 */
export function pushNotificationOnce(input: PushNotificationInput): NotificationItem | null {
  const taskId = input.data?.taskId
  if (taskId != null) {
    const duplicated = db.notifications.some(
      (item) =>
        item.userId === input.userId &&
        item.type === input.type &&
        item.data?.taskId === taskId &&
        item.readAt === null, // 「未读」的唯一判定字段
    )
    if (duplicated) return null
  }
  return pushNotification(input)
}

// ── 查询辅助（只读） ──────────────────────────────────────────────

/** 按 id 查用户 */
export function findUser(id: string | null | undefined): User | null {
  if (!id) return null
  return db.users.find((user) => user.id === id) ?? null
}

/** 是否为管理人员（提报免审 / 审核人来源，Q2-4） */
export function isManagerUser(id: string | null | undefined): boolean {
  if (!id) return false
  return DEMO_MANAGER_IDS.includes(id)
}

/** 当前租户全部 manager 用户 id（reviewerIds 来源，Q2-4） */
export function allManagerIds(): string[] {
  return db.users.filter((user) => DEMO_MANAGER_IDS.includes(user.id)).map((user) => user.id)
}

/** 按 id 查项目 */
export function findProject(id: string | null | undefined): Project | null {
  if (!id) return null
  return db.projects.find((project) => project.id === id) ?? null
}

/** 按 id 查任务 */
export function findTask(id: string | null | undefined): Task | null {
  if (!id) return null
  return db.tasks.find((task) => task.id === id) ?? null
}

/** 批量按 id 查用户（返回 Map，便于 O(1) 取用） */
export function userMap(): Map<string, User> {
  return new Map(db.users.map((user) => [user.id, user]))
}

/** 批量按 id 查项目（返回 Map） */
export function projectMap(): Map<string, Project> {
  return new Map(db.projects.map((project) => [project.id, project]))
}

/** 某项目的任务列表（按 sortOrder 升序） */
export function tasksByProject(projectId: string): Task[] {
  return db.tasks
    .filter((task) => task.projectId === projectId)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/** 某任务的评论列表（按创建时间升序） */
export function commentsByTask(taskId: string): TaskComment[] {
  return db.comments
    .filter((comment) => comment.taskId === taskId)
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** 某任务的工时记录（按开始时间倒序） */
export function timeEntriesByTask(taskId: string): TimeEntry[] {
  return db.timeEntries
    .filter((entry) => entry.taskId === taskId)
    .slice()
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

/** 某任务的附件列表 */
export function attachmentsByTask(taskId: string): Attachment[] {
  return db.attachments.filter((attachment) => attachment.resourceId === taskId)
}

/** 某任务的依赖（前置于 / 后置于该任务） */
export function dependenciesOfTask(taskId: string): TaskDependency[] {
  return db.taskDependencies.filter(
    (dependency) => dependency.prevTaskId === taskId || dependency.nextTaskId === taskId,
  )
}
