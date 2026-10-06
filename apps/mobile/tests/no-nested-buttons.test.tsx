/**
 * 职责：消除 `<button>` 嵌套（P1）—— `AuditCenterScreen`（待审核栏内联动作）与
 * `BoardScreen`（任务卡片「切换状态」入口）的结构性回归守护。
 *
 * 背景：React Native Web 会把 `accessibilityRole="button"` 渲染为**真实 `<button>`** 元素
 * （`react-native-web/.../propsToAccessibilityComponent`）。`TaskCard` 恒给 `Card` 传 `onPress`
 * ⇒ `Card` 的 `Pressable` 变成 `<button>`；此前内联动作经 `TaskCard.right` 插槽渲染在其内部，
 * 导致 `<button>` 嵌套 `<button>`，浏览器控制台报
 * `In HTML, <button> cannot be a descendant of <button>`。
 *
 * 修复模式（对齐 `TodayFocusScreen` 已验证写法）：把交互元素渲染为**卡片之后的兄弟节点**
 * （仍在同一个 `FadeIn` / 外层 `View` 内），不再经 `TaskCard.right` 传入。
 *
 * 覆盖（jest 用 `react-test-renderer`，无真实 DOM、抓不到浏览器告警 ⇒ 在元素树上做结构断言）：
 *  - **NB-1** 审核中心「待审核」栏（manager，内联三枚审核动作开启）：三枚按钮仍存在（回归守护），
 *    且**不落在**卡片按钮节点子树内；
 *  - **NB-2** 审核中心：全树无「宿主 button 节点嵌套宿主 button 节点」；
 *  - **NB-3** 看板：`⋯` 切换状态按钮仍存在，且**不落在**卡片按钮节点子树内；
 *  - **NB-4** 看板：全树无「宿主 button 节点嵌套宿主 button 节点」；
 *  - **NB-5** 审核中心「审核」**回退分支**（member + 可撤销提报 ⇒ `showInlineAudit === false`
 *    且 `actions.length > 0`）：回退 `<Button label="审核" />` 仍存在（回归守护），三枚内联按钮
 *    **不存在**（证明走的是回退分支），且回退按钮**不落在**卡片按钮节点子树内、全树无嵌套；
 *  - **NB-6** 今日聚焦：渲染任务卡片时全树无嵌套（未来回归守护，当前无交互元素在 `right`/`footer`）；
 *  - **NB-7** 工作台「我的待办」：渲染任务卡片时全树无嵌套（同 NB-6）。
 *
 * 范式：`react-test-renderer` + `act` + `jest.mock`（仓库无 `@testing-library/react-native`），
 * 照抄 `tests/today-focus-review-actions.test.tsx` / `tests/audit-center-render.test.tsx` /
 * `tests/board-search.test.tsx`。
 */
import TestRenderer, { act } from 'react-test-renderer'

/** 当前挂载的屏幕（决定 `useAsync` 返回的数据形状） */
let mockMode: 'audit' | 'board' | 'today' | 'workspace' = 'audit'
/** 当前角色（`useCan` / `useAuth` 门禁） */
let mockRole: 'manager' | 'member' = 'manager'
/** 看板 / 工作台 `useAsync` 调用计数（同一页多次调用按序交替取数） */
let mockAsyncCall = 0
/** 审核中心数据（`auditService.listAuditTasks`） */
let mockTasks: unknown[] = []
/** 看板统计（`projectService.getProjectStats`） */
let mockStats: unknown = null
/** 看板列（`projectService.listBoardColumns`） */
let mockBoard: unknown[] = []
/**
 * 今日聚焦数据（`focusService.getTodayFocus`）。
 * 兼具数组与三分组字段：本页 `useAsync` 被调用两次（focus / proposals），同一形状兼容二者。
 */
const mockFocus = Object.assign([] as unknown[], {
  dueToday: [] as unknown[],
  pendingReview: [] as unknown[],
  approaching: [] as unknown[],
})
/** 工作台「我的待办」（`taskService.listMyTodos`） */
let mockTodos: unknown[] = []
/** 工作台「临期预警」（`taskService.listDeadlineApproaching`） */
let mockApproaching: unknown[] = []
/** 工作台「未读数」（`focusService.getUnreadCount`） */
let mockUnread: unknown = 0
/** 工作台「本周完成」数据卡片（`summaryService.getWeekSummary`，M-P2-04） */
let mockSummary: unknown = null

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }))

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: { projectId: 'project-001' } }),
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('@/data', () => ({ userMap: () => new Map() }))

jest.mock('@/store/AppProvider', () => ({
  useAppContext: () => ({ role: mockRole }),
}))

jest.mock('@/hooks', () => ({
  useAuth: () => ({ user: { id: 'user-001', timezone: 'Asia/Shanghai' }, role: mockRole }),
  useAppContext: () => ({
    pushOptimistic: () => 'opt-1',
    rollbackOptimistic: () => undefined,
    commitOptimistic: () => undefined,
  }),
  useAsync: () => {
    if (mockMode === 'audit') {
      return {
        data: mockTasks,
        loading: false,
        error: null,
        refetch: async () => undefined,
        retry: async () => undefined,
        setData: () => undefined,
      }
    }
    if (mockMode === 'today') {
      return {
        data: mockFocus,
        loading: false,
        error: null,
        refetch: async () => undefined,
        retry: async () => undefined,
        setData: () => undefined,
      }
    }
    if (mockMode === 'workspace') {
      // 工作台 `useAsync` 调用顺序：① todos ② approaching ③ unread ④ summary（M-P2-04；
      // 重渲染按 4 取模稳定复现）
      const index = mockAsyncCall % 4
      mockAsyncCall += 1
      return {
        data:
          index === 0
            ? mockTodos
            : index === 1
              ? mockApproaching
              : index === 2
                ? mockUnread
                : mockSummary,
        loading: false,
        error: null,
        refetch: async () => undefined,
        retry: async () => undefined,
        setData: () => undefined,
      }
    }
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
  auditService: {
    listAuditTasks: jest.fn(async () => mockTasks),
    submitAudit: jest.fn(async () => ({})),
  },
  projectService: {
    getProjectStats: jest.fn(async () => mockStats),
    listBoardColumns: jest.fn(async () => mockBoard),
  },
  focusService: {
    getTodayFocus: jest.fn(async () => mockFocus),
    listAiProposals: jest.fn(async () => []),
    getUnreadCount: jest.fn(async () => mockUnread),
    listAuditFeed: jest.fn(async () => ({ items: [], page: 1, pageSize: 5, total: 0 })),
    resolveFeedTaskId: jest.fn(() => null),
  },
  taskService: {
    moveTask: jest.fn(async () => ({})),
    listMyTodos: jest.fn(async () => mockTodos),
    listDeadlineApproaching: jest.fn(async () => mockApproaching),
  },
}))

import { Button, TaskCard } from '@/components'
import { AuditCenterScreen } from '@/screens/AuditCenterScreen'
import { BoardScreen } from '@/screens/BoardScreen'
import { TodayFocusScreen } from '@/screens/TodayFocusScreen'
import { WorkspaceScreen } from '@/screens/WorkspaceScreen'
import { REVIEW_ACTION_A11Y } from '@/utils/audit'

const A11Y = REVIEW_ACTION_A11Y
const MENU_A11Y = '切换状态'

const settle = (ms = 400): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** 合成审核任务（仅补齐渲染 / 筛选所需字段） */
function makeTask(partial: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'task-900',
    tenantId: 'tenant-001',
    projectId: 'project-001',
    parentId: null,
    title: '待审核：完成提报',
    description: null,
    status: 'in_progress',
    priority: 'medium',
    assigneeId: 'user-002',
    startAt: null,
    dueAt: null,
    endAt: null,
    estimatedHours: 2,
    actualHours: 2,
    completedAt: null,
    startedAt: null,
    createdBy: 'user-002',
    tags: [],
    sortOrder: 0,
    workflowColumnId: null,
    isAiGenerated: false,
    version: 1,
    source: 'published',
    submissionKind: null,
    submissionStatus: null,
    submissionNote: null,
    reviewNote: null,
    reviewRequired: false,
    isReviewTask: false,
    reviewerIds: [],
    reviewedBy: null,
    reviewedAt: null,
    createdAt: '2026-09-27T00:00:00.000Z',
    updatedAt: '2026-09-27T00:00:00.000Z',
    ...partial,
  }
}

/** 一条「待审核」主任务（manager 可审批 ⇒ 内联三枚审核动作开启） */
const mainTask = makeTask({
  id: 'task-900',
  title: '待审核：完成提报',
  submissionStatus: 'pending',
  reviewRequired: true,
  reviewerIds: ['user-001'],
})

/** 看板列（一条任务） */
function makeBoard(): unknown[] {
  return [
    {
      status: 'todo',
      label: '待办',
      color: '#6B7280',
      tasks: [makeTask({ id: 'board-task-1', title: '看板任务', status: 'todo', assigneeId: null })],
    },
    { status: 'in_progress', label: '进行中', color: '#6B7280', tasks: [] },
  ]
}

/** 按屏幕标识取待挂载的元素（`mockMode` 与之一致，决定 `useAsync` 数据形状） */
function elementFor(screen: 'audit' | 'board' | 'today' | 'workspace'): React.JSX.Element {
  if (screen === 'audit') return <AuditCenterScreen />
  if (screen === 'board') return <BoardScreen />
  if (screen === 'today') return <TodayFocusScreen />
  return <WorkspaceScreen />
}

/** 挂载指定屏幕并等待入场动画稳定 */
async function mount(
  screen: 'audit' | 'board' | 'today' | 'workspace',
): Promise<TestRenderer.ReactTestRenderer> {
  mockMode = screen
  let renderer!: TestRenderer.ReactTestRenderer
  await act(async () => {
    renderer = TestRenderer.create(elementFor(screen))
  })
  await act(async () => {
    await settle()
  })
  return renderer
}

/** 按无障碍标签取全部节点（合成组件 + 宿主节点均带同一 label） */
function findByLabel(
  renderer: TestRenderer.ReactTestRenderer,
  label: string,
): TestRenderer.ReactTestInstance[] {
  return renderer.root.findAll((node) => node.props?.accessibilityLabel === label)
}

/**
 * 是否「会被渲染为真实 `<button>` 的宿主节点」。
 *
 * 仅宿主节点（`type` 为字符串，如 `View`）会落到真实 DOM；合成组件（`PressableScale` 等）
 * 不产生 DOM 节点，故不计入 —— 否则 `PressableScale` 与其内部 `AnimatedPressable` 会被
 * 误判为嵌套。
 */
function isHostButton(node: TestRenderer.ReactTestInstance): boolean {
  return typeof node.type === 'string' && node.props?.accessibilityRole === 'button'
}

/** 全树宿主 button 节点 */
function hostButtons(
  scope: TestRenderer.ReactTestInstance,
): TestRenderer.ReactTestInstance[] {
  return scope.findAll(isHostButton)
}

/** 沿 parent 链上溯，收集「祖先中亦为宿主 button」的嵌套节点 */
function nestedHostButtons(
  renderer: TestRenderer.ReactTestRenderer,
): TestRenderer.ReactTestInstance[] {
  const nested: TestRenderer.ReactTestInstance[] = []
  for (const button of hostButtons(renderer.root)) {
    let parent = button.parent
    while (parent) {
      if (isHostButton(parent)) {
        nested.push(button)
        break
      }
      parent = parent.parent
    }
  }
  return nested
}

beforeEach(() => {
  mockMode = 'audit'
  mockRole = 'manager'
  mockAsyncCall = 0
  mockTasks = []
  mockStats = null
  mockBoard = []
  mockFocus.dueToday = []
  mockFocus.pendingReview = []
  mockFocus.approaching = []
  mockTodos = []
  mockApproaching = []
  mockUnread = 0
  mockSummary = null
})

describe('no-nested-buttons —— 审核中心待审核栏（内联三枚动作）', () => {
  it('NB-1 三枚审核按钮仍存在（回归守护），且不在卡片按钮节点子树内', async () => {
    mockRole = 'manager'
    mockTasks = [mainTask]
    const renderer = await mount('audit')

    // 回归守护：三枚动作仍在
    expect(findByLabel(renderer, A11Y.approve).length).toBeGreaterThan(0)
    expect(findByLabel(renderer, A11Y.reject).length).toBeGreaterThan(0)
    expect(findByLabel(renderer, A11Y.rework).length).toBeGreaterThan(0)

    // 每张任务卡片的按钮节点子树内，不得含三枚审核按钮中的任何一个
    const cards = renderer.root.findAllByType(TaskCard)
    expect(cards.length).toBeGreaterThan(0)
    for (const card of cards) {
      const [cardButton] = hostButtons(card)
      expect(cardButton).toBeDefined()
      for (const label of [A11Y.approve, A11Y.reject, A11Y.rework]) {
        expect(cardButton.findAll((n) => n.props?.accessibilityLabel === label)).toHaveLength(0)
      }
    }

    await act(async () => renderer.unmount())
  })

  it('NB-2 全树不存在「宿主 button 节点嵌套宿主 button 节点」', async () => {
    mockRole = 'manager'
    mockTasks = [mainTask]
    const renderer = await mount('audit')

    expect(nestedHostButtons(renderer)).toHaveLength(0)

    await act(async () => renderer.unmount())
  })
})

describe('no-nested-buttons —— 审核中心「审核」回退按钮（member + 可撤销提报）', () => {
  /**
   * 触发条件（`AuditCenterScreen.tsx:369-371` 的分支）：
   * - `canReview === false`（member ⇒ `actionsFor` 不含 `approve`/`reject`）；
   * - `isWithdrawable(task, 'user-001')` 为真：`submissionStatus === 'pending'` 且提报人 = `user-001`
   *   （`source='submission'` + `submissionKind='task'` ⇒ 分叉 `'task'` ⇒ 提报人 = `createdBy`）。
   * ⇒ `actions = ['withdraw']` ⇒ `showInlineAudit === false` 且 `actions.length > 0`
   * ⇒ 渲染回退分支 `<Button label="审核" variant="ghost" />`（此前的零覆盖路径）。
   */
  const fallbackTask = makeTask({
    id: 'task-901',
    title: '提报待审：新任务',
    source: 'submission',
    submissionKind: 'task',
    submissionStatus: 'pending',
    createdBy: 'user-001', // = useAuth mock 的 user id ⇒ isWithdrawable 为真
    status: 'todo',
    reviewRequired: false,
    isReviewTask: false,
    reviewerIds: [],
  })

  it('NB-5 回退分支渲染「审核」按钮（回归守护），不在卡片按钮子树内，且全树无嵌套', async () => {
    mockRole = 'member'
    mockTasks = [fallbackTask]
    const renderer = await mount('audit')

    // 1) 回退按钮存在（回归守护）：Button 组件 + 「审核」无障碍标签
    expect(renderer.root.findAllByType(Button).length).toBeGreaterThan(0)
    expect(findByLabel(renderer, '审核').length).toBeGreaterThan(0)

    // 2) 三枚内联审核按钮不存在 ⇒ 证明确实走的是回退分支，而非 showInlineAudit 分支
    expect(findByLabel(renderer, A11Y.approve)).toHaveLength(0)
    expect(findByLabel(renderer, A11Y.reject)).toHaveLength(0)
    expect(findByLabel(renderer, A11Y.rework)).toHaveLength(0)

    // 3) 回退按钮不在任何任务卡片的按钮节点子树内（⇒ 不产生 `<button>` 嵌套）
    const cards = renderer.root.findAllByType(TaskCard)
    expect(cards.length).toBeGreaterThan(0)
    for (const card of cards) {
      const [cardButton] = hostButtons(card)
      expect(cardButton).toBeDefined()
      expect(cardButton.findAllByType(Button)).toHaveLength(0)
    }

    // 4) 全树不存在「宿主 button 节点嵌套宿主 button 节点」
    expect(nestedHostButtons(renderer)).toHaveLength(0)

    await act(async () => renderer.unmount())
  })
})

describe('no-nested-buttons —— 看板任务卡片（切换状态入口）', () => {
  it('NB-3 「⋯」切换状态按钮仍存在（回归守护），且不在卡片按钮节点子树内', async () => {
    mockRole = 'manager'
    mockStats = {
      project: { id: 'project-001', name: '演示项目' },
      progress: 0.5,
      taskCount: 1,
      doneCount: 0,
      owner: null,
    }
    mockBoard = makeBoard()
    const renderer = await mount('board')

    // 回归守护：切换状态入口仍在
    expect(findByLabel(renderer, MENU_A11Y).length).toBeGreaterThan(0)

    const cards = renderer.root.findAllByType(TaskCard)
    expect(cards.length).toBeGreaterThan(0)
    for (const card of cards) {
      const [cardButton] = hostButtons(card)
      expect(cardButton).toBeDefined()
      expect(cardButton.findAll((n) => n.props?.accessibilityLabel === MENU_A11Y)).toHaveLength(0)
    }

    await act(async () => renderer.unmount())
  })

  it('NB-4 全树不存在「宿主 button 节点嵌套宿主 button 节点」', async () => {
    mockRole = 'manager'
    mockStats = {
      project: { id: 'project-001', name: '演示项目' },
      progress: 0.5,
      taskCount: 1,
      doneCount: 0,
      owner: null,
    }
    mockBoard = makeBoard()
    const renderer = await mount('board')

    expect(nestedHostButtons(renderer)).toHaveLength(0)

    await act(async () => renderer.unmount())
  })
})

describe('no-nested-buttons —— 今日聚焦任务卡片（全树无嵌套回归守护）', () => {
  it('NB-6 今日聚焦渲染任务卡片时，全树不存在「宿主 button 节点嵌套宿主 button 节点」', async () => {
    mockRole = 'manager'
    mockFocus.dueToday = [
      makeTask({ id: 'focus-task-1', title: '今日到期任务', status: 'todo', assigneeId: null }),
    ]
    const renderer = await mount('today')

    // 至少渲染一张任务卡片，断言才有意义（避免「哪里都没有」的假通过）
    expect(renderer.root.findAllByType(TaskCard).length).toBeGreaterThan(0)
    expect(nestedHostButtons(renderer)).toHaveLength(0)

    await act(async () => renderer.unmount())
  })
})

describe('no-nested-buttons —— 工作台「我的待办」卡片（全树无嵌套回归守护）', () => {
  it('NB-7 工作台渲染待办任务卡片时，全树不存在「宿主 button 节点嵌套宿主 button 节点」', async () => {
    mockRole = 'manager'
    mockTodos = [
      makeTask({ id: 'ws-task-1', title: '我的待办任务', status: 'todo', assigneeId: null }),
    ]
    const renderer = await mount('workspace')

    expect(renderer.root.findAllByType(TaskCard).length).toBeGreaterThan(0)
    expect(nestedHostButtons(renderer)).toHaveLength(0)

    await act(async () => renderer.unmount())
  })
})
