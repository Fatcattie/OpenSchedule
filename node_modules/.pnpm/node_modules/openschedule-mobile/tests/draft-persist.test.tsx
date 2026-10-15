/**
 * 职责：提报草稿**持久化边界**组件级验证（M2-P2-02 / D3）。
 *
 * 覆盖：
 *  - 挂载时从 AsyncStorage 恢复未提交草稿并回填表单（`hydrated` 守卫下，不被初始空值覆盖）；
 *  - 路由显式带 `kind` 时**以路由为准**（草稿其余字段照常恢复）；
 *  - AsyncStorage 读取抛错时**静默降级**（按无草稿处理，不阻断表单渲染）。
 *
 * 依赖以 jest.mock 隔离；AsyncStorage 走 setup.ts 的内存替身（可读写断言）。
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import TestRenderer, { act } from 'react-test-renderer'

let mockRouteParams: Record<string, unknown> = {}

jest.mock('@expo/vector-icons', () => ({
  Feather: () => null,
}))

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
  useRoute: () => ({ params: mockRouteParams }),
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('@/store/AppProvider', () => ({
  useAppContext: () => ({ role: 'manager' }),
}))

jest.mock('@/hooks', () => ({
  useAuth: () => ({ user: { id: 'user-001', timezone: 'Asia/Shanghai' }, role: 'manager' }),
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

import { SubmissionScreen } from '@/screens/SubmissionScreen'
import type { ItemFormValue } from '@/components/ItemForm'
import { createEmptyFormValue, serializeDraft } from '@/utils/draft'

const DRAFT_KEY = 'os.draft_submission'
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/** 渲染并等待草稿恢复完成，返回序列化后的渲染文本 */
async function renderAndSettle(): Promise<{ text: string; unmount: () => Promise<void> }> {
  let renderer!: TestRenderer.ReactTestRenderer
  await act(async () => {
    renderer = TestRenderer.create(<SubmissionScreen />)
  })
  await act(async () => {
    await flush()
    await flush()
  })
  const text = JSON.stringify(renderer.toJSON())
  return {
    text,
    unmount: async () => {
      await act(async () => {
        renderer.unmount()
      })
    },
  }
}

beforeEach(async () => {
  mockRouteParams = {}
  await AsyncStorage.clear()
})

describe('SubmissionScreen 草稿恢复 —— hydrated 守卫', () => {
  it('已有有意义草稿 → 挂载后回填（标题可见 + banner），且存储不被清空', async () => {
    const draft: ItemFormValue = { ...createEmptyFormValue('task'), title: '草稿标题-未提交' }
    await AsyncStorage.setItem(DRAFT_KEY, serializeDraft(draft, new Date().toISOString()))

    const { text, unmount } = await renderAndSettle()
    expect(text).toContain('草稿标题-未提交')
    expect(text).toContain('已恢复上次未提交的草稿')

    // 关键：草稿未被初始空值覆盖
    const stored = await AsyncStorage.getItem(DRAFT_KEY)
    expect(stored).not.toBeNull()
    expect(stored).toContain('草稿标题-未提交')
    await unmount()
  })

  it('路由带 kind=task 时以路由为准，草稿其余字段照常恢复', async () => {
    // 草稿为 project 分支（含 ownerId），路由强制 task
    const draft: ItemFormValue = {
      ...createEmptyFormValue('project'),
      title: '草稿-项目分支',
      ownerId: 'user-004',
    }
    await AsyncStorage.setItem(DRAFT_KEY, serializeDraft(draft, new Date().toISOString()))
    mockRouteParams = { kind: 'task' }

    const { text, unmount } = await renderAndSettle()
    expect(text).toContain('草稿-项目分支') // 其余字段恢复
    expect(text).toContain('目标项目') // task 分支专属字段（以路由为准）
    expect(text).not.toContain('负责人') // project 分支字段不出现
    await unmount()
  })

  it('AsyncStorage 读取抛错 → 静默降级为无草稿（表单仍渲染，不抛异常）', async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('storage boom'))

    const { text, unmount } = await renderAndSettle()
    expect(text).toContain('标题') // 表单正常渲染
    expect(text).not.toContain('已恢复上次未提交的草稿')
    await unmount()
  })
})
