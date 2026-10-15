/**
 * 职责：增量 2 —— **K9 / AC-09 组件级承载面验证**（QA 独立新增，不改既有套件）。
 *
 * 验证「`TaskCard.footer` 只服务『待我审核』分组」：
 *  - `due` / `approaching` 分组**不得**出现分叉标签与提交人副文案（K9）；
 *  - `review` 分组两类条目（完成提报 / 新事项提报）标签与提交人**均可区分**（AC-09）。
 *
 * 手法与既有 `today-focus-gate.test.tsx` 一致：渲染真实页面组件，仅 mock 导航 / 安全区 /
 * 权限上下文 / hooks / service；**不 mock** `@/data`，以便验证真实 `userMap()` 的姓名解析。
 */
import TestRenderer, { act } from 'react-test-renderer'

let mockRole: 'manager' | 'member' = 'manager'

const mockFocus = Object.assign([] as unknown[], {
  dueToday: [] as unknown[],
  pendingReview: [] as unknown[],
  approaching: [] as unknown[],
})

/** 任务基底（字段完整，满足 Task 接口） */
const taskBase = {
  tenantId: 'tenant-1',
  projectId: 'project-1',
  parentId: null,
  description: null,
  priority: 'medium',
  startAt: null,
  dueAt: null,
  endAt: null,
  estimatedHours: 2,
  actualHours: 2,
  startedAt: null,
  tags: [],
  sortOrder: 0,
  workflowColumnId: null,
  isAiGenerated: false,
  version: 1,
  submissionNote: null,
  reviewNote: null,
  isReviewTask: false,
  reviewedBy: null,
  reviewedAt: null,
  createdAt: '2026-09-27T00:00:00.000Z',
  updatedAt: '2026-09-27T00:00:00.000Z',
} as const

/** 完成提报条目（`completeTask` 产物：status='done'，source 保持 published，无 submissionKind） */
const completionTask = {
  ...taskBase,
  id: 'task-902',
  title: '原型完成提报A',
  status: 'done',
  assigneeId: 'user-002', // 李娜（完成人）
  createdBy: 'user-002',
  completedAt: '2026-09-27T10:00:00.000Z',
  source: 'published',
  submissionKind: null,
  submissionStatus: 'pending',
  reviewRequired: true,
  reviewerIds: ['user-001'],
}

/** 新事项提报条目（submissionKind='task'） */
const newItemTask = {
  ...taskBase,
  id: 'task-903',
  title: '日志导出新任务提报B',
  status: 'todo',
  assigneeId: null,
  createdBy: 'user-003', // 王强（提报人）
  completedAt: null,
  source: 'submission',
  submissionKind: 'task',
  submissionStatus: 'pending',
  reviewRequired: true,
  reviewerIds: ['user-001'],
}

/** 一条普通「今日到期」任务（非审核场景） */
const dueTask = {
  ...taskBase,
  id: 'task-904',
  title: '今日到期任务C',
  status: 'in_progress',
  assigneeId: 'user-002',
  createdBy: 'user-002',
  completedAt: null,
  submissionStatus: null,
  reviewRequired: false,
  reviewerIds: [],
}

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }))

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
  useAppContext: () => ({
    pushOptimistic: () => 'opt-1',
    rollbackOptimistic: () => undefined,
    commitOptimistic: () => undefined,
  }),
  useAsync: () => ({
    data: mockFocus,
    loading: false,
    error: null,
    refetch: async () => undefined,
    retry: async () => undefined,
    setData: () => undefined,
  }),
}))

jest.mock('@/services', () => ({
  focusService: {
    getTodayFocus: jest.fn(async () => ({ dueToday: [], pendingReview: [], approaching: [] })),
    listAiProposals: jest.fn(async () => []),
    approveAiProposal: jest.fn(async () => undefined),
    rejectAiProposal: jest.fn(async () => undefined),
  },
  taskService: {
    claimTask: jest.fn(async () => undefined),
    completeTask: jest.fn(async () => undefined),
    reviewSubmission: jest.fn(async () => undefined),
    undoCompletion: jest.fn(async () => undefined),
  },
}))

import { SegmentedControl } from '@/components'
import { TodayFocusScreen } from '@/screens/TodayFocusScreen'

const settle = (ms = 400): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function collectText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(collectText).join('')
  const obj = node as { children?: unknown; props?: { children?: unknown } }
  const kids = obj.children ?? obj.props?.children
  return kids == null ? '' : collectText(kids)
}

async function mountAndSwitch(tab: 'due' | 'review' | 'approaching'): Promise<TestRenderer.ReactTestRenderer> {
  let renderer!: TestRenderer.ReactTestRenderer
  await act(async () => {
    renderer = TestRenderer.create(<TodayFocusScreen />)
  })
  await act(async () => {
    await settle()
  })
  await act(async () => {
    renderer.root.findAllByType(SegmentedControl)[0].props.onChange(tab)
  })
  await act(async () => {
    await settle()
  })
  return renderer
}

beforeEach(() => {
  mockRole = 'manager'
  mockFocus.dueToday = []
  mockFocus.pendingReview = []
  mockFocus.approaching = []
})

describe('K9 —— footer 只出现在「待我审核」分组', () => {
  it('due 分组：即使任务带 pending 审核态，也不渲染「完成待审」标签与提交人副文案', async () => {
    mockFocus.dueToday = [dueTask, completionTask]
    const renderer = await mountAndSwitch('due')
    const text = collectText(renderer.toJSON())

    expect(text).toContain('今日到期任务C')
    expect(text).toContain('原型完成提报A')
    expect(text).not.toContain('完成待审')
    expect(text).not.toContain('提交了完成提报')
    await act(async () => renderer.unmount())
  })

  it('approaching 分组：同样不渲染 footer', async () => {
    mockFocus.approaching = [completionTask]
    const renderer = await mountAndSwitch('approaching')
    const text = collectText(renderer.toJSON())

    expect(text).toContain('原型完成提报A')
    expect(text).not.toContain('完成待审')
    expect(text).not.toContain('提交了完成提报')
    await act(async () => renderer.unmount())
  })
})

describe('AC-09 —— review 分组两类条目可区分', () => {
  it('两类条目同屏：完成提报显示「完成待审 + 李娜 提交了完成提报」；新事项提报显示「提报待审 · 新任务 + 王强 提报了新任务」', async () => {
    mockFocus.pendingReview = [completionTask, newItemTask]
    const renderer = await mountAndSwitch('review')
    const text = collectText(renderer.toJSON())

    // 完成提报分支
    expect(text).toContain('完成待审')
    expect(text).toContain('提交了完成提报')
    expect(text).toContain('李娜') // assigneeId=user-002 → 姓名解析自真实 userMap()
    // 新事项提报分支
    expect(text).toContain('提报待审 · 新任务')
    expect(text).toContain('提报了新任务')
    expect(text).toContain('王强') // createdBy=user-003
    // 两类条目同屏共存，无崩溃
    expect(text).toContain('原型完成提报A')
    expect(text).toContain('日志导出新任务提报B')
    await act(async () => renderer.unmount())
  })

  it('member 角色：review 分组不可见 ⇒ 分叉标签不泄露', async () => {
    mockRole = 'member'
    mockFocus.pendingReview = [completionTask, newItemTask]
    const renderer = await mountAndSwitch('review')
    const text = collectText(renderer.toJSON())

    expect(text).not.toContain('完成待审')
    expect(text).not.toContain('提报待审 · 新任务')
    await act(async () => renderer.unmount())
  })
})
