/**
 * 职责：今日聚焦「待我审核」分组 —— **卡片内联三枚审批按钮默认可见**（P0）与
 * **不产生 `<button>` 嵌套**（P1）的组件级验证。
 *
 * 背景（用户裁定）：原实现把三枚审批动作只放在 `SwipeableRow` 动作层里（需右滑才露出），
 * 卡片默认只显示「查看详情」，用户误以为「没有审核功能」。现要求：
 *  1. 「待我审核」分组卡片**默认可见**三枚按钮：通过 / 不通过 / 退回重改；
 *  2. 文案 / 语义色 / accessibilityLabel 对齐审核中心（`REVIEW_ACTION_LABEL` / `REVIEW_ACTION_A11Y`）；
 *  3. 通过 → `handleApprove`；不通过 → 抽屉 `action=reject/opinion=reject`；
 *     退回重改 → 抽屉 `action=reject/opinion=rework`；
 *  4. 保留 `canReview`（`review:view_pending`）门禁 —— 无权限不渲染；
 *  5. 右滑快操作**保留**；
 *  6. 三枚按钮**不得嵌套**在卡片 `Pressable` 内（原「查看详情」Button 的嵌套一并消除）。
 *
 * 覆盖：
 *  - **RA-1** manager「待我审核」→ 三枚按钮默认渲染（未右滑即存在），且右滑三动作仍在；
 *  - **RA-2** 三枚按钮不在任何 `TaskCard` 内部（⇒ 不在卡片 `Pressable` 内，无 `<button>` 嵌套）；
 *  - **RA-3** member（无 `review:view_pending`）→ 三枚按钮均不渲染；
 *  - **RA-4** 点「审核通过」⇒ `reviewSubmission(id, 'approve', version)`（复用 handleApprove）；
 *  - **RA-5** 点「审核不通过」⇒ 抽屉驳回口径 → 确认 ⇒ `reviewSubmission(..., 'reject', ..., 'reject')`；
 *  - **RA-6** 点「审核退回重改」⇒ 抽屉退回口径 → 确认 ⇒ `reviewSubmission(..., 'reject', ..., 'rework')`；
 *  - **RA-7** 「今日到期」分组不渲染任何审批按钮。
 *
 * 范式：`react-test-renderer` + `act` + `jest.mock`（仓库无 @testing-library/react-native）。
 * 依赖以 jest.mock 隔离（导航 / 安全区 / 角色 / hooks / services），渲染真实页面组件与真实纯函数。
 */
import TestRenderer, { act } from 'react-test-renderer'

let mockRole: 'manager' | 'member' = 'manager'

/** 兼具数组与三分组字段的空数据（`useAsync` 本页被调用两次，同一形状兼容二者） */
const mockFocus = Object.assign([] as unknown[], {
  dueToday: [] as unknown[],
  pendingReview: [] as unknown[],
  approaching: [] as unknown[],
})

/** 一条「待审核」任务（`submissionStatus=pending`，提交人 = user-002 李娜） */
const reviewTask = {
  id: 'task-901',
  tenantId: 'tenant-1',
  projectId: 'project-1',
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
  source: 'submission',
  submissionStatus: 'pending',
  submissionKind: 'task',
  submissionNote: null,
  reviewNote: null,
  reviewRequired: true,
  isReviewTask: false,
  reviewerIds: ['user-001'],
  reviewedBy: null,
  reviewedAt: null,
  createdAt: '2026-09-27T00:00:00.000Z',
  updatedAt: '2026-09-27T00:00:00.000Z',
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

import { Button, SegmentedControl, SwipeableRow, TaskCard, TextField } from '@/components'
import { taskService } from '@/services'
import { TodayFocusScreen } from '@/screens/TodayFocusScreen'
import { REVIEW_ACTION_A11Y, REVIEW_ACTION_LABEL } from '@/utils/audit'

/** 卡片三枚动作的 accessibilityLabel（与页面共用同一常量，避免测试漂移） */
const A11Y = REVIEW_ACTION_A11Y

const settle = (ms = 400): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

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

async function mount(): Promise<TestRenderer.ReactTestRenderer> {
  let renderer!: TestRenderer.ReactTestRenderer
  await act(async () => {
    renderer = TestRenderer.create(<TodayFocusScreen />)
  })
  await act(async () => {
    await settle()
  })
  return renderer
}

async function mountAndSwitch(
  tab: 'due' | 'review' | 'approaching',
): Promise<TestRenderer.ReactTestRenderer> {
  const renderer = await mount()
  await act(async () => {
    renderer.root.findAllByType(SegmentedControl)[0].props.onChange(tab)
  })
  await act(async () => {
    await settle()
  })
  return renderer
}

/** 按无障碍标签取全部节点（合成组件 + 宿主 View 各一，均带同一 label） */
function findByLabel(
  renderer: TestRenderer.ReactTestRenderer,
  label: string,
): TestRenderer.ReactTestInstance[] {
  return renderer.root.findAll((node) => node.props?.accessibilityLabel === label)
}

/** 触发带某无障碍标签的节点点击（取首个） */
async function pressByLabel(
  renderer: TestRenderer.ReactTestRenderer,
  label: string,
): Promise<void> {
  const [entry] = findByLabel(renderer, label)
  if (!entry) throw new Error(`未找到节点：${label}`)
  await act(async () => {
    ;(entry.props as { onPress: () => void }).onPress()
  })
  await act(async () => {
    await settle()
  })
}

/** 右滑行的 action key 列表（验证右滑快操作仍保留） */
function actionKeys(renderer: TestRenderer.ReactTestRenderer): string[] {
  return renderer.root
    .findAllByType(SwipeableRow)
    .flatMap((row) => (row.props.actions as { key: string }[]).map((action) => action.key))
}

/**
 * 某作用域内「带无障碍标签的交互按钮」——即真正会被渲染为 `<button>` 的元素。
 *
 * `Card` 自身的 `Pressable` 仅有 `accessibilityRole="button"`、**无** accessibilityLabel，
 * 故不计入；据此可在 `TaskCard` 作用域内检出「嵌套的交互按钮」。
 */
function labeledButtons(scope: TestRenderer.ReactTestInstance): TestRenderer.ReactTestInstance[] {
  return scope.findAll(
    (node) =>
      node.props?.accessibilityRole === 'button' &&
      typeof node.props?.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.length > 0,
  )
}

/** 打开抽屉 → 填写原因 → 点确认提交（确认文案随裁定口径：驳回='确认驳回' / 退回重改='确认退回'） */
async function submitDrawer(
  renderer: TestRenderer.ReactTestRenderer,
  opinion: 'reject' | 'rework',
  reason: string,
): Promise<void> {
  const field = renderer.root.findAllByType(TextField)[0]
  if (!field) throw new Error('未找到原因输入框')
  await act(async () => {
    field.props.onChangeText(reason)
  })
  await act(async () => {
    await settle()
  })
  const confirmLabel = opinion === 'rework' ? '确认退回' : '确认驳回'
  const confirm = renderer.root
    .findAllByType(Button)
    .find((item) => item.props.label === confirmLabel)
  if (!confirm) throw new Error(`未找到确认按钮：${confirmLabel}`)
  await act(async () => {
    confirm.props.onPress()
  })
  await act(async () => {
    await settle()
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockRole = 'manager'
  mockFocus.dueToday = []
  mockFocus.pendingReview = []
  mockFocus.approaching = []
})

describe('TodayFocusScreen —— RA-1 三枚审批按钮默认可见（无需右滑）', () => {
  it('manager「待我审核」→ 三枚按钮（审核通过 / 审核不通过 / 审核退回重改）默认渲染，且右滑三动作仍在', async () => {
    mockRole = 'manager'
    mockFocus.pendingReview = [reviewTask]
    const renderer = await mountAndSwitch('review')

    // 未触发任何右滑，三枚按钮即已存在（默认可见）
    expect(findByLabel(renderer, A11Y.approve).length).toBeGreaterThan(0)
    expect(findByLabel(renderer, A11Y.reject).length).toBeGreaterThan(0)
    expect(findByLabel(renderer, A11Y.rework).length).toBeGreaterThan(0)

    // 显示文案与审核中心一致
    const text = collectText(renderer.toJSON())
    expect(text).toContain(REVIEW_ACTION_LABEL.approve)
    expect(text).toContain(REVIEW_ACTION_LABEL.reject)
    expect(text).toContain(REVIEW_ACTION_LABEL.rework)

    // 右滑快操作保留
    expect(actionKeys(renderer)).toEqual(['approve', 'reject', 'rework'])

    await act(async () => renderer.unmount())
  })
})

describe('TodayFocusScreen —— RA-2 无 <button> 嵌套（三枚按钮不在卡片 Pressable 内）', () => {
  it('三枚按钮不落在任何 TaskCard 内部 ⇒ 不在卡片 Pressable 内；卡片内亦无带标签的交互按钮', async () => {
    mockRole = 'manager'
    mockFocus.pendingReview = [reviewTask]
    const renderer = await mountAndSwitch('review')

    const cards = renderer.root.findAllByType(TaskCard)
    expect(cards.length).toBeGreaterThan(0)

    // 卡片作用域内不得出现任何「带无障碍标签的交互按钮」（原「查看详情」Button 已消除）
    for (const card of cards) {
      expect(labeledButtons(card)).toHaveLength(0)
      // 三枚审批按钮也不属于卡片子树（它们在卡片之外、SwipeableRow 之外）
      expect(card.findAll((n) => n.props?.accessibilityLabel === A11Y.approve)).toHaveLength(0)
      expect(card.findAll((n) => n.props?.accessibilityLabel === A11Y.reject)).toHaveLength(0)
      expect(card.findAll((n) => n.props?.accessibilityLabel === A11Y.rework)).toHaveLength(0)
    }

    // 但三枚按钮确实存在于整棵树中（对照，避免「哪里都没有」的假通过）
    expect(findByLabel(renderer, A11Y.approve).length).toBeGreaterThan(0)

    await act(async () => renderer.unmount())
  })
})

describe('TodayFocusScreen —— RA-3 权限门禁（无 review:view_pending 不渲染）', () => {
  it('member 强制进入 review 分组 → 三枚按钮均不渲染', async () => {
    mockRole = 'member'
    mockFocus.pendingReview = [reviewTask]
    const renderer = await mountAndSwitch('review')

    expect(findByLabel(renderer, A11Y.approve)).toHaveLength(0)
    expect(findByLabel(renderer, A11Y.reject)).toHaveLength(0)
    expect(findByLabel(renderer, A11Y.rework)).toHaveLength(0)
    // 无权限时分组回落「今日到期」
    expect(collectText(renderer.toJSON())).not.toContain('待我审核')

    await act(async () => renderer.unmount())
  })
})

describe('TodayFocusScreen —— RA-4/5/6 三枚按钮行为分支', () => {
  it('点「审核通过」⇒ reviewSubmission(id, approve, version)', async () => {
    mockRole = 'manager'
    mockFocus.pendingReview = [reviewTask]
    const renderer = await mountAndSwitch('review')

    await pressByLabel(renderer, A11Y.approve)

    expect(taskService.reviewSubmission).toHaveBeenCalledTimes(1)
    expect(taskService.reviewSubmission).toHaveBeenCalledWith('task-901', 'approve', 1)

    await act(async () => renderer.unmount())
  })

  it('点「审核不通过」⇒ 抽屉驳回口径 → 确认 ⇒ reviewSubmission(action=reject, opinion=reject)', async () => {
    mockRole = 'manager'
    mockFocus.pendingReview = [reviewTask]
    const renderer = await mountAndSwitch('review')

    await pressByLabel(renderer, A11Y.reject)
    const text = collectText(renderer.toJSON())
    expect(text).toContain('驳回完成提报')
    expect(text).toContain('确认驳回')

    await submitDrawer(renderer, 'reject', '验收标准未达成')

    expect(taskService.reviewSubmission).toHaveBeenCalledTimes(1)
    expect(taskService.reviewSubmission).toHaveBeenCalledWith(
      'task-901',
      'reject',
      1,
      '验收标准未达成',
      undefined,
      'reject',
    )

    await act(async () => renderer.unmount())
  })

  it('点「审核退回重改」⇒ 抽屉退回口径 → 确认 ⇒ reviewSubmission(action=reject, opinion=rework)', async () => {
    mockRole = 'manager'
    mockFocus.pendingReview = [reviewTask]
    const renderer = await mountAndSwitch('review')

    await pressByLabel(renderer, A11Y.rework)
    const text = collectText(renderer.toJSON())
    expect(text).toContain('确认退回')

    await submitDrawer(renderer, 'rework', '请补充验收截图')

    expect(taskService.reviewSubmission).toHaveBeenCalledTimes(1)
    expect(taskService.reviewSubmission).toHaveBeenCalledWith(
      'task-901',
      'reject',
      1,
      '请补充验收截图',
      undefined,
      'rework',
    )

    await act(async () => renderer.unmount())
  })
})

describe('TodayFocusScreen —— RA-7 非审核分组不渲染审批按钮', () => {
  it('manager「今日到期」分组 → 无任何审批按钮', async () => {
    mockRole = 'manager'
    mockFocus.dueToday = [{ ...reviewTask, id: 'task-todo', title: '待办任务', status: 'todo' }]
    const renderer = await mountAndSwitch('due')

    expect(findByLabel(renderer, A11Y.approve)).toHaveLength(0)
    expect(findByLabel(renderer, A11Y.reject)).toHaveLength(0)
    expect(findByLabel(renderer, A11Y.rework)).toHaveLength(0)

    await act(async () => renderer.unmount())
  })
})
