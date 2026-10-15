/**
 * 职责：审核中心（`AuditCenterScreen`）**组件级渲染**验证（增量 7.1 · 分类 T，补 §6-T03 欠账；
 * 本次随「待审核栏卡片右侧三枚双色柔和按钮动作（三者均开抽屉）」改造同步迁移 + 补测）。
 *
 * 需求变更（用户裁定）：卡片动作由 2 个改为 3 个，且**三个都打开抽屉**（「通过」不再直过）：
 *  - 通过     → action=`approve` / opinion=`agree`  / 配色 success（浅绿底 `successFaint`）；
 *  - 不通过   → action=`reject`  / opinion=`reject` / 配色 danger （浅红底 `dangerFaint`）；
 *  - 退回重改 → action=`reject`  / opinion=`rework` / 配色 warning（浅琥珀底 `warningFaint`）。
 * 抽屉「提交审核」仍是**唯一提交入口**（原因字数 / `canApproveMainTask` 两道前置校验不变）。
 *
 * 覆盖（ARCH §2.6 分类 T + 三色柔和按钮动作改造）：
 *  - **T-1** 四栏标题与顺序（待提报 / 待审核 / 审核通过 / 撤回审核）；
 *  - **T-2** 权限门禁：manager 渲染三枚柔和按钮（着色取 `colors.success` / `danger` / `warning`）；
 *    非 manager（`review:view_pending === false`）**不渲染**（任务仍只读可见）；
 *  - **T-3** 空态文案随栏位（`EMPTY_TEXT`）；
 *  - **T-4a** （原「直过门禁」重构）点「审核通过」⇒ 抽屉打开且预置 (approve, agree)；评审子任务未
 *    `done` ⇒ 抽屉内「提交审核」禁用 + 显示「评审子任务尚未完成，暂不可通过」；对照组（移除未完成
 *    子任务）⇒ 放行；
 *  - **T-4b** 抽屉内切回 `approve` 门禁：点「审核不通过」开抽屉 ⇒ 切回 `approve` ⇒ 同上门禁；
 *  - **N-1** 通过 happy path（全链路）：点「审核通过」→ 抽屉 → 点「提交审核」⇒ `submitAudit` 恰一次
 *    且 `action='approve'`、`opinion='agree'`；
 *  - **N-2** 三个卡片动作各自预置正确的 (action, opinion)：approve/agree、reject/reject、reject/rework；
 *  - **N-3** `submitting` 期间抽屉「提交审核」禁用，且重复点击不产生第二次提交；
 *  - **N-4** 撤回仍可达：manager 兼提报人 ⇒ 抽屉内动作选项**仍含** `withdraw`（钉住非回归）；
 *  - **N-5** 非「待审核」栏（「待提报」）**不渲染**三枚动作按钮（防越界渲染）；
 *  - **N-6** 卡片动作「显示文案」与「accessibilityLabel」分离（前缀「审核」避免与抽屉选项同名）；
 *  - **B-1** / **B-2** / **B-3** 三枚动作容器配色：`successFaint`+`success` / `dangerFaint`+`danger`
 *    / `warningFaint`+`warning`（均取自 tokens，不硬编码色值）；
 *  - **B-4** 三枚动作均为「按钮」形态：`borderWidth === 1` 且 `borderRadius === radius.control`；
 *  - **B-5** tokens 新增浅底键 `successFaint` / `dangerFaint` / `warningFaint` 存在且非空（防误删）。
 *
 * 范式：`react-test-renderer` + `act` + `jest.mock`（仓库**无** `@testing-library/react-native`，
 * 不为此新增依赖），照抄 `tests/project-list-fab.test.tsx` / `tests/bugfix-root-stack-back.test.tsx`。
 *
 * 依赖以 jest.mock 隔离（导航 / 安全区 / 角色 / hooks / services），渲染**真实**组件与真实四栏筛选纯函数。
 */
import TestRenderer, { act } from 'react-test-renderer'
import { StyleSheet, Text } from 'react-native'

let mockRole: 'manager' | 'member' = 'manager'
/** 本页 `useAsync` 的数据源（`auditService.listAuditTasks` 结果） */
let mockTasks: unknown[] = []
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
    data: mockTasks,
    loading: false,
    error: null,
    refetch: async () => undefined,
    retry: async () => undefined,
    setData: () => undefined,
  }),
}))

jest.mock('@/services', () => ({
  auditService: {
    listAuditTasks: jest.fn(async () => mockTasks),
    submitAudit: jest.fn(async () => ({})),
  },
}))

import { SegmentedControl } from '@/components'
import { auditService } from '@/services'
import { AuditCenterScreen } from '@/screens/AuditCenterScreen'
import { colors, radius } from '@/theme/tokens'

/** `auditService.submitAudit` 的 mock 句柄（断言提交调用情况） */
const submitAuditMock = (auditService as unknown as { submitAudit: jest.Mock }).submitAudit

const ME = 'user-001'
const LINA = 'user-002'

/**
 * 卡片三枚动作的 **accessibilityLabel**（与 `AuditCenterScreen` 内 `*_A11Y` 常量一致）。
 * 带「审核」前缀：抽屉内「审核动作」有「通过」、「审核意见」有「不通过」「退回重改」，
 * 若标签与显示文案同名，抽屉打开后按标签定位会同时命中卡片按钮与抽屉选项。
 */
const APPROVE_A11Y = '审核通过'
const REJECT_A11Y = '审核不通过'
const REWORK_A11Y = '审核退回重改'
/** 卡片三枚动作的 **显示文案**（与 `AuditCenterScreen` 内 `*_LABEL` 常量一致） */
const APPROVE_TEXT = '通过'
const REJECT_TEXT = '不通过'
const REWORK_TEXT = '退回重改'
/** 门禁阻断提示文案（与 `AuditCenterScreen` 内一致） */
const BLOCK_HINT = '评审子任务尚未完成，暂不可通过'

/** 合成任务（仅补齐渲染所需字段） */
function makeTask(partial: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'task-900',
    tenantId: 'tenant-001',
    projectId: 'project-001',
    parentId: null,
    title: '待审核任务',
    description: null,
    status: 'in_progress',
    priority: 'medium',
    assigneeId: LINA,
    startAt: null,
    dueAt: null,
    endAt: null,
    estimatedHours: 2,
    actualHours: 2,
    completedAt: null,
    startedAt: null,
    createdBy: LINA,
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

/** 一条「待审核」主任务（提交人 = 李娜 ⇒ 演示账号 user-001 不可撤回，仅 manager 可审批） */
const mainTask = makeTask({
  id: 'task-900',
  title: '待审核：完成提报',
  submissionStatus: 'pending',
  reviewRequired: true,
  reviewerIds: [ME],
})

/** 其评审子任务（未完成 ⇒ 门禁应关闭「通过」） */
const reviewChild = makeTask({
  id: 'task-901',
  parentId: 'task-900',
  title: '项目评审 — 待审核：完成提报',
  status: 'todo',
  isReviewTask: true,
  priority: 'high',
  assigneeId: ME,
  createdBy: LINA,
})

/** 让 FadeIn 入场定时器在测试环境内完成 */
const settle = (ms = 400): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** 递归拼接渲染树中的全部文本（ScrollView 的 refreshControl 会构成循环引用） */
function collectText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(collectText).join('')
  const obj = node as { children?: unknown; props?: { children?: unknown } }
  const kids = obj.children ?? obj.props?.children
  return kids == null ? '' : collectText(kids)
}

/** 挂载审核中心页并等待入场动画稳定 */
async function mount(): Promise<TestRenderer.ReactTestRenderer> {
  let renderer!: TestRenderer.ReactTestRenderer
  await act(async () => {
    renderer = TestRenderer.create(<AuditCenterScreen />)
  })
  await act(async () => {
    await settle()
  })
  return renderer
}

/** 取主分段控件（四栏切换器；树中第一个 SegmentedControl） */
function mainSegments(renderer: TestRenderer.ReactTestRenderer): TestRenderer.ReactTestInstance {
  return renderer.root.findAllByType(SegmentedControl)[0]
}

/** 切栏（经分段控件回调，等价用户点击） */
async function switchTab(
  renderer: TestRenderer.ReactTestRenderer,
  tab: 'report' | 'audit' | 'approved' | 'withdrawn',
): Promise<void> {
  await act(async () => {
    mainSegments(renderer).props.onChange(tab)
  })
  await act(async () => {
    await settle()
  })
}

/** 按无障碍标签取节点（Button / 交互入口均带 accessibilityLabel） */
function findByLabel(
  renderer: TestRenderer.ReactTestRenderer,
  label: string,
): TestRenderer.ReactTestInstance[] {
  return renderer.root.findAll((node) => node.props?.accessibilityLabel === label)
}

/** 点击带某无障碍标签的第 index 个节点（卡片动作 / 按钮），并等待其异步 handler 落地 */
async function pressByLabel(
  renderer: TestRenderer.ReactTestRenderer,
  label: string,
  index = 0,
): Promise<void> {
  const entry = findByLabel(renderer, label)[index]
  expect(entry).toBeDefined()
  await act(async () => {
    ;(entry.props as { onPress: () => void }).onPress()
    await settle()
  })
}

/**
 * 抽屉内「审核动作」分段控件（`ACTION_OPTIONS`）。
 *
 * 仅以 `approve` 选项定位：**全树唯一** —— 主四栏控件取值为 report/audit/approved/withdrawn，
 * 意见控件为 agree/reject/rework/other（含 `reject`，故不可用它定位，否则会误命中意见控件）。
 */
function actionSegments(renderer: TestRenderer.ReactTestRenderer): TestRenderer.ReactTestInstance {
  const seg = renderer.root.findAllByType(SegmentedControl).find((node) =>
    (node.props.options as { value: string }[]).some((option) => option.value === 'approve'),
  )
  expect(seg).toBeDefined()
  return seg as TestRenderer.ReactTestInstance
}

/**
 * 抽屉内「审核意见」分段控件（`OPINION_OPTIONS`）。
 *
 * 以 `agree` 选项定位：**全树唯一** —— 四栏控件 / 动作控件均不含 `agree`。
 */
function opinionSegments(renderer: TestRenderer.ReactTestRenderer): TestRenderer.ReactTestInstance {
  const seg = renderer.root.findAllByType(SegmentedControl).find((node) =>
    (node.props.options as { value: string }[]).some((option) => option.value === 'agree'),
  )
  expect(seg).toBeDefined()
  return seg as TestRenderer.ReactTestInstance
}

/** 切抽屉内动作（经分段控件回调，等价用户点击） */
async function switchAction(
  renderer: TestRenderer.ReactTestRenderer,
  next: 'approve' | 'reject' | 'withdraw',
): Promise<void> {
  await act(async () => {
    actionSegments(renderer).props.onChange(next)
  })
  await act(async () => {
    await settle()
  })
}

/** 「提交审核」按钮当前是否禁用 */
function submitDisabled(renderer: TestRenderer.ReactTestRenderer): boolean {
  const [submit] = findByLabel(renderer, '提交审核')
  expect(submit).toBeDefined()
  return (
    (submit.props as { accessibilityState?: { disabled?: boolean } }).accessibilityState?.disabled === true
  )
}

/** 取某动作文案下 `Text` 的着色（用于校验取自 tokens） */
function labelTextColors(renderer: TestRenderer.ReactTestRenderer, label: string): string[] {
  const out: string[] = []
  for (const node of findByLabel(renderer, label)) {
    for (const text of node.findAllByType(Text)) {
      const flat = StyleSheet.flatten(text.props.style) as { color?: string } | undefined
      if (flat?.color) out.push(flat.color)
    }
  }
  return out
}

/** 取某动作标签下渲染出的可见文案（用于校验显示文案与 accessibilityLabel 分离） */
function labelTexts(renderer: TestRenderer.ReactTestRenderer, label: string): string[] {
  const out: string[] = []
  for (const node of findByLabel(renderer, label)) {
    for (const text of node.findAllByType(Text)) out.push(collectText(text.props.children))
  }
  return out
}

/**
 * 取某动作按钮**容器**展平后的样式（用于校验「浅底 + 描边」按钮形态）。
 *
 * `PressableScale` 的 `style` 为 `StyleProp<ViewStyle>`（数组，且内部再套 `pressedBg` /
 * `animatedStyle` 条件项），故统一用 `StyleSheet.flatten` 展平。同一 `accessibilityLabel`
 * 会同时命中合成组件与宿主 `View`，故返回全部「带描边」的展平结果供逐项断言。
 */
function actionButtonStyles(
  renderer: TestRenderer.ReactTestRenderer,
  label: string,
): { backgroundColor?: string; borderColor?: string; borderWidth?: number; borderRadius?: number }[] {
  return findByLabel(renderer, label)
    .map(
      (node) =>
        StyleSheet.flatten(node.props.style) as
          | { backgroundColor?: string; borderColor?: string; borderWidth?: number; borderRadius?: number }
          | undefined,
    )
    .filter((flat): flat is { borderWidth?: number } & Record<string, unknown> =>
      Boolean(flat && flat.borderWidth !== undefined),
    )
}

beforeEach(() => {
  mockRole = 'manager'
  mockTasks = []
  mockNavigate.mockClear()
  submitAuditMock.mockClear()
})

describe('AuditCenterScreen —— T-1 四栏标题与顺序', () => {
  it('分段控件恰四栏，顺序为 待提报 / 待审核 / 审核通过 / 撤回审核', async () => {
    const renderer = await mount()
    const options = mainSegments(renderer).props.options as { label: string }[]
    expect(options.map((option) => option.label)).toEqual([
      '待提报',
      '待审核',
      '审核通过',
      '撤回审核',
    ])
    expect(options).toHaveLength(4)
    await act(async () => renderer.unmount())
  })
})

describe('AuditCenterScreen —— T-2 权限门禁（review:view_pending）', () => {
  it('manager ⇒ 渲染「审核通过」「审核不通过」「审核退回重改」三枚柔和按钮（绿 / 红 / 琥珀）；member ⇒ 都不渲染', async () => {
    mockRole = 'manager'
    mockTasks = [mainTask]
    const managerView = await mount()
    expect(findByLabel(managerView, APPROVE_A11Y).length).toBeGreaterThan(0)
    expect(findByLabel(managerView, REJECT_A11Y).length).toBeGreaterThan(0)
    expect(findByLabel(managerView, REWORK_A11Y).length).toBeGreaterThan(0)
    // 着色取自 tokens（通过=success、不通过=danger、退回重改=warning；不硬编码色值）
    expect(labelTextColors(managerView, APPROVE_A11Y)).toContain(colors.success)
    expect(labelTextColors(managerView, REJECT_A11Y)).toContain(colors.danger)
    expect(labelTextColors(managerView, REWORK_A11Y)).toContain(colors.warning)
    await act(async () => managerView.unmount())

    mockRole = 'member'
    const memberView = await mount()
    expect(findByLabel(memberView, APPROVE_A11Y)).toHaveLength(0)
    expect(findByLabel(memberView, REJECT_A11Y)).toHaveLength(0)
    expect(findByLabel(memberView, REWORK_A11Y)).toHaveLength(0)
    // 任务本身仍可见（只读），只是没有审批动作
    expect(collectText(memberView.toJSON())).toContain('待审核：完成提报')
    await act(async () => memberView.unmount())
  })
})

describe('AuditCenterScreen —— T-3 空态文案随栏位', () => {
  it('默认「待审核」栏空态；切「待提报」/「撤回审核」栏文案随之变化', async () => {
    const renderer = await mount()
    expect(collectText(renderer.toJSON())).toContain('没有待审核事项')

    await switchTab(renderer, 'report')
    expect(collectText(renderer.toJSON())).toContain('没有待提报事项')

    await switchTab(renderer, 'withdrawn')
    expect(collectText(renderer.toJSON())).toContain('没有驳回 / 撤回记录')

    await act(async () => renderer.unmount())
  })
})

describe('AuditCenterScreen —— T-4 门禁联动（评审子任务未完成 ⇒ 不可通过）', () => {
  it('T-4a 点「审核通过」开抽屉并预置 approve/agree；子任务未 done ⇒ 提交禁用 + 阻断提示；对照组放行', async () => {
    mockRole = 'manager'
    mockTasks = [mainTask, reviewChild]
    const renderer = await mount()

    // 前置：抽屉未开 ⇒ 无阻断提示、无提交
    expect(collectText(renderer.toJSON())).not.toContain(BLOCK_HINT)

    // 点「审核通过」⇒ 打开抽屉（不再直过），动作/意见预置为 approve / agree
    await pressByLabel(renderer, APPROVE_A11Y)
    expect(actionSegments(renderer).props.value).toBe('approve')
    expect(opinionSegments(renderer).props.value).toBe('agree')
    // 子任务未完成 ⇒ 门禁：阻断提示 + 提交禁用；未发生任何提交
    expect(collectText(renderer.toJSON())).toContain(BLOCK_HINT)
    expect(submitDisabled(renderer)).toBe(true)
    expect(submitAuditMock).not.toHaveBeenCalled()

    // 对照组：未完成子任务消失（等价「已评审通过 / 已取消」）⇒ 门禁放行（抽屉保持打开）
    mockTasks = [mainTask]
    await act(async () => {
      renderer.update(<AuditCenterScreen />)
    })
    await act(async () => {
      await settle()
    })
    expect(collectText(renderer.toJSON())).not.toContain(BLOCK_HINT)
    expect(submitDisabled(renderer)).toBe(false)

    await act(async () => renderer.unmount())
  })

  it('T-4b 抽屉内切回 approve 门禁：阻断提示 + 提交禁用；对照组放行', async () => {
    mockRole = 'manager'
    mockTasks = [mainTask, reviewChild]
    const renderer = await mount()

    // 点「审核不通过」开抽屉（动作预置 reject）后，切回 approve 触发门禁
    await pressByLabel(renderer, REJECT_A11Y)
    expect(actionSegments(renderer).props.value).toBe('reject')
    await switchAction(renderer, 'approve')

    expect(collectText(renderer.toJSON())).toContain(BLOCK_HINT)
    expect(submitDisabled(renderer)).toBe(true)

    // 对照组：未完成子任务消失 ⇒ 门禁放行
    mockTasks = [mainTask]
    await act(async () => {
      renderer.update(<AuditCenterScreen />)
    })
    await act(async () => {
      await settle()
    })
    expect(collectText(renderer.toJSON())).not.toContain(BLOCK_HINT)
    expect(submitDisabled(renderer)).toBe(false)

    await act(async () => renderer.unmount())
  })
})

describe('AuditCenterScreen —— 卡片三色动作（新增补测）', () => {
  it('N-1 通过 happy path：点「审核通过」开抽屉 → 提交 ⇒ action=approve、opinion=agree', async () => {
    mockRole = 'manager'
    mockTasks = [mainTask]
    const renderer = await mount()

    await pressByLabel(renderer, APPROVE_A11Y)
    // 抽屉已打开且预置 approve / agree
    expect(actionSegments(renderer).props.value).toBe('approve')
    expect(opinionSegments(renderer).props.value).toBe('agree')
    // approve 路径原因为选填 ⇒ 无需填写即可提交
    expect(submitDisabled(renderer)).toBe(false)

    await pressByLabel(renderer, '提交审核')
    expect(submitAuditMock).toHaveBeenCalledTimes(1)
    expect(submitAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-900', action: 'approve', opinion: 'agree' }),
    )

    await act(async () => renderer.unmount())
  })

  it('N-2 三个卡片动作各自预置正确的 (action, opinion)', async () => {
    mockRole = 'manager'
    mockTasks = [mainTask]

    const cases: { a11y: string; action: string; opinion: string; disabled: boolean }[] = [
      { a11y: APPROVE_A11Y, action: 'approve', opinion: 'agree', disabled: false },
      { a11y: REJECT_A11Y, action: 'reject', opinion: 'reject', disabled: true },
      { a11y: REWORK_A11Y, action: 'reject', opinion: 'rework', disabled: true },
    ]

    for (const item of cases) {
      const renderer = await mount()
      await pressByLabel(renderer, item.a11y)
      // 抽屉内动作 / 意见分段控件 value 反证预置值
      expect(actionSegments(renderer).props.value).toBe(item.action)
      expect(opinionSegments(renderer).props.value).toBe(item.opinion)
      // reject 路径原因为必填 ⇒ 未填时提交禁用（预置 reject 的语义反证）
      expect(submitDisabled(renderer)).toBe(item.disabled)
      await act(async () => renderer.unmount())
    }
  })

  it('N-3 submitting 期间抽屉「提交审核」禁用，且重复点击不产生第二次提交', async () => {
    mockRole = 'manager'
    mockTasks = [mainTask]
    let release!: () => void
    submitAuditMock.mockImplementationOnce(
      () =>
        new Promise<Record<string, never>>((resolve) => {
          release = () => resolve({})
        }),
    )
    const renderer = await mount()

    await pressByLabel(renderer, APPROVE_A11Y)
    expect(submitDisabled(renderer)).toBe(false)

    // 提交挂起（Promise 未 resolve）
    await pressByLabel(renderer, '提交审核')
    expect(submitAuditMock).toHaveBeenCalledTimes(1)
    // submitting 期间「提交审核」禁用
    expect(submitDisabled(renderer)).toBe(true)

    // 提交挂起期间再次点击 ⇒ 不产生第二次提交（`submitting` 与 `submittingRef` 双重防抖）
    await pressByLabel(renderer, '提交审核')
    expect(submitAuditMock).toHaveBeenCalledTimes(1)

    // 释放挂起的提交，避免悬挂的 pending promise
    await act(async () => {
      release()
      await settle()
    })
    await act(async () => renderer.unmount())
  })

  it('N-4 撤回仍可达：manager 兼提报人 ⇒ 抽屉内动作选项仍含 withdraw', async () => {
    mockRole = 'manager'
    const withdrawable = makeTask({
      id: 'task-910',
      title: '可撤回：待审核',
      submissionStatus: 'pending',
      reviewRequired: true,
      reviewerIds: [ME],
      assigneeId: ME,
      createdBy: ME,
    })
    mockTasks = [withdrawable]
    const renderer = await mount()

    // 待审核栏卡片仍渲染三枚动作（可审核）
    expect(findByLabel(renderer, REJECT_A11Y).length).toBeGreaterThan(0)
    await pressByLabel(renderer, REJECT_A11Y)
    const values = (actionSegments(renderer).props.options as { value: string }[]).map(
      (option) => option.value,
    )
    expect(values).toContain('withdraw')

    await act(async () => renderer.unmount())
  })

  it('N-5 非「待审核」栏（待提报）不渲染三枚动作', async () => {
    mockRole = 'manager'
    const reportTask = makeTask({
      id: 'task-920',
      title: '待提报：尚未提交',
      submissionStatus: null,
      status: 'in_progress',
    })
    mockTasks = [reportTask]
    const renderer = await mount()

    await switchTab(renderer, 'report')
    expect(collectText(renderer.toJSON())).toContain('待提报：尚未提交')
    expect(findByLabel(renderer, APPROVE_A11Y)).toHaveLength(0)
    expect(findByLabel(renderer, REJECT_A11Y)).toHaveLength(0)
    expect(findByLabel(renderer, REWORK_A11Y)).toHaveLength(0)

    await act(async () => renderer.unmount())
  })

  it('N-6 动作标签与显示文案分离：accessibilityLabel 为「审核*」，显示文案为短文案', async () => {
    mockRole = 'manager'
    mockTasks = [mainTask]
    const renderer = await mount()

    const pairs = [
      { a11y: APPROVE_A11Y, text: APPROVE_TEXT },
      { a11y: REJECT_A11Y, text: REJECT_TEXT },
      { a11y: REWORK_A11Y, text: REWORK_TEXT },
    ]
    for (const { a11y, text } of pairs) {
      // 带前缀标签可唯一定位卡片按钮
      expect(findByLabel(renderer, a11y).length).toBeGreaterThan(0)
      // 该按钮渲染出的可见文案仍是短文案（未被前缀污染）
      expect(labelTexts(renderer, a11y)).toContain(text)
      // 短文案不再作为 accessibilityLabel（避免抽屉打开后与选项同名、定位歧义）
      expect(findByLabel(renderer, text)).toHaveLength(0)
    }

    await act(async () => renderer.unmount())
  })
})

describe('AuditCenterScreen —— 卡片动作「三色柔和按钮」形态', () => {
  it('B-1 「审核通过」容器：浅绿底 successFaint + 绿描边 success', async () => {
    mockRole = 'manager'
    mockTasks = [mainTask]
    const renderer = await mount()

    const styles = actionButtonStyles(renderer, APPROVE_A11Y)
    expect(styles.length).toBeGreaterThan(0)
    for (const flat of styles) {
      expect(flat.backgroundColor).toBe(colors.successFaint)
      expect(flat.borderColor).toBe(colors.success)
    }

    await act(async () => renderer.unmount())
  })

  it('B-2 「审核不通过」容器：浅红底 dangerFaint + 红描边 danger', async () => {
    mockRole = 'manager'
    mockTasks = [mainTask]
    const renderer = await mount()

    const styles = actionButtonStyles(renderer, REJECT_A11Y)
    expect(styles.length).toBeGreaterThan(0)
    for (const flat of styles) {
      expect(flat.backgroundColor).toBe(colors.dangerFaint)
      expect(flat.borderColor).toBe(colors.danger)
    }

    await act(async () => renderer.unmount())
  })

  it('B-3 「审核退回重改」容器：浅琥珀底 warningFaint + 琥珀描边 warning', async () => {
    mockRole = 'manager'
    mockTasks = [mainTask]
    const renderer = await mount()

    const styles = actionButtonStyles(renderer, REWORK_A11Y)
    expect(styles.length).toBeGreaterThan(0)
    for (const flat of styles) {
      expect(flat.backgroundColor).toBe(colors.warningFaint)
      expect(flat.borderColor).toBe(colors.warning)
    }

    await act(async () => renderer.unmount())
  })

  it('B-4 三枚动作均为「按钮」形态：borderWidth=1 且 borderRadius=radius.control', async () => {
    mockRole = 'manager'
    mockTasks = [mainTask]
    const renderer = await mount()

    for (const label of [APPROVE_A11Y, REJECT_A11Y, REWORK_A11Y]) {
      const styles = actionButtonStyles(renderer, label)
      expect(styles.length).toBeGreaterThan(0)
      for (const flat of styles) {
        expect(flat.borderWidth).toBe(1)
        expect(flat.borderRadius).toBe(radius.control)
      }
    }

    await act(async () => renderer.unmount())
  })

  it('B-5 tokens 新增浅底键 successFaint / dangerFaint / warningFaint 存在且非空（防误删）', () => {
    for (const key of ['successFaint', 'dangerFaint', 'warningFaint'] as const) {
      expect(typeof colors[key]).toBe('string')
      expect(colors[key].length).toBeGreaterThan(0)
    }
  })
})
