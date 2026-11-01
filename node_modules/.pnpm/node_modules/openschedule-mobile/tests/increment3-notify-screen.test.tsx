/**
 * 职责：增量 3 QA 组件级验证 —— 通知列表页（`NotificationsScreen`）的
 * ① `review.pending` **运行时图标渲染**（AC-08②，补强工程师的「源码文本断言」）；
 * ② 点击条目的**已读 + 深链**行为（AC-09，此前无任何自动化覆盖）。
 *
 * 独立性：本文件不修改任何既有套件，也不修改源码。
 * 依赖隔离方式沿用既有组件级测试惯例（`today-focus-gate.test.tsx` / `screen-gate.test.tsx`）：
 * `@expo/vector-icons`（依赖未安装的 `expo-asset`）、导航、安全区、hooks、service 全部以替身注入。
 */
import TestRenderer, { act } from 'react-test-renderer'

jest.mock('@expo/vector-icons', () => ({
  Feather: jest.fn(() => null),
}))

jest.mock('@react-navigation/native', () => {
  const navigate = jest.fn()
  const goBack = jest.fn()
  return { __nav: { navigate, goBack }, useNavigation: () => ({ navigate, goBack }) }
})

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('@/hooks', () => {
  const state: { data: unknown[]; loading: boolean; error: unknown } = {
    data: [],
    loading: false,
    error: null,
  }
  return {
    __hookState: state,
    useAuth: () => ({ user: { id: 'user-001', timezone: 'Asia/Shanghai' }, role: 'manager' }),
    useAsync: () => ({
      data: state.data,
      loading: state.loading,
      error: state.error,
      refetch: async () => undefined,
      retry: async () => undefined,
      setData: () => undefined,
    }),
  }
})

jest.mock('@/services', () => ({
  focusService: {
    listNotifications: jest.fn(async () => []),
    markNotificationRead: jest.fn(async () => undefined),
    markAllNotificationsRead: jest.fn(async () => undefined),
  },
}))

import { Feather } from '@expo/vector-icons'
import * as navModule from '@react-navigation/native'
import { Card } from '@/components'
import { focusService } from '@/services'
import { NotificationsScreen } from '@/screens/NotificationsScreen'
import type { NotificationItem } from '@/types'

const featherMock = Feather as unknown as jest.Mock
const nav = (navModule as unknown as { __nav: { navigate: jest.Mock; goBack: jest.Mock } }).__nav
const hookState = (
  jest.requireMock('@/hooks') as { __hookState: { data: NotificationItem[]; loading: boolean; error: unknown } }
).__hookState
const markReadMock = (focusService as unknown as { markNotificationRead: jest.Mock }).markNotificationRead

/** 一条未读 `review.pending` 通知（`data.taskId` 存在 ⇒ 可深链） */
function pendingNotification(): NotificationItem {
  return {
    id: 'notif-901',
    tenantId: 'tenant-001',
    userId: 'user-001',
    type: 'review.pending',
    title: '待你审核',
    body: '「首页原型设计」已完成提报，等待你的审核',
    data: { taskId: 'task-004' },
    channel: 'in_app',
    status: 'sent',
    readAt: null,
    createdAt: '2026-09-27T10:00:00.000Z',
  }
}

function collectText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(collectText).join('')
  const obj = node as { children?: unknown; props?: { children?: unknown } }
  const kids = obj.children ?? obj.props?.children
  return kids == null ? '' : collectText(kids)
}

async function mount(): Promise<TestRenderer.ReactTestRenderer> {
  let renderer!: TestRenderer.ReactTestRenderer
  await act(async () => {
    renderer = TestRenderer.create(<NotificationsScreen />)
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400))
  })
  return renderer
}

/** 点击「通知卡片」本体（避开 ScreenHeader 的返回 / 全部已读按钮），并等待其异步 handler 落地 */
async function pressNotificationCard(renderer: TestRenderer.ReactTestRenderer): Promise<void> {
  const cards = renderer.root.findAllByType(Card)
  expect(cards).toHaveLength(1)
  await act(async () => {
    ;(cards[0].props as { onPress?: () => void }).onPress?.()
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  hookState.data = []
  hookState.loading = false
  hookState.error = null
})

describe('QA · NotificationsScreen 运行时图标（AC-08② 补强）', () => {
  it("review.pending 条目实际渲染 'inbox' 图标（非 fallback 'bell'）", async () => {
    hookState.data = [pendingNotification()]
    const renderer = await mount()

    const names = featherMock.mock.calls.map((call) => (call[0] as { name?: string }).name)
    expect(names).toContain('inbox')
    expect(names).not.toContain('bell')

    const text = collectText(renderer.toJSON())
    expect(text).toContain('待你审核')
    expect(text).toContain('点击查看任务')
    await act(async () => renderer.unmount())
  })

  it('对照：未知类型仍降级为 bell（证明上一条断言有区分度）', async () => {
    hookState.data = [{ ...pendingNotification(), id: 'notif-902', type: 'unknown.type' }]
    const renderer = await mount()

    const names = featherMock.mock.calls.map((call) => (call[0] as { name?: string }).name)
    expect(names).toContain('bell')
    expect(names).not.toContain('inbox')
    await act(async () => renderer.unmount())
  })
})

describe('QA · NotificationsScreen 点击行为（AC-09 覆盖补强）', () => {
  it('点击未读 review.pending：先置已读，再以 { taskId, from: notification } 深链', async () => {
    hookState.data = [pendingNotification()]
    const renderer = await mount()

    await pressNotificationCard(renderer)

    expect(markReadMock).toHaveBeenCalledWith('notif-901')
    expect(nav.navigate).toHaveBeenCalledWith('TaskDetail', {
      taskId: 'task-004',
      from: 'notification',
    })
    await act(async () => renderer.unmount())
  })

  it('点击已读条目：不重复置已读，但仍深链', async () => {
    hookState.data = [{ ...pendingNotification(), id: 'notif-903', readAt: '2026-09-27T11:00:00.000Z' }]
    const renderer = await mount()

    await pressNotificationCard(renderer)

    expect(markReadMock).not.toHaveBeenCalled()
    expect(nav.navigate).toHaveBeenCalledWith('TaskDetail', {
      taskId: 'task-004',
      from: 'notification',
    })
    await act(async () => renderer.unmount())
  })
})
