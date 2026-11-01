/**
 * useNotifications — R7 TanStack Query 全量迁移回归测试（真实模式契约）
 *
 * 覆盖（真实 API 路径，USE_MOCK=false）：
 * - manager 可见性：全量；member 仅 personal 且 (relatedUserIds 为空 || 含我)
 * - markRead 乐观更新 + 失败回滚 + 缓存刷新
 * - markAllRead 一键全清 + 缓存刷新
 * - 公共 API 形态稳定：items / allItems / unreadCount / addNotification / markRead / markAllRead
 * - WebSocket 事件触发缓存失效
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// 真实路径（USE_MOCK=false）；远端 axios 层由 api/notificationApi 的 mock 替代
vi.mock('@/api/config', () => ({
  API_BASE: '/api/v1',
  USE_MOCK: false,
  TOKEN_STORAGE_KEYS: { access: 'os.access_token', refresh: 'os.refresh_token' },
}))

vi.mock('@/hooks/useWs', () => ({
  useWsEvents: vi.fn(),
}))

vi.mock('@/api/notificationApi', () => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}))

import { useAuthStore } from '@/stores/authStore'
import { useNotifications } from '@/hooks/useNotifications'
import { useWsEvents } from '@/hooks/useWs'
// 顶层导入：vi.mock('@/api/notificationApi') 已 hoist 到模块注册阶段，这里拿到的是 mock 实现
import { listNotifications, markAllNotificationsRead, markNotificationRead, type NotificationItem } from '@/api/notificationApi'

function setMe(role: 'tenant.owner' | 'tenant.admin' | 'tenant.member' | null) {
  if (role === null) {
    useAuthStore.setState({ user: null, accessToken: null, isAuthenticated: false })
    return
  }
  useAuthStore.setState({
    user: {
      id: 'u-self',
      email: 'me@example.com',
      displayName: 'Me',
      avatarUrl: null,
      locale: 'zh-CN',
      timezone: 'Asia/Shanghai',
      status: 'active' as const,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
      roles: [{ key: role, scope: 'tenant', scopeResourceId: null }],
    },
    accessToken: 'tkn',
    isAuthenticated: true,
  })
}

/** 服务端 NotificationItem 形态（listNotifications 的返回形状）。
 * 前端 scope 由 hook 的 `mapServerNotificationToWs` 派生：
 * approval 类事件（approval_*）→ manager，其余 → personal；relatedUserIds 放 data 内。 */
function makeItem(over: {
  id?: string
  eventType?: string
  title?: string
  body?: string | null
  relatedUserIds?: string[]
  dedupKey?: string
  createdAt?: string
  read?: boolean
} = {}): NotificationItem {
  const read = over.read === true
  return {
    id: over.id ?? `ntf-${Math.random().toString(36).slice(2, 10)}`,
    type: over.eventType ?? 'task_created',
    title: over.title ?? '通知',
    body: over.body ?? null,
    data: {
      relatedUserIds: over.relatedUserIds ?? [],
      ...(over.dedupKey !== undefined ? { dedupKey: over.dedupKey } : {}),
    },
    status: read ? 'read' : 'pending',
    createdAt: over.createdAt ?? new Date().toISOString(),
    readAt: read ? new Date().toISOString() : null,
  }
}

function withFreshQueryClient() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return { qc, wrapper }
}

beforeEach(() => {
  useAuthStore.setState({ user: null, accessToken: null, isAuthenticated: false })
  vi.useRealTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('useNotifications — 基础读取与角色可见性（真实模式）', () => {
  it('manager（tenant.owner）看见全部；member 仅见 personal 且与自己相关', async () => {
    vi.mocked(listNotifications).mockResolvedValue({
      items: [
        // approval 类事件 → hook 派生 scope='manager'
        makeItem({ id: 'a', title: '团队事件', eventType: 'approval_pending', relatedUserIds: [] }),
        makeItem({ id: 'b', title: '个人事件', relatedUserIds: [] }),
        makeItem({ id: 'c', title: '他人个人事件', relatedUserIds: ['u-other'] }),
      ],
      total: 3,
      page: 1,
      pageSize: 50,
      unreadCount: 3,
    })

    setMe('tenant.owner')
    const manager = renderHook(() => useNotifications(), { wrapper: withFreshQueryClient().wrapper })
    await waitFor(() => expect(manager.result.current.items.map((n) => n.id).sort()).toEqual(['a', 'b', 'c']))

    setMe('tenant.member')
    const member = renderHook(() => useNotifications(), { wrapper: withFreshQueryClient().wrapper })
    await waitFor(() => expect(member.result.current.items.map((n) => n.id).sort()).toEqual(['b']))
  })

  it('member 含我（relatedUserIds 含 u-self）的 personal 也可见', async () => {
    vi.mocked(listNotifications).mockResolvedValue({
      items: [
        makeItem({ id: 'mine', title: '与我相关', relatedUserIds: ['u-self'] }),
        makeItem({ id: 'other', title: '他人', relatedUserIds: ['u-other'] }),
      ],
      total: 2,
      page: 1,
      pageSize: 50,
      unreadCount: 2,
    })
    setMe('tenant.member')
    const r = renderHook(() => useNotifications(), { wrapper: withFreshQueryClient().wrapper })
    await waitFor(() => expect(r.result.current.items.map((n) => n.id)).toEqual(['mine']))
  })

  it('未登录（me=null）：member 过滤生效，manager 项被隐藏', async () => {
    vi.mocked(listNotifications).mockResolvedValue({
      items: [
        makeItem({ id: 'mg', title: 'manager', eventType: 'approval_pending', relatedUserIds: [] }),
        makeItem({ id: 'self', title: 'personal empty', relatedUserIds: [] }),
        makeItem({ id: 'other', title: 'personal other', relatedUserIds: ['u-other'] }),
      ],
      total: 3,
      page: 1,
      pageSize: 50,
      unreadCount: 3,
    })
    setMe(null)
    const r = renderHook(() => useNotifications(), { wrapper: withFreshQueryClient().wrapper })
    await waitFor(() => expect(r.result.current.items.map((n) => n.id)).toEqual(['self']))
  })
})

describe('useNotifications — markRead / markAllRead（真实 API + 乐观更新）', () => {
  it('markRead 乐观更新；失败后回滚缓存', async () => {
    const aId = 'a'
    const items = [
      makeItem({ id: aId, title: 'A', read: false, relatedUserIds: [] }),
      makeItem({ id: 'b', title: 'B', read: false, relatedUserIds: [] }),
    ]
    vi.mocked(listNotifications).mockResolvedValue({
      items,
      total: 2,
      page: 1,
      pageSize: 50,
      unreadCount: 2,
    })
    vi.mocked(markNotificationRead).mockRejectedValue(new Error('network'))
    setMe('tenant.member')
    const r = renderHook(() => useNotifications(), { wrapper: withFreshQueryClient().wrapper })

    await waitFor(() => expect(r.result.current.unreadCount).toBe(2))

    act(() => r.result.current.markRead(aId))

    // 乐观：先读后写，乐观更新在 onMutate 里完成；等待 mutation 失败回滚
    await waitFor(() => {
      expect(vi.mocked(markNotificationRead)).toHaveBeenCalledWith(aId, true)
      // 回滚后恢复原状
      expect(r.result.current.items.find((n) => n.id === aId)?.read).toBe(false)
      expect(r.result.current.unreadCount).toBe(2)
    })
  })

  it('markAllRead 一键全清并刷新缓存', async () => {
    // 有状态 mock：read-all 真正翻转服务端行，onSettled 重取后仍为已读
    let serverItems = [
      makeItem({ id: 'a', title: 'A', read: false, eventType: 'approval_pending', relatedUserIds: [] }),
      makeItem({ id: 'b', title: 'B', read: false, relatedUserIds: [] }),
    ]
    vi.mocked(listNotifications).mockImplementation(async () => ({
      items: structuredClone(serverItems),
      total: serverItems.length,
      page: 1,
      pageSize: 50,
      unreadCount: serverItems.filter((i) => i.status !== 'read').length,
    }))
    vi.mocked(markAllNotificationsRead).mockImplementation(async () => {
      serverItems = serverItems.map((i) => ({ ...i, status: 'read', readAt: new Date().toISOString() }))
      return { updated: serverItems.length }
    })
    setMe('tenant.owner')
    const r = renderHook(() => useNotifications(), { wrapper: withFreshQueryClient().wrapper })
    await waitFor(() => expect(r.result.current.unreadCount).toBe(2))

    act(() => r.result.current.markAllRead())
    await waitFor(() => {
      expect(markAllNotificationsRead).toHaveBeenCalled()
      expect(r.result.current.unreadCount).toBe(0)
      expect(r.result.current.items.every((n) => n.read)).toBe(true)
    })
  })

  it('读取失败时 query 进入 error 状态而非静默吞掉', async () => {
    vi.mocked(listNotifications).mockRejectedValue(new Error('offline'))
    setMe('tenant.member')
    const r = renderHook(() => useNotifications(), { wrapper: withFreshQueryClient().wrapper })
    await waitFor(() => expect(r.result.current.isError).toBe(true))
  })
})

describe('useNotifications — 公共 API 形态稳定（向后兼容）', () => {
  it('返回 7 个键：items / allItems / unreadCount / addNotification / markRead / markAllRead / isError', async () => {
    vi.mocked(listNotifications).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50, unreadCount: 0 })
    setMe('tenant.member')
    const r = renderHook(() => useNotifications(), { wrapper: withFreshQueryClient().wrapper })
    await waitFor(() => {
      const keys = Object.keys(r.result.current).sort()
      expect(keys).toEqual(['addNotification', 'allItems', 'items', 'isError', 'markAllRead', 'markRead', 'unreadCount'].sort())
    })
    expect(typeof r.result.current.addNotification).toBe('function')
    expect(typeof r.result.current.markRead).toBe('function')
    expect(typeof r.result.current.markAllRead).toBe('function')
    expect(typeof r.result.current.unreadCount).toBe('number')
    expect(Array.isArray(r.result.current.items)).toBe(true)
    expect(Array.isArray(r.result.current.allItems)).toBe(true)
  })

  it('addNotification 在真实模式下为 no-op（后端 Outbox 是唯一通知来源）', async () => {
    vi.mocked(listNotifications).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50, unreadCount: 0 })
    setMe('tenant.member')
    const r = renderHook(() => useNotifications(), { wrapper: withFreshQueryClient().wrapper })
    await waitFor(() => expect(r.result.current.items).toHaveLength(0))

    act(() => r.result.current.addNotification({ title: 'ignored', body: 'x' }))
    expect(r.result.current.items).toHaveLength(0)
  })
})

describe('useNotifications — WebSocket 事件驱动缓存刷新', () => {
  it('useWsEvents 回调在 task.* 事件后 invalidate 通知查询', async () => {
    vi.mocked(listNotifications).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50, unreadCount: 0 })
    const qc = new QueryClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    setMe('tenant.member')
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )
    const r = renderHook(() => useNotifications(), { wrapper })
    // useWsEvents 被 mock：取出 hook 注册的回调，模拟一次 task.* 事件投递
    const wsMock = vi.mocked(useWsEvents)
    await waitFor(() => expect(wsMock).toHaveBeenCalled())
    const onEvent = wsMock.mock.calls[0][0]
    act(() => {
      onEvent('task_created', { taskId: 't-1' })
    })
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['notifications'] }))
    r.unmount()
    invalidateSpy.mockRestore()
  })
})