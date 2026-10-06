/**
 * 职责：M-P2-04 工作台「本周完成」数据卡片 —— 组件级渲染验证。
 *
 * 渲染真实 `WorkspaceScreen`，仅 mock 导航 / 安全区 / 权限上下文 / hooks / service；
 * 覆盖：数据正常显示数值（完成数 + 工时）、错误态紧凑重试入口（点击触发 retry）。
 * 范式照抄 `tests/no-nested-buttons.test.tsx`（`react-test-renderer` + `act` + `jest.mock`）。
 */
import TestRenderer, { act } from 'react-test-renderer'

/** 工作台 `useAsync` 调用计数（同页 4 次调用按序交替取数：todos / approaching / unread / summary） */
let mockAsyncCall = 0
/** 数据卡片数据（`summaryService.getWeekSummary` 结果） */
let mockSummary: unknown = null
/** 数据卡片错误（非 null 时渲染错误态） */
let mockSummaryError: unknown = null
/** 数据卡片 retry（错误态点击入口调用） */
const mockRetry = jest.fn(async () => undefined)

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }))

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: {} }),
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('@/store/AppProvider', () => ({
  useAppContext: () => ({ role: 'manager' }),
}))

jest.mock('@/hooks', () => ({
  useAuth: () => ({ user: { id: 'user-001', timezone: 'Asia/Shanghai' }, role: 'manager' }),
  useAppContext: () => ({ role: 'manager' }),
  useAsync: () => {
    // 调用顺序：① todos ② approaching ③ unread ④ summary（每轮渲染恒为 4 次，索引稳定对齐）
    const index = mockAsyncCall % 4
    mockAsyncCall += 1
    const noop = async (): Promise<void> => undefined
    const base = {
      loading: false,
      isStale: false,
      updatedAt: null,
      refetch: noop,
      setData: () => undefined,
    }
    if (index === 0) return { ...base, data: [], error: null, retry: noop }
    if (index === 1) return { ...base, data: [], error: null, retry: noop }
    if (index === 2) return { ...base, data: 0, error: null, retry: noop }
    return { ...base, data: mockSummary, error: mockSummaryError, retry: mockRetry }
  },
}))

jest.mock('@/services', () => ({
  focusService: {
    getUnreadCount: jest.fn(async () => 0),
    listAuditFeed: jest.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 5 })),
    resolveFeedTaskId: jest.fn(() => null),
  },
  taskService: {
    listMyTodos: jest.fn(async () => []),
    listDeadlineApproaching: jest.fn(async () => []),
    claimTask: jest.fn(async () => undefined),
    completeTask: jest.fn(async () => undefined),
  },
  summaryService: {
    getWeekSummary: jest.fn(async () => mockSummary),
  },
}))

import { WorkspaceScreen } from '@/screens/WorkspaceScreen'

const settle = (ms = 400): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** 把渲染树序列化为纯文本，便于数值断言 */
function collectText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(collectText).join('')
  const obj = node as { children?: unknown; props?: { children?: unknown } }
  const kids = obj.children ?? obj.props?.children
  return kids == null ? '' : collectText(kids)
}

/** 挂载工作台并等待渲染稳定 */
async function mount(): Promise<TestRenderer.ReactTestRenderer> {
  let renderer!: TestRenderer.ReactTestRenderer
  await act(async () => {
    renderer = TestRenderer.create(<WorkspaceScreen />)
  })
  await act(async () => {
    await settle()
  })
  return renderer
}

/** 数据卡片样例（口径：3 项完成 / 12.5h） */
const WEEK_SUMMARY = {
  period: 'week',
  window: { start: '2026-09-20T00:00:00.000Z', end: '2026-09-27T00:00:00.000Z' },
  stats: { completedCount: 3, onTimeCount: 2, overdueCount: 1, actualHoursTotal: 12.5, onTimeRate: 66.7 },
  overdueTasks: [],
  completedTasks: [],
}

beforeEach(() => {
  mockAsyncCall = 0
  mockSummary = null
  mockSummaryError = null
  mockRetry.mockClear()
})

describe('工作台「本周完成」数据卡片 —— 三态', () => {
  it('数据正常：渲染「本周完成」标题与完成数 / 工时数值', async () => {
    mockSummary = WEEK_SUMMARY
    const renderer = await mount()
    const text = collectText(renderer.toJSON())

    expect(text).toContain('本周完成')
    expect(text).toContain('完成数（项）')
    expect(text).toContain('3')
    expect(text).toContain('实际工时')
    expect(text).toContain('12.5h')

    await act(async () => renderer.unmount())
  })

  it('错误态：渲染紧凑重试入口，点击触发 retry', async () => {
    mockSummaryError = new Error('boom')
    const renderer = await mount()
    const text = collectText(renderer.toJSON())

    expect(text).toContain('本周完成')
    expect(text).toContain('重试')

    const retryNodes = renderer.root.findAll((node) => node.props?.accessibilityLabel === '重试')
    expect(retryNodes.length).toBeGreaterThan(0)
    await act(async () => {
      retryNodes[0].props.onPress()
    })
    expect(mockRetry).toHaveBeenCalled()

    await act(async () => renderer.unmount())
  })
})
