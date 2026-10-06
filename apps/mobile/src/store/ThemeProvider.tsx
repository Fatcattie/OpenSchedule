/**
 * 职责：主题运行时 Provider（增量 10 · Q2 / §2.1–§2.5）。
 *
 * 把「静态 token」变为「运行时主题」：用 RN 内置 `useColorScheme()` 读取系统外观，
 * 结合用户三态偏好（`system` / `light` / `dark`，持久化于 `os.theme_mode`）解析出生效方案，
 * 并向全树下发当前 `colors` / `statusColor` / `priorityColor`。
 *
 * 硬性约束（N6）：
 * - **只用 RN 内置 `useColorScheme()`**，**禁止**手写 `Appearance.addEventListener`
 *   （jest 环境实测为 `undefined`，手动订阅会在测试中抛错）；亦不直接读 `Appearance.getColorScheme()`。
 * - 与 `ConnectivityProvider` **不同**：无 Provider 时**回退浅色**而非抛错（L1，见下方 `FALLBACK_THEME`），
 *   否则所有「不包裹 Provider 直接渲染屏幕/组件」的渲染套件都会全红。
 *
 * 边界（§2.7）：`ThemeProvider` 置于 `AppProvider` **之外**（未登录也需按系统外观渲染，Q7）。
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useColorScheme } from 'react-native'
import { PREFERENCE_KEYS } from '@/services/config'
import {
  darkPriorityColor,
  darkStatusColor,
  lightPriorityColor,
  lightStatusColor,
  type StatusStyle,
} from '@/theme/semantic'
import { darkColors, lightColors, type ThemeColors } from '@/theme/tokens'
import type { TaskPriority, TaskStatus } from '@/types'

/** 用户主题偏好三态（D9：默认「跟随系统」） */
export type ThemeMode = 'system' | 'light' | 'dark'

/** 生效外观方案 */
export type ColorScheme = 'light' | 'dark'

/** 主题上下文取值 */
export interface ThemeContextValue {
  /** 用户三态偏好 */
  mode: ThemeMode
  /** 生效外观方案 */
  scheme: ColorScheme
  /** 当前生效色板 */
  colors: ThemeColors
  /** 当前生效状态标签配色 */
  statusColor: Record<TaskStatus, StatusStyle>
  /** 当前生效优先级色条配色 */
  priorityColor: Record<TaskPriority, string>
  /** 冷启动偏好是否已 hydrate 完成 */
  isReady: boolean
  /** 写入三态偏好（即时生效 + 异步持久化，失败静默） */
  setMode: (mode: ThemeMode) => Promise<void>
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * 无 `ThemeProvider` 时的回退取值（恒浅色，L1）。
 *
 * 供**单测直接渲染屏幕 / 组件**（测试用 `jest.mock('@/hooks')` 整体替换 hooks，
 * 且不包裹 `ThemeProvider`）时兜底，避免 `useTheme` 抛错导致 11 个渲染套件全红；
 * 运行时（`App.tsx` 已包裹 `ThemeProvider`）永远不会命中此回退，行为不变。
 */
const FALLBACK_THEME: ThemeContextValue = {
  mode: 'system',
  scheme: 'light',
  colors: lightColors,
  statusColor: lightStatusColor,
  priorityColor: lightPriorityColor,
  isReady: true,
  setMode: async () => undefined,
}

/** 把持久化读到的原始字符串规范为合法 `ThemeMode`（非法值回退「跟随系统」） */
function normalizeMode(value: string | null): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
}

/** 主题运行时 Provider */
export function ThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  // RN 内置 hook：内部订阅系统外观变化；jest / 部分 Web 环境返回 null ⇒ 回退浅色（D9 / L1）。
  // 仅当明确为 'dark' 时取深色，其余（null / undefined / 'unspecified'）一律回退浅色。
  const systemScheme: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light'

  const [mode, setModeState] = useState<ThemeMode>('system')
  const [isReady, setIsReady] = useState(false)

  // ── 冷启动 hydrate：读取 `os.theme_mode`（独立单值键）──────────────
  useEffect(() => {
    let cancelled = false
    const hydrate = async () => {
      try {
        const stored = await AsyncStorage.getItem(PREFERENCE_KEYS.themeMode)
        if (cancelled) return
        if (stored !== null) setModeState(normalizeMode(stored))
      } catch {
        // 读取失败：保持默认「跟随系统」，不影响启动
      } finally {
        if (!cancelled) setIsReady(true)
      }
    }
    void hydrate()
    return () => {
      cancelled = true
    }
  }, [])

  /** 写入三态偏好：即时生效（setState）+ 异步持久化（失败静默，对齐 `persistPreferences` 容错风格） */
  const setMode = useCallback(async (next: ThemeMode) => {
    setModeState(next)
    try {
      await AsyncStorage.setItem(PREFERENCE_KEYS.themeMode, next)
    } catch {
      // 忽略：主题写入失败不影响当前会话使用
    }
  }, [])

  // ── 解析生效方案（§2.1）：仅 system 态跟随系统；手动覆盖态不响应系统变化 ──
  const scheme: ColorScheme = mode === 'system' ? systemScheme : mode

  const colors = scheme === 'dark' ? darkColors : lightColors
  const statusColor = scheme === 'dark' ? darkStatusColor : lightStatusColor
  const priorityColor = scheme === 'dark' ? darkPriorityColor : lightPriorityColor

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, scheme, colors, statusColor, priorityColor, isReady, setMode }),
    [mode, scheme, colors, statusColor, priorityColor, isReady, setMode],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/**
 * 读取主题上下文。
 *
 * 有 `ThemeProvider` 时返回其下发的运行时主题；无 Provider（如单测直接渲染屏幕 / 组件）时
 * 回退到浅色 `FALLBACK_THEME`（L1），而非抛错——否则所有「不包裹 Provider 直接渲染」的
 * 渲染套件都会因 `useTheme` 抛错而失败。
 */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext) ?? FALLBACK_THEME
}

/** 仅取当前生效色板（等价 `useTheme().colors`） */
export function useThemeColors(): ThemeColors {
  return useTheme().colors
}

/**
 * 样式工厂消费 hook：把「样式求值」从模块加载期推迟到渲染期（N1）。
 *
 * `factory` 应为**模块级常量**（引用稳定）⇒ `useMemo` 仅在 `colors` 变化时重算，
 * 主题不变时零重算。工厂参数必须命名为 `colors`（保住源码扫描断言，L3）。
 *
 * @param factory 接收当前色板、返回样式（通常为 `StyleSheet.create({...})` 结果）的工厂
 */
export function useThemedStyles<T>(factory: (colors: ThemeColors) => T): T {
  const colors = useThemeColors()
  return useMemo(() => factory(colors), [factory, colors])
}
