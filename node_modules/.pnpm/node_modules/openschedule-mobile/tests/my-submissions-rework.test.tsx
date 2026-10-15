/**
 * 职责：我的提报页（`MySubmissionsScreen`）「退回重改」口径统一的**组件级渲染**验证（增量 7.9）。
 *
 * 背景：增量 7.8 只分叉了**通知文案**；提报人自己的「我的提报」列表页仍把
 * `reject + opinion='rework'` 显示成「已驳回」，与审核侧三裁定口径不一致。本套件钉住修复后的
 * 呈现，并保证非 rejected 状态呈现**逐字不变**（回归红线）。
 *
 * 覆盖：
 *  - **R-1** `reject + opinion='rework'` ⇒ 状态标「退回重改」+ `warning` 色调 + 前缀「退回原因：」；
 *  - **R-2** 对照组 `reject + opinion='reject'` ⇒ 仍「已驳回」+ `danger` 色调 + 前缀「驳回原因：」；
 *  - **R-3** 非 rejected 状态（draft / pending / approved / withdrawn）文案与色调**逐字不变**；
 *  - **R-4** 无 `auditLogs` / `auditLogs` 为空 ⇒ 回落「已驳回」（不误判为退回重改）；
 *  - **R-5** `submissionStatus='rejected'` 但末条意见非 `rework`（如 `agree`）⇒ 仍「已驳回」。
 *
 * 范式：`react-test-renderer` + `act` + `jest.mock`（仓库无 `@testing-library/react-native`，
 * 不为此新增依赖），照抄 `tests/audit-center-render.test.tsx`。
 * 依赖以 jest.mock 隔离（导航 / 安全区 / 权限 / hooks / services），渲染**真实**组件。
 */
import TestRenderer, { act } from 'react-test-renderer'
import { StyleSheet, Text } from 'react-native'

import type { AuditLog, AuditOpinion, Task } from '@/types'

/** 本页 `useAsync` 的数据源（`taskService.listMySubmissions` 结果） */
let mockSubmissions: Task[] = []

jest.mock('@expo/vector-icons', () => ({
  Feather: () => null,
}))

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: {} }),
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('@/utils/permission', () => ({
  useCan: () => () => true,
}))

jest.mock('@/hooks', () => ({
  useAuth: () => ({ user: { id: 'user-001', timezone: 'Asia/Shanghai' }, role: 'member' }),
  useAsync: () => ({
    data: mockSubmissions,
    loading: false,
    error: null,
    refetch: async () => undefined,
    retry: async () => undefined,
    setData: () => undefined,
  }),
}))

jest.mock('@/services', () => ({
  taskService: {
    listMySubmissions: jest.fn(async () => mockSubmissions),
    withdrawSubmission: jest.fn(async () => ({})),
  },
}))

import { MySubmissionsScreen } from '@/screens/MySubmissionsScreen'
import { colors, radius } from '@/theme/tokens'

const ME = 'user-001'

/** 合成审核留痕（仅补齐判定所需字段） */
function makeLog(opinion: AuditOpinion, id = `audit-${opinion}`): AuditLog {
  return {
    id,
    taskId: 'task-900',
    action: opinion === 'agree' ? 'approve' : 'reject',
    opinion,
    reason: '审核意见',
    operatorId: 'user-admin',
    operatorName: '管理员',
    createdAt: '2026-09-27T00:00:00.000Z',
  }
}

/** 合成提报记录（仅补齐渲染所需字段） */
function makeTask(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  const base: Omit<Task, 'id' | 'title'> = {
    tenantId: 'tenant-001',
    projectId: null,
    parentId: null,
    description: null,
    status: 'cancelled',
    priority: 'medium',
    assigneeId: null,
    dueAt: null,
    estimatedHours: null,
    actualHours: null,
    completedAt: null,
    startedAt: null,
    createdBy: ME,
    tags: [],
    sortOrder: 0,
    workflowColumnId: null,
    isAiGenerated: false,
    version: 1,
    createdAt: '2026-09-27T00:00:00.000Z',
    updatedAt: '2026-09-27T00:00:00.000Z',
  }
  return { ...base, ...partial }
}

/** 让 FadeIn 入场定时器在测试环境内完成 */
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

/** 挂载「我的提报」页并等待入场动画稳定 */
async function mount(): Promise<TestRenderer.ReactTestRenderer> {
  let renderer!: TestRenderer.ReactTestRenderer
  await act(async () => {
    renderer = TestRenderer.create(<MySubmissionsScreen />)
  })
  await act(async () => {
    await settle()
  })
  return renderer
}

/** 提报状态标的全部可能文案（用于与 `Tag` 胶囊区分：Tag 文案为「项目」/「任务」） */
const STATUS_LABELS = ['草稿', '待审核', '已通过', '已驳回', '已撤回', '退回重改']

/** 状态标（`styles.statusPill`）的文案 / 前景色 / 淡底色 */
function readStatusPill(renderer: TestRenderer.ReactTestRenderer): {
  text: string
  color?: string
  bg?: string
} {
  // 本页 `Tag` 胶囊文案为「项目」/「任务」，与状态文案不相交；再叠加 `radius.pill` 圆角锁定状态标
  // 宿主 View（其子节点文本为状态文案），从而读出淡底色。
  const pill = renderer.root.findAll((node) => {
    const flat = StyleSheet.flatten(node.props?.style) as { borderRadius?: number } | undefined
    if (flat?.borderRadius !== radius.pill) return false
    return STATUS_LABELS.includes(collectText(node.props?.children))
  })[0]
  expect(pill).toBeDefined()
  const label = (pill as TestRenderer.ReactTestInstance).findAllByType(Text)[0]
  expect(label).toBeDefined()
  return {
    text: collectText(label.props.children),
    color: (StyleSheet.flatten(label.props.style) as { color?: string } | undefined)?.color,
    bg: (StyleSheet.flatten((pill as TestRenderer.ReactTestInstance).props.style) as
      | { backgroundColor?: string }
      | undefined)?.backgroundColor,
  }
}

beforeEach(() => {
  mockSubmissions = []
})

describe('MySubmissionsScreen —— R-1 退回重改（reject + opinion=rework）', () => {
  it('状态标「退回重改」+ warning 色调 + 前缀「退回原因：」', async () => {
    mockSubmissions = [
      makeTask({
        id: 'task-900',
        title: '新建项目：官网改版',
        submissionStatus: 'rejected',
        submissionKind: 'project',
        reviewNote: '请补充验收标准',
        auditLogs: [makeLog('rework')],
      }),
    ]
    const renderer = await mount()

    const pill = readStatusPill(renderer)
    expect(pill.text).toBe('退回重改')
    expect(pill.color).toBe(colors.warning)
    expect(pill.bg).toBe(`${colors.warning}14`)
    // 原因前缀分叉为「退回原因：」且原因正文保留
    expect(collectText(renderer.toJSON())).toContain('退回原因：请补充验收标准')
    expect(collectText(renderer.toJSON())).not.toContain('驳回原因：')

    await act(async () => renderer.unmount())
  })
})

describe('MySubmissionsScreen —— R-2 对照组：不通过（reject + opinion=reject）', () => {
  it('仍「已驳回」+ danger 色调 + 前缀「驳回原因：」', async () => {
    mockSubmissions = [
      makeTask({
        id: 'task-900',
        title: '新建项目：官网改版',
        submissionStatus: 'rejected',
        submissionKind: 'project',
        reviewNote: '说明不充分',
        auditLogs: [makeLog('reject')],
      }),
    ]
    const renderer = await mount()

    const pill = readStatusPill(renderer)
    expect(pill.text).toBe('已驳回')
    expect(pill.color).toBe(colors.danger)
    expect(pill.bg).toBe(`${colors.danger}14`)
    expect(collectText(renderer.toJSON())).toContain('驳回原因：说明不充分')
    expect(collectText(renderer.toJSON())).not.toContain('退回原因：')

    await act(async () => renderer.unmount())
  })
})

describe('MySubmissionsScreen —— R-3 非 rejected 状态呈现逐字不变', () => {
  const cases: {
    status: NonNullable<Task['submissionStatus']>
    text: string
    color: string
  }[] = [
    { status: 'draft', text: '草稿', color: colors.text.secondary },
    { status: 'pending', text: '待审核', color: colors.warning },
    { status: 'approved', text: '已通过', color: colors.success },
    { status: 'withdrawn', text: '已撤回', color: colors.text.secondary },
  ]

  it.each(cases)('submissionStatus=$status ⇒ 「$text」（色调不变）', async ({ status, text, color }) => {
    mockSubmissions = [
      makeTask({
        id: 'task-900',
        title: `提报记录-${status}`,
        submissionStatus: status,
        submissionKind: 'task',
      }),
    ]
    const renderer = await mount()

    const pill = readStatusPill(renderer)
    expect(pill.text).toBe(text)
    expect(pill.color).toBe(color)

    await act(async () => renderer.unmount())
  })
})

describe('MySubmissionsScreen —— R-4/R-5 退回重改判定的边界（防误判）', () => {
  it('R-4 无 auditLogs / auditLogs 为空 ⇒ 回落「已驳回」', async () => {
    mockSubmissions = [
      makeTask({
        id: 'task-900',
        title: '无留痕驳回',
        submissionStatus: 'rejected',
        reviewNote: '历史数据',
      }),
    ]
    const renderer = await mount()

    const pill = readStatusPill(renderer)
    expect(pill.text).toBe('已驳回')
    expect(pill.color).toBe(colors.danger)
    expect(collectText(renderer.toJSON())).toContain('驳回原因：历史数据')

    await act(async () => renderer.unmount())
  })

  it('R-5 rejected 但末条意见为 agree ⇒ 仍「已驳回」（仅看 opinion=rework）', async () => {
    mockSubmissions = [
      makeTask({
        id: 'task-900',
        title: '末条意见非 rework',
        submissionStatus: 'rejected',
        reviewNote: '原因',
        auditLogs: [makeLog('rework', 'audit-old'), makeLog('agree', 'audit-new')],
      }),
    ]
    const renderer = await mount()

    const pill = readStatusPill(renderer)
    expect(pill.text).toBe('已驳回')
    expect(pill.color).toBe(colors.danger)
    // 取**末条**（agree）⇒ 不因历史 rework 误判
    expect(collectText(renderer.toJSON())).toContain('驳回原因：原因')

    await act(async () => renderer.unmount())
  })

  it('R-6 退回后重新提交（pending）末条留痕仍为 rework ⇒ 必须「待审核」而非「退回重改」（守卫 submissionStatus）', async () => {
    mockSubmissions = [
      makeTask({
        id: 'task-900',
        title: '退回后重新提交',
        submissionStatus: 'pending',
        submissionKind: 'task',
        // 留痕不清空：重新提交后末条 opinion 仍是 rework
        auditLogs: [makeLog('rework')],
      }),
    ]
    const renderer = await mount()

    const pill = readStatusPill(renderer)
    // pending 与退回重改色调同为 warning，颜色无法区分 ⇒ 必须断言文案
    expect(pill.text).toBe('待审核')
    expect(pill.text).not.toBe('退回重改')
    expect(pill.color).toBe(colors.warning)

    await act(async () => renderer.unmount())
  })

  it('R-7 submissionStatus 缺省（undefined）⇒ 回落「草稿」（`?? \'draft\'` 兜底）', async () => {
    mockSubmissions = [
      makeTask({
        id: 'task-900',
        title: '缺省状态',
        submissionKind: 'task',
        // 刻意不设 submissionStatus（历史/半初始化数据）
      }),
    ]
    const renderer = await mount()

    const pill = readStatusPill(renderer)
    expect(pill.text).toBe('草稿')
    expect(pill.color).toBe(colors.text.secondary)

    await act(async () => renderer.unmount())
  })
})
