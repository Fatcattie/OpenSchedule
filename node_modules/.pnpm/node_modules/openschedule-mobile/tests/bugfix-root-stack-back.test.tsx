/**
 * 职责：缺陷修复回归 —— **根栈页返回能力**（两部分）。
 *
 * ── 缺陷 1（用户报告）────────────────────────────────────────────────
 * `PersonalPlan` 注册在**根共享栈**（`MainRootStack`，全屏覆盖 TabBar），但页面头部
 * `<ScreenHeader title="个人计划" subtitle={…} />` **未传 `onBack`** ⇒ 从工作台快捷入口
 * 进入后**既无返回箭头、也无底部 TabBar，用户被卡死在该页**。
 * 修复：补 `onBack`（与同类根栈页一致）。
 *
 * ── 缺陷 2（修复过程中发现，同类）──────────────────────────────────────
 * 6 个根栈页（TaskDetail / Notifications / Submission / CreateItem / PersonalPlan /
 * MySubmissions）的返回按钮一律写死 `navigation.goBack()`。应用**冷启动直达深链**时
 * （Web：地址栏直接打开 `/personal-plan` 或在该页 F5；真机：点击推送通知冷启动），
 * 根栈中**只有目标页**、其下没有 `Tabs` ⇒ `goBack()` 是**空操作**：按钮点了没反应，
 * 而 TabBar 又被全屏覆盖 ⇒ 仍然出不去。
 * 修复：统一改用 `goBackOrHome(navigation)` —— 有路可退则返回，无路可退则兜底回 `Tabs`。
 *
 * 本用例锁定：
 *  A. `goBackOrHome` 纯函数的两条分支（有路可退 / 无路可退）；
 *  B. `ScreenHeader` 的渲染机制（传 `onBack` 才出现返回按钮 —— 对照组）；
 *  C. `PersonalPlanScreen` 确实渲染出返回按钮（缺陷 1 的修复锚点，修复前必然失败）；
 *  D. 点击返回在两种栈深度下分别走 `goBack` / `navigate('Tabs')`（缺陷 2 的修复锚点）。
 *
 * 依赖以 jest.mock 隔离（导航 / 安全区 / 图标 / hooks / services），只验证「返回能力」。
 */
import TestRenderer, { act } from 'react-test-renderer'

jest.mock('@expo/vector-icons', () => ({
  Feather: jest.fn(() => null),
}))

jest.mock('@react-navigation/native', () => {
  const navigate = jest.fn()
  const goBack = jest.fn()
  const canGoBack = jest.fn(() => true)
  return { __nav: { navigate, goBack, canGoBack }, useNavigation: () => ({ navigate, goBack, canGoBack }) }
})

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('@/hooks', () => ({
  useAuth: () => ({ user: { id: 'user-001', timezone: 'Asia/Shanghai' } }),
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
  focusService: {
    listPersonalTasks: jest.fn(async () => []),
    getCalendarWeek: jest.fn(async () => []),
    completePersonalTask: jest.fn(async () => ({})),
    createPersonalTask: jest.fn(async () => ({})),
    updatePersonalTask: jest.fn(async () => ({})),
    deletePersonalTask: jest.fn(async () => ({})),
    schedulePersonalTask: jest.fn(async () => ({})),
  },
  taskService: {
    listScheduledTasks: jest.fn(async () => []),
  },
}))

import * as navModule from '@react-navigation/native'
import { ScreenHeader } from '@/components'
import { PersonalPlanScreen } from '@/screens/PersonalPlanScreen'
import { ROOT_FALLBACK_ROUTE, goBackOrHome, type BackCapableNavigation } from '@/utils/navigation'

const nav = (navModule as unknown as {
  __nav: { navigate: jest.Mock; goBack: jest.Mock; canGoBack: jest.Mock }
}).__nav

/** 返回按钮的稳定标识（`ScreenHeader` 内 Pressable 的无障碍标签） */
const BACK_LABEL = '返回'

/** 渲染并等待异步 hook 落地 */
async function render(node: React.ReactElement): Promise<TestRenderer.ReactTestRenderer> {
  let renderer!: TestRenderer.ReactTestRenderer
  await act(async () => {
    renderer = TestRenderer.create(node)
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  return renderer
}

/** 取树中所有「返回按钮」（带 onPress 的节点，避免命中仅承载属性的宿主节点） */
function findBackButtons(renderer: TestRenderer.ReactTestRenderer): TestRenderer.ReactTestInstance[] {
  return renderer.root.findAll(
    (node) =>
      (node.props as { accessibilityLabel?: string }).accessibilityLabel === BACK_LABEL &&
      typeof (node.props as { onPress?: unknown }).onPress === 'function',
  )
}

/** 递归收集渲染树里的全部文本叶子（避开 `JSON.stringify` 的循环引用） */
function collectText(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out)
    return out
  }
  if (node && typeof node === 'object' && 'children' in node) {
    const children = (node as { children?: unknown }).children
    if (Array.isArray(children)) for (const child of children) collectText(child, out)
  }
  return out
}

/** 构造导航替身（纯函数单测用） */
function makeNav(canGoBack: boolean) {
  return {
    canGoBack: jest.fn(() => canGoBack),
    goBack: jest.fn(),
    navigate: jest.fn(),
  }
}

beforeEach(() => {
  nav.goBack.mockClear()
  nav.navigate.mockClear()
  nav.canGoBack.mockClear()
  nav.canGoBack.mockReturnValue(true)
})

// ─────────────────────────────────────────────────────────────────────────────
describe('goBackOrHome —— 返回兜底判据（纯函数，缺陷 2 的核心）', () => {
  it('有路可退（canGoBack=true）⇒ 调用 goBack，不碰 navigate', () => {
    const fake = makeNav(true)
    goBackOrHome(fake as unknown as BackCapableNavigation)
    expect(fake.goBack).toHaveBeenCalledTimes(1)
    expect(fake.navigate).not.toHaveBeenCalled()
  })

  it('无路可退（canGoBack=false，冷启动深链）⇒ 兜底 navigate 到 Tab 容器，不碰 goBack', () => {
    const fake = makeNav(false)
    goBackOrHome(fake as unknown as BackCapableNavigation)
    expect(fake.navigate).toHaveBeenCalledTimes(1)
    expect(fake.navigate).toHaveBeenCalledWith(ROOT_FALLBACK_ROUTE)
    expect(fake.goBack).not.toHaveBeenCalled()
  })

  it('兜底落点为 Tabs（工作台入口）', () => {
    expect(ROOT_FALLBACK_ROUTE).toBe('Tabs')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('ScreenHeader —— 返回按钮的渲染机制（对照组）', () => {
  it('传 onBack ⇒ 渲染「返回」按钮', async () => {
    const renderer = await render(<ScreenHeader title="任意页" onBack={() => undefined} />)
    expect(findBackButtons(renderer)).toHaveLength(1)
    await act(async () => renderer.unmount())
  })

  it('不传 onBack ⇒ 不渲染「返回」按钮（Tab 初始页 / 模态页的正确形态）', async () => {
    const renderer = await render(<ScreenHeader title="任意页" />)
    expect(findBackButtons(renderer)).toHaveLength(0)
    await act(async () => renderer.unmount())
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('PersonalPlanScreen —— 根栈页必须有返回（缺陷 1 回归）', () => {
  it('渲染出「返回」按钮（修复前必然失败）', async () => {
    const renderer = await render(<PersonalPlanScreen />)
    expect(findBackButtons(renderer)).toHaveLength(1)
    await act(async () => renderer.unmount())
  })

  it('点击「返回」且栈内有下层 ⇒ 调用 goBack()', async () => {
    const renderer = await render(<PersonalPlanScreen />)
    const [back] = findBackButtons(renderer)
    expect(back).toBeDefined()
    await act(async () => {
      ;(back.props as { onPress: () => void }).onPress()
    })
    expect(nav.goBack).toHaveBeenCalledTimes(1)
    expect(nav.navigate).not.toHaveBeenCalled()
    await act(async () => renderer.unmount())
  })

  it('点击「返回」但栈内无下层（冷启动深链）⇒ 兜底跳回 Tabs', async () => {
    nav.canGoBack.mockReturnValue(false)
    const renderer = await render(<PersonalPlanScreen />)
    const [back] = findBackButtons(renderer)
    expect(back).toBeDefined()
    await act(async () => {
      ;(back.props as { onPress: () => void }).onPress()
    })
    expect(nav.navigate).toHaveBeenCalledWith(ROOT_FALLBACK_ROUTE)
    expect(nav.goBack).not.toHaveBeenCalled()
    await act(async () => renderer.unmount())
  })

  it('页头标题 / 副标题契约未被破坏', async () => {
    const renderer = await render(<PersonalPlanScreen />)
    const text = collectText(renderer.toJSON()).join('\u0001')
    expect(text).toContain('个人计划')
    expect(text).toContain('共 0 项个人任务') // useAsync 桩返回空数组
    await act(async () => renderer.unmount())
  })
})
