/**
 * 职责：工作台通知中心本地存储 + 事件目录 + 角色可见性
 *
 * - 事件目录：7 大类（审批流/任务协作/评审/时间提醒/权限账号/项目/互动）21+ 事件
 * - 角色可见性：管理人员可见全部通知；普通人员仅可见「personal 作用域且与自己相关」的通知
 * - 去重：时间类事件用 dedupKey（按日粒度，每天一条）；行为类事件按 eventType+taskId/reminderId 60 秒窗口防抖
 */
import { useCallback, useMemo } from 'react'
import { useLocalStorageState } from './useLocalStorageState'
import { mockMe } from '@/api/mock/data'

// ─────────────────────────── 事件目录常量 ───────────────────────────

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

// ─────────────────────────── 通知对象结构 ───────────────────────────

/** 通知跳转载荷：route 为完整前端路由（生成时用 taskRoute 计算），taskId/projectId/reminderId 供去重与筛选 */
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
  /** manager=团队视角事件（管理员可见）；personal=个人相关事件（本人/相关人可见） */
  scope: 'manager' | 'personal'
  /** 相关用户 id（空数组 = 纯个人事件，如提醒到期） */
  relatedUserIds: string[]
  /** 持久去重键（时间类事件按日粒度：eventType:taskId:date） */
  dedupKey?: string
  createdAt: string
  read: boolean
}

export interface AddNotificationInput {
  eventType: WsNotificationEventType
  title: string
  body?: string | null
  data?: WsNotificationData | null
  scope?: 'manager' | 'personal'
  relatedUserIds?: string[]
  dedupKey?: string
}

let seq = 0
const nextId = () => `ntf-${Date.now()}-${(seq++).toString(36)}`

/** 兼容历史旧通知数据（无 eventType/category/scope） */
function normalizeItem(raw: WsNotification): WsNotification {
  if (raw && raw.eventType && raw.category) return raw
  return {
    id: raw.id,
    eventType: (raw.eventType as WsNotificationEventType) ?? 'general',
    category: (raw.category as NotificationCategory) ?? NOTIFICATION_EVENT_CATEGORY[(raw.eventType as WsNotificationEventType) ?? 'general'],
    title: raw.title,
    body: raw.body ?? null,
    data: raw.data ?? null,
    scope: (raw.scope as 'manager' | 'personal') ?? 'manager',
    relatedUserIds: raw.relatedUserIds ?? [],
    dedupKey: raw.dedupKey,
    createdAt: raw.createdAt,
    read: raw.read,
  }
}

export function useNotifications() {
  const [role] = useLocalStorageState<'manager' | 'member'>('workspace_role', 'manager')
  const [items, setItems] = useLocalStorageState<WsNotification[]>('ws_notifications', [])

  const normalized = useMemo(() => items.map(normalizeItem), [items])

  /** 按角色过滤：管理人员全量；普通人员仅 personal 且与自己相关（相关人列表为空 = 本人专属） */
  const visibleItems = useMemo(() => {
    if (role === 'manager') return normalized
    return normalized.filter(
      (n) =>
        n.scope === 'personal' &&
        (n.relatedUserIds.length === 0 || n.relatedUserIds.includes(mockMe.id)),
    )
  }, [normalized, role])

  const unreadCount = useMemo(() => visibleItems.filter((i) => !i.read).length, [visibleItems])

  /** 写入前去重：dedupKey 持久唯一；行为事件按 eventType+token 60 秒窗口防抖（避免多实例重复） */
  const addNotification = useCallback(
    (input: AddNotificationInput) => {
      const eventType = input.eventType ?? 'general'
      const category = NOTIFICATION_EVENT_CATEGORY[eventType] ?? 'other'
      const scope = input.scope ?? (category === 'approval' ? 'manager' : 'personal')
      const relatedUserIds = input.relatedUserIds ?? []
      const token = input.data?.taskId ?? input.data?.reminderId
      setItems((c) => {
        if (input.dedupKey && c.some((i) => i.dedupKey === input.dedupKey)) return c
        if (
          token &&
          c.some(
            (i) =>
              i.eventType === eventType &&
              (i.data?.taskId ?? i.data?.reminderId) === token &&
              Date.now() - Date.parse(i.createdAt) < 60_000,
          )
        ) {
          return c
        }
        return [
          {
            id: nextId(),
            eventType,
            category,
            title: input.title,
            body: input.body ?? null,
            data: input.data ?? null,
            scope,
            relatedUserIds,
            dedupKey: input.dedupKey,
            createdAt: new Date().toISOString(),
            read: false,
          },
          ...c,
        ].slice(0, 200)
      })
    },
    [setItems],
  )

  const markRead = useCallback(
    (id: string) => setItems((c) => c.map((i) => (i.id === id ? { ...i, read: true } : i))),
    [setItems],
  )

  const markAllRead = useCallback(
    () =>
      setItems((c) =>
        c.map((i) => (role === 'manager' || (i.scope === 'personal' && (i.relatedUserIds.length === 0 || i.relatedUserIds.includes(mockMe.id))) ? { ...i, read: true } : i)),
      ),
    [role, setItems],
  )

  return { items: visibleItems, allItems: normalized, unreadCount, addNotification, markRead, markAllRead }
}
