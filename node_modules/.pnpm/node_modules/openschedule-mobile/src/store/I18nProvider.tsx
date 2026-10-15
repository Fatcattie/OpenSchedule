/**
 * 职责：i18n 运行时 Provider（增量 12 · L0 · T01）—— 语言态的唯一载体。
 *
 * 用独立单值键 `os.locale` 持久化，解析「偏好（`'zh-CN' | 'en-US' | 'system'`）
 * + `user.locale` seed + 设备语言探测 → 生效 `Locale`」，并向全树下发
 * `locale` / `preference` / `isReady` / `t` / `setPreference`。
 *
 * 硬性约束：
 * - **独立 Provider**（不并入 `AppProvider`），但**置于 `AppProvider` 之内**
 *   （需读 `user.locale` seed，`§2.7`）；用**非抛错** `useOptionalAppContext()` 读取。
 * - **无 Provider 时回退 `FALLBACK_I18N`（`locale='zh-CN'`）且绝不抛错**（L1）——
 *   否则所有「不包裹 Provider 直接渲染屏 / 组件」的渲染套件都会全红。
 * - **默认偏好 = `'zh-CN'`**（非 `'system'`）⇒ 默认路径**永不调用** `resolveSystemLocale`
 *   ⇒ 不加载 `expo-localization`（`M-P2-05-27` 默认路径零副作用）。
 * - **`AppState` 监听仅在偏好 = `'system'` 时注册**（默认路径零订阅）。
 *
 * hooks 落点铁律（N6）：`useI18n` / `useT` **只从本模块导出**，禁止从 `@/hooks` 桶导出。
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
import { AppState } from 'react-native'
import { translate, type Locale, type LocalePreference, type TParams, type TranslationKey } from '@/i18n'
import { setCurrentLocale } from '@/i18n/current'
import { resolveSystemLocale } from '@/i18n/systemLocale'
import { PREFERENCE_KEYS } from '@/services/config'
import { useOptionalAppContext } from '@/store/AppProvider'

/** i18n 上下文取值 */
export interface I18nContextValue {
  /** 已解析语言（永远只有 `'zh-CN' | 'en-US'`） */
  locale: Locale
  /** 用户偏好（含 `'system'`），供三态控件 `value` */
  preference: LocalePreference
  /** 冷启动 hydrate 是否完成 */
  isReady: boolean
  /** 取词（缺键回退 zh → key；绝不抛错） */
  t: (key: TranslationKey, params?: TParams) => string
  /** 写入偏好（即时生效 + 异步持久化，失败静默） */
  setPreference: (preference: LocalePreference) => Promise<void>
}

const I18nContext = createContext<I18nContextValue | null>(null)

/**
 * 无 `I18nProvider` 时的回退取值（恒 `'zh-CN'`，L1）。
 *
 * 供**单测直接渲染屏 / 组件**（不包裹 `I18nProvider`）时兜底，避免 `useI18n` 抛错导致
 * 渲染套件全红；运行时（`App.tsx` 已包裹）永远不会命中此回退，行为不变。
 */
const FALLBACK_I18N: I18nContextValue = {
  locale: 'zh-CN',
  preference: 'zh-CN',
  isReady: true,
  t: (key, params) => translate('zh-CN', key, params),
  setPreference: async () => undefined,
}

/**
 * 把持久化读到的原始字符串规范为合法 `LocalePreference`（非法值 / `null` → `null`）。
 *
 * `null` 表示「本地无偏好」⇒ 后续走 `user.locale` seed 或默认 `'zh-CN'`。
 */
export function normalizePreference(value: string | null): LocalePreference | null {
  return value === 'zh-CN' || value === 'en-US' || value === 'system' ? value : null
}

/**
 * 解析生效偏好（纯函数，§2.4 ②）：本地偏好优先；无本地偏好时用 `user.locale` seed
 * （仅 `'en-US'` 认英文，其余一切 → `'zh-CN'`）。
 *
 * @param stored     本地偏好（`null` = 无）
 * @param userLocale `user.locale` seed（`null` = 未知）
 */
export function resolvePreference(
  stored: LocalePreference | null,
  userLocale: string | null,
): LocalePreference {
  if (stored !== null) return stored
  return userLocale === 'en-US' ? 'en-US' : 'zh-CN'
}

/** i18n 运行时 Provider */
export function I18nProvider({ children }: { children: ReactNode }): React.JSX.Element {
  // 非抛错读取全局上下文（无 <AppProvider> 时返回 null ⇒ seed 缺失，回落默认 zh）
  const app = useOptionalAppContext()
  const userLocale: string | null = app?.user?.locale ?? null

  const [storedPreference, setStoredPreference] = useState<LocalePreference | null>(null)
  const [isReady, setIsReady] = useState(false)
  // 探测纪元：仅在偏好 = 'system' 且 AppState 转 'active' 时自增，触发 locale 重算
  const [probeEpoch, setProbeEpoch] = useState(0)

  // ── 冷启动 hydrate：读取 `os.locale`（独立单值键，与 `os.theme_mode` 同构）──
  useEffect(() => {
    let cancelled = false
    const hydrate = async () => {
      try {
        const stored = await AsyncStorage.getItem(PREFERENCE_KEYS.locale)
        if (cancelled) return
        setStoredPreference(normalizePreference(stored))
      } catch {
        // 读取失败：保持 null（⇒ 走 seed / 默认 zh），不影响启动
      } finally {
        if (!cancelled) setIsReady(true)
      }
    }
    void hydrate()
    return () => {
      cancelled = true
    }
  }, [])

  /** 写入偏好：即时生效（setState）+ 异步持久化（失败静默，对齐 `ThemeProvider.setMode`） */
  const setPreference = useCallback(async (next: LocalePreference) => {
    setStoredPreference(next)
    try {
      await AsyncStorage.setItem(PREFERENCE_KEYS.locale, next)
    } catch {
      // 忽略：语言写入失败不影响当前会话使用
    }
  }, [])

  // ── 探测求值时机（A3）：仅偏好 = 'system' 时注册 AppState 监听；默认路径零订阅 ──
  useEffect(() => {
    if (storedPreference !== 'system') return
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') setProbeEpoch((epoch) => epoch + 1)
    })
    return () => subscription.remove()
  }, [storedPreference])

  // ── 解析（§2.4 ②③）：本地偏好 > user.locale seed；'system' 时探测设备语言 ──
  const effectivePreference = useMemo<LocalePreference>(
    () => resolvePreference(storedPreference, userLocale),
    [storedPreference, userLocale],
  )

  const locale = useMemo<Locale>(
    () => (effectivePreference === 'system' ? resolveSystemLocale() : effectivePreference),
    // probeEpoch 仅用于在 AppState 回前台时强制重算（无其他依赖）
    [effectivePreference, probeEpoch],
  )

  // ── 同步模块级 locale（增量 12 · L7 · T05）──────────────────────────────────
  // 服务层 / 工具层是**非 React** 模块，不能调 `useT()`，取词统一走
  // `translate(getCurrentLocale(), …)`。此处把已解析 `locale` 同步到 `@/i18n/current`。
  // ⚠️ 必须在**渲染期**（而非 `useEffect`）同步：`resolveReviewItemView` / `opinionMeta`
  //    等工具在**渲染期**取词，若延到 effect，切换语言后首帧仍为旧语言且不会再重渲染。
  setCurrentLocale(locale)

  const t = useCallback(
    (key: TranslationKey, params?: TParams) => translate(locale, key, params),
    [locale],
  )

  const value = useMemo<I18nContextValue>(
    () => ({ locale, preference: effectivePreference, isReady, t, setPreference }),
    [locale, effectivePreference, isReady, t, setPreference],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/**
 * 读取 i18n 上下文。
 *
 * 有 `I18nProvider` 时返回其下发的语言态；无 Provider（单测直接渲染屏 / 组件）时回退
 * `FALLBACK_I18N`（`locale='zh-CN'`）而非抛错。
 */
export function useI18n(): I18nContextValue {
  return useContext(I18nContext) ?? FALLBACK_I18N
}

/** 仅取当前取词函数（等价 `useI18n().t`） */
export function useT(): (key: TranslationKey, params?: TParams) => string {
  return useI18n().t
}
