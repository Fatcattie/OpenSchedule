/// <reference types="jest" />
/**
 * 职责：主题运行时（`ThemeProvider`）的**直接单元测试**（增量 10 · Q2 / §2.1–§2.5）。
 *
 * 覆盖：
 *  ① 手动覆盖三态：`setMode('dark'|'light')` 立即生效，`colors` / `statusColor` / `priorityColor` 整组切换；
 *  ② 跟随系统：`mode==='system'` 时生效方案等于 `useColorScheme()` 解析值（**含 system→dark 核心路径**）；
 *  ③ 手动覆盖态**不响应**系统变化；
 *  ④ D9 默认与 hydrate：无值→system；`os.theme_mode='dark'`→dark；非法值→system；`isReady` 完成后为 true；
 *  ⑤ 持久化：`setMode` 以 `('os.theme_mode', <mode>)` 写入 AsyncStorage；
 *  ⑥ `useThemedStyles` 的 memo 语义（无关重渲染不重算、主题切换重算）；
 *  ⑦ 无 Provider 兜底（L1）：返回浅色 `FALLBACK_THEME`，`setMode` 为可 await 的 no-op。
 *
 * 系统外观信号：**定向 mock** RN 内部模块 `react-native/Libraries/Utilities/useColorScheme`
 * （RN `index.js:377` 的 `get useColorScheme()` 即 `require('./Libraries/Utilities/useColorScheme').default`）。
 * 变量名 `mockScheme` 满足 jest hoist 约束。
 * 注：整体 `jest.mock('react-native', () => ({ ...requireActual }))` 会因展开触发 DevMenu
 * TurboModule 不变式而崩（jest-expo 环境不稳），故改用上述定向 mock。
 * 范式照抄 `tests/offline-provider.test.tsx`（`react-test-renderer` + `act` + 探针）。
 */
import { useState, type ReactNode } from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { StyleSheet } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  ThemeProvider,
  useTheme,
  useThemedStyles,
  type ThemeContextValue,
  type ThemeMode,
} from '@/store/ThemeProvider'
import {
  darkColors,
  darkPriorityColor,
  darkStatusColor,
  lightColors,
  lightPriorityColor,
  lightStatusColor,
  type ThemeColors,
} from '@/theme'
import { PREFERENCE_KEYS } from '@/services/config'

/** 系统外观信号（jest.mock 工厂内被 `useColorScheme` 闭包读取） */
let mockScheme: 'light' | 'dark' | null = 'light'

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockScheme,
}))

/** 最近一次渲染捕获的主题上下文 */
let captured: ThemeContextValue | null = null

/** 无 Provider 兜底用例捕获的主题上下文（模块作用域：避开 TS 对块级 let 的窄化） */
let bareCaptured: ThemeContextValue | null = null

/** 探针：捕获主题上下文取值 */
function Probe(): null {
  captured = useTheme()
  return null
}

/** 挂载 Provider + 任意子树，并 flush hydrate 的异步 effect */
async function mountWith(child: ReactNode): Promise<TestRenderer.ReactTestRenderer> {
  let renderer!: TestRenderer.ReactTestRenderer
  await act(async () => {
    renderer = TestRenderer.create(<ThemeProvider>{child}</ThemeProvider>)
  })
  return renderer
}

/** 挂载 Provider + 探针 */
function mount(): Promise<TestRenderer.ReactTestRenderer> {
  return mountWith(<Probe />)
}

beforeEach(async () => {
  mockScheme = 'light'
  captured = null
  bareCaptured = null
  ;(AsyncStorage.setItem as jest.Mock).mockClear()
  ;(AsyncStorage.getItem as jest.Mock).mockClear()
  await AsyncStorage.clear()
})

// ────────────────────────────────────────────────────────────────
// ① 手动覆盖三态
// ────────────────────────────────────────────────────────────────
describe('ThemeProvider —— 手动覆盖三态', () => {
  it("setMode('dark') → scheme/colors/statusColor/priorityColor 整组切深", async () => {
    const renderer = await mount()
    expect(captured?.scheme).toBe('light')

    await act(async () => {
      await captured?.setMode('dark')
    })

    expect(captured?.mode).toBe('dark')
    expect(captured?.scheme).toBe('dark')
    expect(captured?.colors).toBe(darkColors)
    expect(captured?.statusColor).toBe(darkStatusColor)
    expect(captured?.priorityColor).toBe(darkPriorityColor)

    await act(async () => {
      renderer.unmount()
    })
  })

  it("setMode('light') → 全部回到浅色", async () => {
    mockScheme = 'dark'
    const renderer = await mount()
    await act(async () => {
      await captured?.setMode('dark')
    })
    expect(captured?.scheme).toBe('dark')

    await act(async () => {
      await captured?.setMode('light')
    })
    expect(captured?.mode).toBe('light')
    expect(captured?.scheme).toBe('light')
    expect(captured?.colors).toBe(lightColors)
    expect(captured?.statusColor).toBe(lightStatusColor)
    expect(captured?.priorityColor).toBe(lightPriorityColor)

    await act(async () => {
      renderer.unmount()
    })
  })

  it('切换后立即生效：setMode 的 act 结束后无需额外事件即可观察到新值', async () => {
    const renderer = await mount()
    await act(async () => {
      await captured?.setMode('dark')
    })
    // 未触发任何其它渲染 / 事件，仅 setMode 本身即已生效
    expect(captured?.colors).toBe(darkColors)
    await act(async () => {
      renderer.unmount()
    })
  })
})

// ────────────────────────────────────────────────────────────────
// ② 跟随系统（含 system→dark 核心路径）
// ────────────────────────────────────────────────────────────────
describe('ThemeProvider —— 跟随系统', () => {
  it('mode=system 且系统为 dark → 生效 dark（核心行为）', async () => {
    mockScheme = 'dark'
    const renderer = await mount()

    expect(captured?.mode).toBe('system')
    expect(captured?.scheme).toBe('dark')
    expect(captured?.colors).toBe(darkColors)
    expect(captured?.statusColor).toBe(darkStatusColor)
    expect(captured?.priorityColor).toBe(darkPriorityColor)

    await act(async () => {
      renderer.unmount()
    })
  })

  it('mode=system 且系统为 light → 生效 light', async () => {
    mockScheme = 'light'
    const renderer = await mount()

    expect(captured?.mode).toBe('system')
    expect(captured?.scheme).toBe('light')
    expect(captured?.colors).toBe(lightColors)

    await act(async () => {
      renderer.unmount()
    })
  })

  it('mode=system 且系统为 null/unspecified → 回退 light（D9）', async () => {
    mockScheme = null
    const renderer = await mount()

    expect(captured?.mode).toBe('system')
    expect(captured?.scheme).toBe('light')

    await act(async () => {
      renderer.unmount()
    })
  })
})

// ────────────────────────────────────────────────────────────────
// ③ 手动覆盖态不响应系统变化
// ────────────────────────────────────────────────────────────────
describe('ThemeProvider —— 手动覆盖态不响应系统变化', () => {
  /** 具备强制重渲染能力的宿主（系统外观变化本身不触发重渲染，需手动 tick） */
  function Host(): ReactNode {
    const [, setTick] = useState(0)
    tickRef = () => setTick((n) => n + 1)
    return <Probe />
  }
  let tickRef: (() => void) | null = null

  it('mode=light（覆盖）时系统切 dark → 仍生效 light', async () => {
    mockScheme = 'light'
    const renderer = await mountWith(<Host />)
    await act(async () => {
      await captured?.setMode('light')
    })
    expect(captured?.scheme).toBe('light')

    mockScheme = 'dark'
    await act(async () => {
      tickRef?.()
    })
    expect(captured?.scheme).toBe('light')
    expect(captured?.colors).toBe(lightColors)

    await act(async () => {
      renderer.unmount()
    })
  })

  it('mode=dark（覆盖）时系统切 light → 仍生效 dark', async () => {
    mockScheme = 'light'
    const renderer = await mountWith(<Host />)
    await act(async () => {
      await captured?.setMode('dark')
    })
    expect(captured?.scheme).toBe('dark')

    mockScheme = 'light'
    await act(async () => {
      tickRef?.()
    })
    expect(captured?.scheme).toBe('dark')
    expect(captured?.colors).toBe(darkColors)

    await act(async () => {
      renderer.unmount()
    })
  })
})

// ────────────────────────────────────────────────────────────────
// ④ D9 默认与 hydrate
// ────────────────────────────────────────────────────────────────
describe('ThemeProvider —— 默认值与 hydrate（D9）', () => {
  it('无持久化值 → 默认 system', async () => {
    const renderer = await mount()
    expect(captured?.mode).toBe('system')
    await act(async () => {
      renderer.unmount()
    })
  })

  it("预置 os.theme_mode='dark' → hydrate 后 mode=dark、colors=darkColors", async () => {
    await AsyncStorage.setItem(PREFERENCE_KEYS.themeMode, 'dark')
    const renderer = await mount()

    expect(captured?.mode).toBe('dark')
    expect(captured?.scheme).toBe('dark')
    expect(captured?.colors).toBe(darkColors)

    await act(async () => {
      renderer.unmount()
    })
  })

  it("预置非法值（'blue'）→ 回退 system", async () => {
    await AsyncStorage.setItem(PREFERENCE_KEYS.themeMode, 'blue')
    const renderer = await mount()

    expect(captured?.mode).toBe('system')
    expect(captured?.scheme).toBe('light')

    await act(async () => {
      renderer.unmount()
    })
  })

  it('isReady 在 hydrate 完成后为 true', async () => {
    const renderer = await mount()
    expect(captured?.isReady).toBe(true)
    await act(async () => {
      renderer.unmount()
    })
  })
})

// ────────────────────────────────────────────────────────────────
// ⑤ 持久化
// ────────────────────────────────────────────────────────────────
describe('ThemeProvider —— 持久化', () => {
  it("setMode('dark') → AsyncStorage.setItem('os.theme_mode', 'dark')", async () => {
    const renderer = await mount()
    await act(async () => {
      await captured?.setMode('dark')
    })

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(PREFERENCE_KEYS.themeMode, 'dark')

    await act(async () => {
      renderer.unmount()
    })
  })

  it("setMode('light') → 以 ('os.theme_mode', 'light') 写入", async () => {
    const renderer = await mount()
    await act(async () => {
      await captured?.setMode('light')
    })

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(PREFERENCE_KEYS.themeMode, 'light')

    await act(async () => {
      renderer.unmount()
    })
  })
})

// ────────────────────────────────────────────────────────────────
// ⑥ useThemedStyles 的 memo 语义
// ────────────────────────────────────────────────────────────────
describe('useThemedStyles —— memo 语义', () => {
  it('同一主题下无关重渲染不重算工厂；主题切换（colors 引用变化）重算', async () => {
    const factory = jest.fn((colors: ThemeColors) =>
      StyleSheet.create({ box: { backgroundColor: colors.bg.surface } }),
    )

    let setModeRef: ((mode: ThemeMode) => Promise<void>) | null = null
    let rerender: (() => void) | null = null

    function StyleProbe(): ReactNode {
      const theme = useTheme()
      setModeRef = theme.setMode
      const [, setTick] = useState(0)
      rerender = () => setTick((n) => n + 1)
      useThemedStyles(factory)
      return null
    }

    const renderer = await mountWith(<StyleProbe />)

    // 挂载后工厂恰调用一次（hydrate 引起的重渲染不改变 colors 引用 ⇒ 不重算）
    const afterMount = factory.mock.calls.length
    expect(afterMount).toBe(1)

    // 无关重渲染（colors / factory 引用均未变）⇒ 不重算
    await act(async () => {
      rerender?.()
    })
    expect(factory.mock.calls.length).toBe(afterMount)

    // 主题切换（colors 引用变化）⇒ 重算一次
    await act(async () => {
      await setModeRef?.('dark')
    })
    expect(factory.mock.calls.length).toBe(afterMount + 1)

    await act(async () => {
      renderer.unmount()
    })
  })
})

// ────────────────────────────────────────────────────────────────
// ⑦ 无 Provider 兜底（L1）
// ────────────────────────────────────────────────────────────────
describe('useTheme —— 无 Provider 兜底（L1）', () => {
  it('不包 Provider 直接 useTheme → 返回浅色 FALLBACK，setMode 为可 await 的 no-op', async () => {
    function Bare(): null {
      bareCaptured = useTheme()
      return null
    }

    let renderer!: TestRenderer.ReactTestRenderer
    await act(async () => {
      renderer = TestRenderer.create(<Bare />)
    })

    expect(bareCaptured?.scheme).toBe('light')
    expect(bareCaptured?.mode).toBe('system')
    expect(bareCaptured?.colors).toBe(lightColors)
    expect(bareCaptured?.statusColor).toBe(lightStatusColor)
    expect(bareCaptured?.priorityColor).toBe(lightPriorityColor)
    expect(bareCaptured?.isReady).toBe(true)

    // 可 await 的 no-op：不抛错
    await expect(bareCaptured?.setMode('dark')).resolves.toBeUndefined()

    await act(async () => {
      renderer.unmount()
    })
  })
})
