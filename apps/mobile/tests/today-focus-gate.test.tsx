/**
 * 职责：今日聚焦「待我审核」分组的**权限门禁 + 三裁定**组件级验证（DEF-01 / PRD §3 / M2-P0-01）。
 *
 * 背景：`review:view_pending` 仅 `manager` 具备。member 角色下「待我审核」分组、
 * 右滑审批动作、「查看详情」入口均须**隐藏**（隐藏而非置灰）。
 *
 * 本用例渲染真实页面组件（react-test-renderer），覆盖四层：
 *  1. 静态渲染：member 不含「待我审核」分组；manager 含；
 *  2. **manager 回归红线**：manager 切到「待我审核」分组后，右滑**三裁定**
 *     （通过 / 驳回 / 退回重改）与「查看详情」入口**仍然可用**；
 *  3. **残留状态防护**：manager 处于「待我审核」时切角色到 member，分组与审批动作
 *     **即时消失**并回落「今日到期」（兜底 effect + buildActions 门禁）；
 *  4. **三裁定口径**：「退回重改」与「驳回」**共用** `action='reject'`，仅靠第 6 参数
 *     `opinion` 区分（`'rework'` / `'reject'`），并验证二次操作不残留上次意见。
 *
 * 注：审批动作以 `SwipeableRow.props.actions` 断言（「驳回」文案亦出现在隐藏的驳回
 * 抽屉中，纯文本匹配会误判，故以 actions 数组为准）。
 *
 * 依赖以 jest.mock 隔离（导航 / 安全区 / 权限 / hooks / service），只验证门禁与提交行为。
 */
import TestRenderer, { act } from 'react-test-renderer'

let mockRole: 'manager' | 'member' = 'member'

/**
 * 兼具数组与三分组字段的空数据：
 * - `useAsync` 被本页调用两次（聚焦数据 / AI 提议），测试以同一形状兼容二者
 *   （数组长度恒为 0，故 `pendingProposals` 视为空，不渲染 AI 提议区块）。
 * - 各分组字段可在用例内改写以构造「有待审任务」场景。
 */
const mockFocus = Object.assign([] as unknown[], {
  dueToday: [] as unknown[],
  pendingReview: [] as unknown[],
  approaching: [] as unknown[],
})

/** 一条「待审核」任务（`in_progress` + `submissionStatus=pending`），用于驱动审批动作渲染 */
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

import { Button, SegmentedControl, SwipeableRow, TextField } from '@/components'
import { taskService } from '@/services'
import { TodayFocusScreen } from '@/screens/TodayFocusScreen'

/** 让 FadeIn 的入场定时器（含 ≤200ms 错峰延迟）在测试环境内完成，避免卸载后残留计时器触发 Animated 原生调用 */
const settle = (ms = 400): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** 递归拼接渲染树中的全部文本（数字子节点也还原为字符串，避免「共 N 项」被 JSON 拆开） */
function collectText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(collectText).join('')
  const obj = node as { children?: unknown; props?: { children?: unknown } }
  const kids = obj.children ?? obj.props?.children
  return kids == null ? '' : collectText(kids)
}

/** 挂载页面并等待入场动画稳定 */
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

/** 挂载页面并切到指定分组 */
async function mountAndSwitch(tab: 'due' | 'review' | 'approaching'): Promise<TestRenderer.ReactTestRenderer> {
  const renderer = await mount()
  await act(async () => {
    renderer.root.findAllByType(SegmentedControl)[0].props.onChange(tab)
  })
  await act(async () => {
    await settle()
  })
  return renderer
}

/** 读取当前渲染树中所有右滑行的 action key */
function actionKeys(renderer: TestRenderer.ReactTestRenderer): string[] {
  return renderer.root
    .findAllByType(SwipeableRow)
    .flatMap((row) => (row.props.actions as { key: string }[]).map((action) => action.key))
}

/** 渲染树中的右滑动作（含 onPress），按行扁平化 */
interface RenderedAction {
  key: string
  label: string
  tone: string
  onPress: () => void
}

/** 读取全部右滑动作（含 key / label / tone / onPress） */
function allActions(renderer: TestRenderer.ReactTestRenderer): RenderedAction[] {
  return renderer.root
    .findAllByType(SwipeableRow)
    .flatMap((row) => row.props.actions as RenderedAction[])
}

/** 触发指定 key 的右滑动作（模拟点击），并等待抽屉开启动画稳定 */
async function pressAction(renderer: TestRenderer.ReactTestRenderer, key: string): Promise<void> {
  const action = allActions(renderer).find((item) => item.key === key)
  if (!action) throw new Error(`未找到右滑动作：${key}`)
  await act(async () => {
    action.onPress()
  })
  await act(async () => {
    await settle()
  })
}

/**
 * 打开驳回 / 退回重改抽屉 → 填写原因 → 点击确认提交。
 * 确认按钮文案随裁定口径变化（驳回='确认驳回' / 退回重改='确认退回'）。
 */
async function submitReviewFlow(
  renderer: TestRenderer.ReactTestRenderer,
  actionKey: 'reject' | 'rework',
  reason: string,
): Promise<void> {
  await pressAction(renderer, actionKey)
  const field = renderer.root.findAllByType(TextField)[0]
  if (!field) throw new Error('未找到驳回原因输入框')
  await act(async () => {
    field.props.onChangeText(reason)
  })
  await act(async () => {
    await settle()
  })
  const confirmLabel = actionKey === 'rework' ? '确认退回' : '确认驳回'
  const confirm = renderer.root.findAllByType(Button).find((item) => item.props.label === confirmLabel)
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
  mockRole = 'member'
  mockFocus.dueToday = []
  mockFocus.pendingReview = []
  mockFocus.approaching = []
})

describe('TodayFocusScreen —— 「待我审核」分组权限门禁', () => {
  it('member（无 review:view_pending）→ 不渲染「待我审核」分组，保留「今日到期」「临期预警」', async () => {
    mockRole = 'member'
    const renderer = await mount()
    const text = collectText(renderer.toJSON())
    expect(text).not.toContain('待我审核')
    expect(text).toContain('今日到期')
    expect(text).toContain('临期预警')
    await act(async () => renderer.unmount())
  })

  it('manager（具备 review:view_pending）→ 渲染「待我审核」分组', async () => {
    mockRole = 'manager'
    const renderer = await mount()
    const text = collectText(renderer.toJSON())
    expect(text).toContain('待我审核')
    expect(text).toContain('今日到期')
    expect(text).toContain('临期预警')
    await act(async () => renderer.unmount())
  })

  it('member 即使存在待审数据，也不渲染「待我审核」分组，且头部汇总不计入待审', async () => {
    mockRole = 'member'
    mockFocus.pendingReview = [reviewTask]
    const renderer = await mount()
    const text = collectText(renderer.toJSON())
    expect(text).not.toContain('待我审核')
    expect(text).not.toContain('待审核：完成提报') // 待审任务不泄露到 member
    expect(text).toContain('共 0 项待处理') // visibleTotal 排除 review（due+approaching=0）
    await act(async () => renderer.unmount())
  })
})

describe('TodayFocusScreen —— manager 审批能力回归（防止加门禁误伤 manager）', () => {
  it('manager 切到「待我审核」→ 渲染右滑三裁定（通过 / 驳回 / 退回重改）与「查看详情」入口', async () => {
    mockRole = 'manager'
    mockFocus.pendingReview = [reviewTask]
    const renderer = await mountAndSwitch('review')
    const text = collectText(renderer.toJSON())
    expect(text).toContain('待我审核')
    expect(text).toContain('待审核：完成提报') // 待审任务可见
    expect(text).toContain('查看详情') // 右注入口
    expect(text).toContain('共 1 项待处理') // visibleTotal 含 review
    // 右滑审批动作为三裁定，顺序与语义色固定：通过(success) / 驳回(danger) / 退回重改(warning)
    const actions = allActions(renderer)
    expect(actions.map((action) => action.key)).toEqual(['approve', 'reject', 'rework'])
    expect(actions.map((action) => action.label)).toEqual(['通过', '驳回', '退回重改'])
    expect(actions.map((action) => action.tone)).toEqual(['success', 'danger', 'warning'])
    await act(async () => renderer.unmount())
  })
})

describe('TodayFocusScreen —— 三裁定口径（驳回 / 退回重改 共用 action=reject，靠 opinion 区分）', () => {
  it('点「退回重改」→ 抽屉切到退回口径 → 填原因确认 → reviewSubmission(action=reject, opinion=rework)', async () => {
    mockRole = 'manager'
    mockFocus.pendingReview = [reviewTask]
    const renderer = await mountAndSwitch('review')

    await pressAction(renderer, 'rework')
    // 抽屉以「退回重改」口径渲染（标题 / 提示 / 输入框标签 / 按钮文案）
    const text = collectText(renderer.toJSON())
    expect(text).toContain('退回重改')
    expect(text).toContain('退回原因')
    expect(text).toContain('退回重改原因')
    expect(text).toContain('确认退回')

    await submitReviewFlow(renderer, 'rework', '请补充验收截图')
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

  it('点「驳回」→ 抽屉切到驳回口径 → 填原因确认 → reviewSubmission(action=reject, opinion=reject)（对照组）', async () => {
    mockRole = 'manager'
    mockFocus.pendingReview = [reviewTask]
    const renderer = await mountAndSwitch('review')

    await pressAction(renderer, 'reject')
    const text = collectText(renderer.toJSON())
    expect(text).toContain('驳回完成提报')
    expect(text).toContain('驳回原因')
    expect(text).toContain('确认驳回')

    await submitReviewFlow(renderer, 'reject', '验收标准未达成')
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

  it('先「退回重改」再「驳回」→ 第二次 opinion 为 reject（防 rejectOpinion 残留污染）', async () => {
    mockRole = 'manager'
    mockFocus.pendingReview = [reviewTask]
    const renderer = await mountAndSwitch('review')

    // 第一次：退回重改（提交后抽屉关闭、opinion 复位）
    await submitReviewFlow(renderer, 'rework', '请补充验收截图')
    expect(taskService.reviewSubmission).toHaveBeenLastCalledWith(
      'task-901',
      'reject',
      1,
      '请补充验收截图',
      undefined,
      'rework',
    )

    // 第二次：驳回 —— 不得沿用上一次的 'rework'
    await submitReviewFlow(renderer, 'reject', '验收标准未达成')
    expect(taskService.reviewSubmission).toHaveBeenCalledTimes(2)
    expect(taskService.reviewSubmission).toHaveBeenLastCalledWith(
      'task-901',
      'reject',
      1,
      '验收标准未达成',
      undefined,
      'reject',
    )
    await act(async () => renderer.unmount())
  })
})

describe('TodayFocusScreen —— 切角色残留状态防护（DEF-01 兜底）', () => {
  it('manager 处于「待我审核」时切到 member → 分组与审批动作即时消失并回落「今日到期」', async () => {
    mockRole = 'manager'
    mockFocus.pendingReview = [reviewTask]

    const renderer = await mountAndSwitch('review')
    // 前置：manager 可见审批动作
    expect(actionKeys(renderer)).toContain('reject')
    expect(actionKeys(renderer)).toContain('rework')

    // 切角色 → member（AppProvider.role 变化触发重渲染）
    mockRole = 'member'
    await act(async () => {
      renderer.update(<TodayFocusScreen />)
    })
    await act(async () => {
      await settle()
    })

    const text = collectText(renderer.toJSON())
    expect(text).not.toContain('待我审核')
    expect(text).not.toContain('待审核：完成提报') // 待审任务不再展示
    expect(text).not.toContain('查看详情')
    // 无任何右滑审批动作
    expect(actionKeys(renderer)).toHaveLength(0)
    // 兜底 effect：回落「今日到期」（dueToday 空 → 空态文案）
    expect(text).toContain('今天没有到期任务')

    await act(async () => renderer.unmount())
  })

  it('member 被强制置于 review 分组（防御性）→ 无任何审批动作，回落「今日到期」', async () => {
    mockRole = 'member'
    mockFocus.pendingReview = [reviewTask]
    // 直接调用 onChange('review') 模拟残留状态（member 选项本不含 review）
    const renderer = await mountAndSwitch('review')
    const text = collectText(renderer.toJSON())
    expect(text).not.toContain('待我审核')
    expect(text).not.toContain('查看详情')
    expect(actionKeys(renderer)).toHaveLength(0)
    expect(text).toContain('今天没有到期任务')
    await act(async () => renderer.unmount())
  })
})

describe('TodayFocusScreen —— 边界：失败路径 / 失权清理 / 非审核分组', () => {
  it('「退回重改」提交失败 → 抽屉保持打开且仍为退回口径 → 再次确认仍以 opinion=rework 提交', async () => {
    mockRole = 'manager'
    mockFocus.pendingReview = [reviewTask]
    const reviewSubmission = taskService.reviewSubmission as unknown as jest.Mock
    // 首次提交失败（网络异常），抽屉不得关闭、opinion 不得被复位成驳回
    reviewSubmission.mockRejectedValueOnce(new Error('网络异常'))

    const renderer = await mountAndSwitch('review')
    await pressAction(renderer, 'rework')
    const field = renderer.root.findAllByType(TextField)[0]
    await act(async () => {
      field.props.onChangeText('请补充验收截图')
    })
    const findConfirm = (): TestRenderer.ReactTestInstance | undefined =>
      renderer.root.findAllByType(Button).find((item) => item.props.label === '确认退回')

    await act(async () => {
      findConfirm()?.props.onPress()
    })
    await act(async () => {
      await settle()
    })

    // 失败后：抽屉未关闭，文案仍为「退回重改」口径（未被翻成「驳回」）
    expect(collectText(renderer.toJSON())).toContain('确认退回')
    expect(reviewSubmission).toHaveBeenCalledTimes(1)
    expect(reviewSubmission).toHaveBeenLastCalledWith(
      'task-901',
      'reject',
      1,
      '请补充验收截图',
      undefined,
      'rework',
    )

    // 直接重试（不重新打开抽屉）→ 沿用同一 opinion='rework'
    await act(async () => {
      findConfirm()?.props.onPress()
    })
    await act(async () => {
      await settle()
    })
    expect(reviewSubmission).toHaveBeenCalledTimes(2)
    expect(reviewSubmission).toHaveBeenLastCalledWith(
      'task-901',
      'reject',
      1,
      '请补充验收截图',
      undefined,
      'rework',
    )
    await act(async () => renderer.unmount())
  })

  it('manager 打开「退回重改」抽屉后失权 → 抽屉即时关闭并回落「今日到期」', async () => {
    mockRole = 'manager'
    mockFocus.pendingReview = [reviewTask]
    const renderer = await mountAndSwitch('review')
    await pressAction(renderer, 'rework')
    expect(collectText(renderer.toJSON())).toContain('确认退回') // 抽屉已打开

    // 失权：manager → member，兜底 effect 必须清理 rejectTarget（抽屉关闭）
    mockRole = 'member'
    await act(async () => {
      renderer.update(<TodayFocusScreen />)
    })
    await act(async () => {
      await settle()
    })

    const text = collectText(renderer.toJSON())
    expect(text).not.toContain('确认退回') // 抽屉随失权关闭
    expect(text).not.toContain('待我审核')
    expect(text).toContain('今天没有到期任务') // 回落「今日到期」
    expect(actionKeys(renderer)).toHaveLength(0)
    await act(async () => renderer.unmount())
  })

  it('manager 在「今日到期」分组 → 仅渲染「承接」/「完成」，绝不出现审批三动作', async () => {
    mockRole = 'manager'
    const todoTask = { ...reviewTask, id: 'task-todo', title: '待办任务', status: 'todo' }
    const doingTask = { ...reviewTask, id: 'task-doing', title: '进行中任务', status: 'in_progress' }
    mockFocus.dueToday = [todoTask, doingTask]
    const renderer = await mount() // 默认 due 分组

    const keys = actionKeys(renderer)
    expect(keys).toEqual(['claim', 'complete']) // 顺序与「完成/承接」口径固定
    expect(keys).not.toContain('approve')
    expect(keys).not.toContain('reject')
    expect(keys).not.toContain('rework')

    const text = collectText(renderer.toJSON())
    expect(text).not.toContain('退回重改')
    expect(text).not.toContain('查看详情') // 审核专属入口不得出现在 due 分组
    await act(async () => renderer.unmount())
  })
})
