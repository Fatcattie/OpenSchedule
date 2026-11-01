/**
 * 职责：通知中心数据层 —— R7 TanStack Query 全量迁移
 *
 * 设计：
 * - 以 `notificationApi` 为单一数据源（`listNotifications` / `markNotificationRead` /
 *   `markAllNotificationsRead`）；`addNotification` 退化为 no-op——通知由后端 Outbox（R6-3）+
 *   实发通道（R5）+ WS 广播驱动，前端只读。
 * - 角色可见性：manager 全量；member 仅 `scope==='personal' && (relatedUserIds 为空 || 含我)`。
 * - 后端通知 source-of-truth：HTTP 是单点；WS 推送 `task.*` / `mention.parsed` 事件后
 *   用 `queryClient.invalidateQueries` 让缓存重新对齐（WS 自身暂无 `notification.*` 直推）。
 *
 * 公共 API（向后兼容原有消费点 + TodayFocusPage / NotificationsPage / useWorkspaceTasks
 * 的调用形态，不引发消费方改动）：
 *   { items, allItems, unreadCount, addNotification, markRead, markAllRead, isError }
 */

import { useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { useCurrentRole } from './useCurrentRole'
import { useWsEvents } from './useWs'
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationItem,
} from '@/api/notificationApi'

// ─────────────────────────── 事件目录常量（向后兼容既有导入） ───────────────────────────

export const NOTIFICATION_CATEGORIES = [
  'approval',
  'task',
  'review',
  'time',
  'permission',
  'project',
  'interaction',
  'other',
] as const

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]

export const NOTIFICATION_CATEGORY_META: Record<NotificationCategory, { label: string; color: string }> = {
  approval: { label: '审批流', color: 'gold' },
  task: { label: '任务协作', color: 'blue' },
  review: { label: '评审', color: 'purple' },
  time: { label: '时间提醒', color: 'cyan' },
  permission: { label: '权限账号', color: 'orange' },
  project: { label: '项目', color: 'geekblue' },
  interaction: { label: '互动', color: 'magenta' },
  other: { label: '其他', color: 'default' },
}

export type WsNotificationEventType =
  | 'approval_pending'
  | 'approval_result'
  | 'task_created'
  | 'task_claimed'
  | 'task_assigned'
  | 'task_reassigned'
  | 'task_modified'
  | 'task_completed'
  | 'task_deleted'
  | 'review_invited'
  | 'review_finished'
  | 'deadline_approaching'
  | 'deadline_overdue'
  | 'reminder_due'
  | 'role_changed'
  | 'security'
  | 'project_approved'
  | 'project_task_changed'
  | 'mention'
  | 'comment_reply'
  | 'general'

export const NOTIFICATION_EVENT_CATEGORY: Record<WsNotificationEventType, NotificationCategory> = {
  approval_pending: 'approval',
  approval_result: 'approval',
  task_created: 'task',
  task_claimed: 'task',
  task_assigned: 'task',
  task_reassigned: 'task',
  task_modified: 'task',
  task_completed: 'task',
  task_deleted: 'task',
  review_invited: 'review',
  review_finished: 'review',
  deadline_approaching: 'time',
  deadline_overdue: 'time',
  reminder_due: 'time',
  role_changed: 'permission',
  security: 'permission',
  project_approved: 'project',
  project_task_changed: 'project',
  mention: 'interaction',
  comment_reply: 'interaction',
  general: 'other',
}

// ─────────────────────────── 通知对象结构（前端视图形态） ───────────────────────────

export interface WsNotificationData {
  route?: string
  taskId?: string
  projectId?: string
  reminderId?: string
}

export interface WsNotification {
  id: string
  eventType: WsNotificationEventType
  category: NotificationCategory
  title: string
  body: string | null
  data?: WsNotificationData | null
  /** manager=团队视角事件；personal=个人相关事件（本人/相关人可见） */
  scope: 'manager' | 'personal'
  relatedUserIds: string[]
  /** 持久去重键（时间类事件按日粒度：eventType:taskId:date） */
  dedupKey?: string
  createdAt: string
  read: boolean
}

export interface AddNotificationInput {
  eventType?: WsNotificationEventType
  title: string
  body?: string | null
  data?: WsNotificationData | null
  scope?: 'manager' | 'personal'
  relatedUserIds?: string[]
  dedupKey?: string
}

// ─────────────────────────── 字段映射（后端 → WS Notification 公共形态） ───────────────────────────

/** 后端 NotificationItem → 前端 WsNotification。
 *  - status:'read' 或 readAt 非空 → read:true
 *  - category 由 type → NOTIFICATION_EVENT_CATEGORY 派生，未知 → 'other'
 *  - scope 默认 'personal'（审批类由 approval_pending 派生为 'manager'，与服务端路由表态对齐）
 */
function mapServerNotificationToWs(item: NotificationItem): WsNotification {
  const eventType = (item.type as WsNotificationEventType) ?? 'general'
  const category = NOTIFICATION_EVENT_CATEGORY[eventType] ?? 'other'
  const scope: 'manager' | 'personal' = category === 'approval' ? 'manager' : 'personal'
  const data = (item.data ?? {}) as Record<string, unknown>
  return {
    id: item.id,
    eventType,
    category,
    title: item.title,
    body: item.body ?? null,
    data: {
      route: typeof data.route === 'string' ? data.route : undefined,
      taskId: typeof data.taskId === 'string' ? data.taskId : undefined,
      projectId: typeof data.projectId === 'string' ? data.projectId : undefined,
      reminderId: typeof data.reminderId === 'string' ? data.reminderId : undefined,
    },
    scope,
    relatedUserIds: Array.isArray(data.relatedUserIds)
      ? (data.relatedUserIds as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
    dedupKey: typeof data.dedupKey === 'string' ? data.dedupKey : undefined,
    createdAt: item.createdAt,
    read: item.status === 'read' || item.readAt !== null,
  }
}

// ─────────────────────────── 角色可见性过滤 ───────────────────────────

/** manager：全量；member：仅 personal 且相关用户列表为空（个人专属）或包含我 */
function filterForRole(items: WsNotification[], role: 'manager' | 'member', meUserId: string | null): WsNotification[] {
  if (role === 'manager') return items
  return items.filter(
    (n) =>
      n.scope === 'personal' &&
      (n.relatedUserIds.length === 0 || (meUserId !== null && n.relatedUserIds.includes(meUserId))),
  )
}

// ─────────────────────────── 角色可见性过滤 ───────────────────────────


// ─────────────────────────── TanStack Query 查询键 ───────────────────────────

export const NOTIFICATIONS_QUERY_KEY = ['notifications'] as const

// ─────────────────────────── Hook ───────────────────────────

export function useNotifications() {
  const role = useCurrentRole()
  const me = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  // 真实模式：轮询 30s 让新增通知进入缓存
  const listQuery = useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: async (): Promise<{ items: WsNotification[]; total: number; unreadCount: number }> => {
      const page = await listNotifications(false)
      const items = page.items.map(mapServerNotificationToWs)
      const unreadCount = items.filter((i) => !i.read).length
      return { items, total: page.total, unreadCount }
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
    gcTime: 5 * 60_000,
  })

  // WS 任务事件可能驱动新通知产生 → 让缓存重新对齐。
  // 注意：当前 useWsEvents 仅订阅 task.* / mention.parsed；notification.* 直推还没启用（见 hook 头注释）。
  useWsEvents(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY })
    }, [queryClient]),
  )

  // 标记已读（乐观更新 + 失败回滚）
  const markReadMut = useMutation({
    mutationFn: async ({ id, read }: { id: string; read: boolean }) => {
      const updated = await markNotificationRead(id, read)
      return { id: updated.id, read: updated.status === 'read' || updated.readAt !== null }
    },
    onMutate: async ({ id, read }) => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_QUERY_KEY })
      const prev = queryClient.getQueryData<{ items: WsNotification[]; total: number; unreadCount: number }>(NOTIFICATIONS_QUERY_KEY)
      if (prev) {
        queryClient.setQueryData<{ items: WsNotification[]; total: number; unreadCount: number }>(NOTIFICATIONS_QUERY_KEY, {
          ...prev,
          items: prev.items.map((n) => (n.id === id ? { ...n, read } : n)),
          unreadCount: prev.items.filter((n) => n.id === id ? read : n.read).length,
        })
      }
      return { prev }
    },
    onError: (_err, _args, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(NOTIFICATIONS_QUERY_KEY, ctx.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY })
    },
  })

  // 全部标记已读
  const markAllReadMut = useMutation({
    mutationFn: async () => markAllNotificationsRead(),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_QUERY_KEY })
      const prev = queryClient.getQueryData<{ items: WsNotification[]; total: number; unreadCount: number }>(NOTIFICATIONS_QUERY_KEY)
      if (prev) {
        queryClient.setQueryData<{ items: WsNotification[]; total: number; unreadCount: number }>(NOTIFICATIONS_QUERY_KEY, {
          ...prev,
          items: prev.items.map((n) => ({ ...n, read: true })),
          unreadCount: 0,
        })
      }
      return { prev }
    },
    onError: (_err, _args, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(NOTIFICATIONS_QUERY_KEY, ctx.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY })
    },
  })

  const allItems = listQuery.data?.items ?? []
  const meId = me?.id ?? null
  const visibleItems = useMemo(() => filterForRole(allItems, role, meId), [allItems, role, meId])
  const visibleUnread = useMemo(() => visibleItems.filter((i) => !i.read).length, [visibleItems])

  const addNotification = useCallback(
    (_input?: AddNotificationInput) => {
      // 真实模式：后端 R6-3 Outbox 是通知的唯一来源（事件 → 邮件/IM/Push + 站内 Notification 行）。
      // 前端 addNotification 仅为向后兼容的 no-op 占位（保留入参签名，兼容 useWorkspaceTasks /
      // TodayFocusPage 等既有调用点；工作台演示通知属 D-07 范围）。
    },
    [],
  )

  const markRead = useCallback(
    (id: string) => {
      markReadMut.mutate({ id, read: true })
    },
    [markReadMut],
  )

  const markAllRead = useCallback(() => {
    markAllReadMut.mutate()
  }, [markAllReadMut])

  return {
    items: visibleItems,
    allItems,
    unreadCount: visibleUnread,
    addNotification,
    markRead,
    markAllRead,
    /** 收件箱读取失败状态（错误不静默吞掉，供页面展示兜底） */
    isError: listQuery.isError,
  }
}
