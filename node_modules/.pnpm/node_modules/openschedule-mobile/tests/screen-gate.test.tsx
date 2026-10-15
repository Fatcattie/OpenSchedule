/**
 * 职责：深链直达下的**权限门禁**组件级验证（PRD §7.1 / M2-P0-01）。
 *
 * 背景：`WorkspaceScreen` 的入口是「隐藏而非置灰」，但**深链直达** `/create`、`/submit`
 * 必须在无权限角色下落 `ErrorState`「无权限」。本用例渲染真实页面组件（react-test-renderer），
 * 按角色断言渲染结果：
 *  - CreateItemScreen：member → 「无权限：当前角色不能创建事项」；manager → 渲染表单（按钮「创建」）；
 *  - SubmissionScreen：两角色均有 submission:create → 均渲染表单，但按钮文案分叉
 *    （manager「直接创建」+ banner「将直接创建，无需审核」；member「提交提报」）。
 *
 * 依赖以 jest.mock 隔离（导航 / 安全区 / 认证 / service），保证只验证「门禁渲染」这一行为。
 */
import TestRenderer, { act } from 'react-test-renderer'

let mockRole: 'manager' | 'member' = 'member'

// @expo/vector-icons 依赖 expo-asset（未安装）；测试环境以空组件替身，只验证门禁渲染
jest.mock('@expo/vector-icons', () => ({
  Feather: () => null,
}))

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
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
  DRAFT_KEYS: { submission: 'os.draft_submission' },
  projectService: {
    listProjectCards: jest.fn(async () => []),
    createProject: jest.fn(async () => ({})),
  },
  taskService: {
    createTask: jest.fn(async () => ({})),
    submitItem: jest.fn(async () => ({})),
  },
}))

import { CreateItemScreen } from '@/screens/CreateItemScreen'
import { SubmissionScreen } from '@/screens/SubmissionScreen'

/** 把渲染树序列化为字符串，便于文本断言 */
async function renderText(node: React.ReactElement): Promise<string> {
  let renderer!: TestRenderer.ReactTestRenderer
  await act(async () => {
    renderer = TestRenderer.create(node)
  })
  const text = JSON.stringify(renderer.toJSON())
  await act(async () => {
    renderer.unmount()
  })
  return text
}

beforeEach(() => {
  mockRole = 'member'
})

describe('CreateItemScreen —— 深链 /create 的权限门禁', () => {
  it('member（无 project:create / task:create）→ 渲染「无权限」ErrorState，不渲染表单', async () => {
    mockRole = 'member'
    const text = await renderText(<CreateItemScreen />)
    expect(text).toContain('无权限：当前角色不能创建事项')
    // 表单字段不应渲染（页头「创建事项」仍会出现，故以表单字段「标题」为判据）
    expect(text).not.toContain('标题')
    expect(text).not.toContain('描述')
  })

  it('manager → 渲染创建表单（含标题字段与「创建」按钮），不出现无权限文案', async () => {
    mockRole = 'manager'
    const text = await renderText(<CreateItemScreen />)
    expect(text).not.toContain('无权限')
    expect(text).toContain('创建事项') // 页头
    expect(text).toContain('创建') // 主按钮
    expect(text).toContain('标题')
  })
})

describe('SubmissionScreen —— 深链 /submit 的角色分叉', () => {
  it('manager（submission:create 通过）→ 免审直落文案（「新建事项」+「直接创建」+ banner）', async () => {
    mockRole = 'manager'
    const text = await renderText(<SubmissionScreen />)
    expect(text).not.toContain('无权限')
    expect(text).toContain('新建事项')
    expect(text).toContain('直接创建')
    expect(text).toContain('将直接创建，无需审核')
  })

  it('member（submission:create 通过）→ 提报文案（「提报事项」+「提交提报」），无免审 banner', async () => {
    mockRole = 'member'
    const text = await renderText(<SubmissionScreen />)
    expect(text).not.toContain('无权限')
    expect(text).toContain('提报事项')
    expect(text).toContain('提交提报')
    expect(text).not.toContain('将直接创建，无需审核')
  })
})
