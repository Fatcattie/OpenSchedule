/**
 * 职责：项目列表页「创建入口 FAB」与空态文案的**权限门禁**组件级验证（DEF-02 / DEF-03 / PRD §7.1）。
 *
 * 背景：PRD §7.1 要求项目列表提供 FAB 创建入口（`can('project:create') || can('task:create')` 门禁）；
 * 空态文案须按能力分叉（manager 引导点 FAB / member 不引导点不存在的按钮）。
 *
 * 本用例渲染真实页面组件（react-test-renderer），按角色断言：
 *  - manager → 渲染 FAB（accessibilityLabel=「创建事项」），点击 `navigate('CreateItem')`，
 *    空态文案「点击右下角 + 创建你的第一个项目」；
 *  - member → **不渲染** FAB，空态文案回退「去 Web 端创建第一个项目，移动端会同步展示」。
 *
 * 依赖以 jest.mock 隔离（导航 / 安全区 / 权限 / hooks / service）。
 */
import TestRenderer, { act } from 'react-test-renderer'

let mockRole: 'manager' | 'member' = 'member'
const mockNavigate = jest.fn()

jest.mock('@expo/vector-icons', () => ({
  Feather: () => null,
}))

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useRoute: () => ({ params: {} }),
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('@/store/AppProvider', () => ({
  useAppContext: () => ({ role: mockRole }),
}))

jest.mock('@/hooks', () => ({
  useAuth: () => ({ user: { id: 'user-001', timezone: 'Asia/Shanghai' }, role: mockRole }),
  useAsync: () => ({
    data: [],
    loading: false,
    error: null,
    refetch: async () => undefined,
    retry: async () => undefined,
    setData: () => undefined,
  }),
}))

jest.mock('@/services', () => ({
  PROJECT_FILTER_OPTIONS: [
    { value: 'active', label: '进行中' },
    { value: 'archived', label: '已归档' },
    { value: 'all', label: '全部' },
  ],
  projectService: {
    listProjectCards: jest.fn(async () => []),
  },
}))

import { ProjectListScreen } from '@/screens/ProjectListScreen'

/** 让 FadeIn 的入场定时器在测试环境内完成 */
const settle = (ms = 400): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** 递归拼接渲染树中的全部文本（ScrollView 的 refreshControl 会构成循环引用，无法直接 JSON.stringify） */
function collectText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(collectText).join('')
  const obj = node as { children?: unknown; props?: { children?: unknown } }
  const kids = obj.children ?? obj.props?.children
  return kids == null ? '' : collectText(kids)
}

async function render(): Promise<{ text: string; fab: TestRenderer.ReactTestInstance[]; unmount: () => Promise<void> }> {
  let renderer!: TestRenderer.ReactTestRenderer
  await act(async () => {
    renderer = TestRenderer.create(<ProjectListScreen />)
  })
  await act(async () => {
    await settle()
  })
  const text = collectText(renderer.toJSON())
  const fab = renderer.root.findAll((node) => node.props?.accessibilityLabel === '创建事项')
  return {
    text,
    fab,
    unmount: async () => {
      await act(async () => {
        renderer.unmount()
      })
    },
  }
}

beforeEach(() => {
  mockRole = 'member'
  mockNavigate.mockClear()
})

describe('ProjectListScreen —— 创建入口 FAB（DEF-02）', () => {
  it('manager（具备创建权限）→ 渲染 FAB，点击跳转 CreateItem', async () => {
    mockRole = 'manager'
    const { fab, unmount } = await render()
    expect(fab.length).toBeGreaterThan(0)
    await act(async () => {
      fab[0].props.onPress()
    })
    expect(mockNavigate).toHaveBeenCalledWith('CreateItem')
    await unmount()
  })

  it('member（无 project:create / task:create）→ 不渲染 FAB', async () => {
    mockRole = 'member'
    const { fab, unmount } = await render()
    expect(fab.length).toBe(0)
    await unmount()
  })
})

describe('ProjectListScreen —— 空态文案按能力分叉（DEF-03）', () => {
  it('manager → 引导点击右下角 FAB 创建', async () => {
    mockRole = 'manager'
    const { text, unmount } = await render()
    expect(text).toContain('点击右下角 + 创建你的第一个项目')
    expect(text).not.toContain('去 Web 端创建第一个项目')
    await unmount()
  })

  it('member → 不引导点击不存在的按钮，回退 Web 端文案', async () => {
    mockRole = 'member'
    const { text, unmount } = await render()
    expect(text).toContain('去 Web 端创建第一个项目，移动端会同步展示')
    expect(text).not.toContain('点击右下角 + 创建你的第一个项目')
    await unmount()
  })
})
