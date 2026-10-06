/**
 * 职责：项目看板「任务搜索」（P1-07）—— 纯函数单测 + `BoardScreen` 组件级渲染验证。
 *
 * 覆盖：
 *  - 纯函数（`@/utils/search`）：
 *      S-1 `matchesTaskKeyword` 标题命中且大小写不敏感；
 *      S-2 描述命中（`description === null` 不报错）；
 *      S-3 标签（`tags`）命中；
 *      S-4 未命中返回 false；空 / 纯空白关键词恒为 true（不过滤）；
 *      S-5 `filterBoardColumns` 保留列结构与顺序，仅替换 tasks；
 *      S-6 空关键词**原样返回**（引用不变）；
 *      S-7 无命中列仍保留（tasks 为空数组）。
 *  - 组件（`BoardScreen`）：
 *      C-1 初始渲染：展示全部任务与原始计数，空列显示「暂无任务」，无清空按钮；
 *      C-2 输入关键词实时过滤：命中卡片保留、未命中移除、计数徽标为**过滤后**条数；
 *      C-3 匹配描述 / 标签（大小写不敏感）；
 *      C-4 列被搜空时占位文案改为「无匹配任务」（区别于「暂无任务」）；
 *      C-5 全部列合计 0 命中 → 全局空态「没有匹配的任务」；
 *      C-6 清空按钮：关键词非空时出现，点击后复位。
 *
 * 范式：`react-test-renderer` + `act` + `jest.mock`（仓库**无** `@testing-library/react-native`，
 * 不为此新增依赖），照抄 `tests/audit-center-render.test.tsx` / `tests/project-list-fab.test.tsx`。
 */
import TestRenderer, { act } from 'react-test-renderer'
import { Text, TextInput } from 'react-native'

let mockAsyncCall = 0
let mockStats: unknown = null
let mockBoard: unknown[] = []

jest.mock('@expo/vector-icons', () => ({
  Feather: () => null,
}))

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: { projectId: 'project-001' } }),
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('@/data', () => ({
  userMap: () => new Map(),
}))

/**
 * `BoardScreen` 内 `useAsync` 调用顺序固定：① stats ② board。
 * mock 以调用计数奇偶交替返回二者（每次渲染恰调用 2 次）。
 */
jest.mock('@/hooks', () => ({
  useAuth: () => ({ user: { id: 'user-001', timezone: 'Asia/Shanghai' }, role: 'manager' }),
  useAppContext: () => ({
    pushOptimistic: () => 'opt-1',
    rollbackOptimistic: () => undefined,
    commitOptimistic: () => undefined,
  }),
  useAsync: () => {
    const index = mockAsyncCall % 2
    mockAsyncCall += 1
    return {
      data: index === 0 ? mockStats : mockBoard,
      loading: false,
      error: null,
      refetch: async () => undefined,
      retry: async () => undefined,
      setData: () => undefined,
    }
  },
}))

jest.mock('@/services', () => ({
  projectService: {
    getProjectStats: jest.fn(async () => mockStats),
    listBoardColumns: jest.fn(async () => mockBoard),
  },
  taskService: { moveTask: jest.fn(async () => ({})) },
}))

import { BoardScreen } from '@/screens/BoardScreen'
import type { BoardColumn } from '@/services'
import type { Task } from '@/types'
import { filterBoardColumns, matchesTaskKeyword } from '@/utils/search'

/** 让 FadeIn 的入场定时器在测试环境内完成 */
const settle = (ms = 400): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** 合成任务（仅补齐匹配所需字段） */
function makeTask(partial: Partial<Task> & { id: string; title: string }): Task {
  return {
    tenantId: 'tenant-001',
    projectId: 'project-001',
    parentId: null,
    description: null,
    status: 'todo',
    priority: 'medium',
    assigneeId: null,
    dueAt: null,
    estimatedHours: null,
    actualHours: null,
    completedAt: null,
    startedAt: null,
    createdBy: 'user-001',
    tags: [],
    sortOrder: 0,
    workflowColumnId: null,
    isAiGenerated: false,
    version: 1,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...partial,
  }
}

/** 合成看板列 */
function makeColumn(status: Task['status'], label: string, tasks: Task[]): BoardColumn {
  return { status, label, color: '#6B7280', tasks }
}

/** 四列看板夹具：待办 2 条、进行中 1 条、已阻塞 / 已完成各 0 条 */
function makeBoard(): BoardColumn[] {
  return [
    makeColumn('todo', '待办', [
      makeTask({ id: 't1', title: '修复登录按钮' }),
      makeTask({ id: 't2', title: 'Fix Login Bug', tags: ['Urgent'] }),
    ]),
    makeColumn('in_progress', '进行中', [
      makeTask({ id: 't3', title: '撰写周报', status: 'in_progress', description: '本周工作总结' }),
    ]),
    makeColumn('blocked', '已阻塞', []),
    makeColumn('done', '已完成', []),
  ]
}

/** 递归拼接渲染树中的全部文本 */
function collectText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(collectText).join('')
  const obj = node as { children?: unknown; props?: { children?: unknown } }
  const kids = obj.children ?? obj.props?.children
  return kids == null ? '' : collectText(kids)
}

/** 挂载看板页并等待入场动画稳定 */
async function mount(): Promise<TestRenderer.ReactTestRenderer> {
  let renderer!: TestRenderer.ReactTestRenderer
  await act(async () => {
    renderer = TestRenderer.create(<BoardScreen />)
  })
  await act(async () => {
    await settle()
  })
  return renderer
}

/** 搜索输入框（全树唯一 TextInput，带无障碍标签「搜索任务」） */
function searchInput(renderer: TestRenderer.ReactTestRenderer): TestRenderer.ReactTestInstance {
  const node = renderer.root.findAll(
    (instance) => instance.props?.accessibilityLabel === '搜索任务',
  )[0]
  if (!node) throw new Error('搜索输入框未找到')
  return node
}

/** 输入关键词（受控组件，经 onChangeText 回调等价用户输入）并等待过滤生效 */
async function typeKeyword(
  renderer: TestRenderer.ReactTestRenderer,
  keyword: string,
): Promise<void> {
  await act(async () => {
    searchInput(renderer).props.onChangeText(keyword)
  })
  await act(async () => {
    await settle()
  })
}

/** 清空按钮节点（关键词非空时渲染） */
function clearButtons(renderer: TestRenderer.ReactTestRenderer): TestRenderer.ReactTestInstance[] {
  return renderer.root.findAll((node) => node.props?.accessibilityLabel === '清空搜索')
}

/**
 * 读取某看板列的计数徽标文本。
 *
 * 依据渲染顺序定位：列头由「列名 `Text`」紧接「计数 `Text`」组成，且列头先于卡片内
 * 同名状态标签渲染，故全树有序文本中**首个**等于列名的项，其下一项即计数。
 */
function columnCount(renderer: TestRenderer.ReactTestRenderer, label: string): string {
  const texts = renderer.root.findAllByType(Text).map((node) => collectText(node.props.children))
  const index = texts.indexOf(label)
  if (index < 0 || index + 1 >= texts.length) throw new Error(`列头未找到：${label}`)
  return texts[index + 1]
}

beforeEach(() => {
  mockAsyncCall = 0
  mockBoard = makeBoard()
  mockStats = {
    project: { id: 'project-001', name: '演示项目' },
    progress: 0.5,
    taskCount: 3,
    doneCount: 1,
    owner: null,
  }
})

// ────────────────────────────────────────────────────────────────
// 纯函数
// ────────────────────────────────────────────────────────────────
describe('utils/search —— matchesTaskKeyword', () => {
  it('S-1 标题命中且大小写不敏感', () => {
    const task = makeTask({ id: 't2', title: 'Fix Login Bug' })
    expect(matchesTaskKeyword(task, 'login')).toBe(true)
    expect(matchesTaskKeyword(task, 'FIX LOGIN')).toBe(true)
    expect(matchesTaskKeyword(task, '  Login  ')).toBe(true)
    expect(matchesTaskKeyword(task, 'logout')).toBe(false)
  })

  it('S-2 描述命中；description 为 null 不报错', () => {
    const withDesc = makeTask({ id: 't3', title: '撰写周报', description: '本周工作总结' })
    expect(matchesTaskKeyword(withDesc, '本周')).toBe(true)
    const nullDesc = makeTask({ id: 't1', title: '修复登录按钮', description: null })
    expect(matchesTaskKeyword(nullDesc, '修复')).toBe(true)
    expect(matchesTaskKeyword(nullDesc, '总结')).toBe(false)
  })

  it('S-3 标签命中（大小写不敏感）', () => {
    const task = makeTask({ id: 't2', title: 'Fix Login Bug', tags: ['Urgent', 'Backend'] })
    expect(matchesTaskKeyword(task, 'urgent')).toBe(true)
    expect(matchesTaskKeyword(task, 'BACKEND')).toBe(true)
    expect(matchesTaskKeyword(task, 'frontend')).toBe(false)
  })

  it('S-4 空 / 纯空白关键词恒为 true（不过滤）', () => {
    const task = makeTask({ id: 't1', title: '修复登录按钮' })
    expect(matchesTaskKeyword(task, '')).toBe(true)
    expect(matchesTaskKeyword(task, '   ')).toBe(true)
  })
})

describe('utils/search —— filterBoardColumns', () => {
  it('S-5 保留列结构与顺序，仅替换 tasks（命中项保持原顺序）', () => {
    const columns = makeBoard()
    const filtered = filterBoardColumns(columns, 'login')
    expect(filtered.map((column) => column.status)).toEqual([
      'todo',
      'in_progress',
      'blocked',
      'done',
    ])
    expect(filtered[0].tasks.map((task) => task.id)).toEqual(['t2'])
    expect(filtered[1].tasks).toHaveLength(0)
    // 列元数据（label / color）原样保留
    expect(filtered[0].label).toBe('待办')
    expect(filtered[0].color).toBe('#6B7280')
  })

  it('S-6 空关键词原样返回（引用不变）', () => {
    const columns = makeBoard()
    expect(filterBoardColumns(columns, '')).toBe(columns)
    expect(filterBoardColumns(columns, '   ')).toBe(columns)
  })

  it('S-7 无命中列仍保留，tasks 为空数组', () => {
    const filtered = filterBoardColumns(makeBoard(), '不存在的关键词zzz')
    expect(filtered).toHaveLength(4)
    expect(filtered.every((column) => column.tasks.length === 0)).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────────
// 组件级渲染
// ────────────────────────────────────────────────────────────────
describe('BoardScreen —— 任务搜索', () => {
  it('C-1 初始渲染：展示全部任务与原始计数，空列显示「暂无任务」，无清空按钮', async () => {
    const renderer = await mount()
    const text = collectText(renderer.toJSON())

    expect(text).toContain('修复登录按钮')
    expect(text).toContain('Fix Login Bug')
    expect(text).toContain('撰写周报')
    expect(text).toContain('暂无任务') // 已阻塞 / 已完成 两列本来为空
    expect(text).not.toContain('无匹配任务')
    expect(clearButtons(renderer)).toHaveLength(0)

    expect(columnCount(renderer, '待办')).toBe('2')
    expect(columnCount(renderer, '进行中')).toBe('1')
    expect(columnCount(renderer, '已阻塞')).toBe('0')

    await act(async () => renderer.unmount())
  })

  it('C-2 输入关键词实时过滤：命中卡片保留、未命中移除、计数徽标为过滤后条数', async () => {
    const renderer = await mount()
    await typeKeyword(renderer, '登录')

    const text = collectText(renderer.toJSON())
    expect(text).toContain('修复登录按钮')
    expect(text).not.toContain('Fix Login Bug')
    expect(text).not.toContain('撰写周报')

    expect(columnCount(renderer, '待办')).toBe('1')
    expect(columnCount(renderer, '进行中')).toBe('0')

    await act(async () => renderer.unmount())
  })

  it('C-3 匹配描述 / 标签（大小写不敏感）', async () => {
    const renderer = await mount()

    // 小写命中英文标题
    await typeKeyword(renderer, 'login')
    expect(collectText(renderer.toJSON())).toContain('Fix Login Bug')

    // 大写命中标签
    await typeKeyword(renderer, 'URGENT')
    expect(collectText(renderer.toJSON())).toContain('Fix Login Bug')
    expect(collectText(renderer.toJSON())).not.toContain('修复登录按钮')

    // 命中描述
    await typeKeyword(renderer, '本周')
    expect(collectText(renderer.toJSON())).toContain('撰写周报')
    expect(collectText(renderer.toJSON())).not.toContain('修复登录按钮')

    await act(async () => renderer.unmount())
  })

  it('C-4 列被搜空时占位文案改为「无匹配任务」', async () => {
    const renderer = await mount()
    await typeKeyword(renderer, '登录')

    const text = collectText(renderer.toJSON())
    expect(text).toContain('无匹配任务') // 进行中 / 已阻塞 / 已完成
    expect(text).not.toContain('暂无任务')

    await act(async () => renderer.unmount())
  })

  it('C-5 全部列合计 0 命中 → 全局空态「没有匹配的任务」', async () => {
    const renderer = await mount()
    await typeKeyword(renderer, '不存在的关键词zzz')

    const text = collectText(renderer.toJSON())
    expect(text).toContain('没有匹配的任务')
    expect(text).not.toContain('修复登录按钮')
    expect(text).not.toContain('撰写周报')
    // 列结构整体被空态替换
    expect(text).not.toContain('待办')

    await act(async () => renderer.unmount())
  })

  it('C-6 清空按钮：关键词非空时出现，点击后复位', async () => {
    const renderer = await mount()
    await typeKeyword(renderer, '登录')
    expect(clearButtons(renderer).length).toBeGreaterThan(0)

    await act(async () => {
      clearButtons(renderer)[0].props.onPress()
    })
    await act(async () => {
      await settle()
    })

    expect(clearButtons(renderer)).toHaveLength(0)
    const text = collectText(renderer.toJSON())
    expect(text).toContain('Fix Login Bug')
    expect(text).toContain('撰写周报')
    expect(text).toContain('暂无任务')

    await act(async () => renderer.unmount())
  })
})
