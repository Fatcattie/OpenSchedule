/// <reference types="jest" />
/**
 * 职责：i18n **Provider 层**单元测试（增量 12 · 批次 3 · T05 收口）。
 *
 * 范式照抄 `tests/theme-runtime.test.tsx`（`react-test-renderer` + `act` + 探针 + `mountWith`）。
 *
 * 覆盖（`M-P2-05-15` / `M-P2-05-27`）：
 *  ① 默认 = `zh-CN`（无持久化、无 seed）；
 *  ② 切换即时生效（`setPreference` 后同一渲染树内 `locale` / `t` 立即变）；
 *  ③ 持久化（`setPreference('en-US')` → `AsyncStorage.setItem('os.locale', 'en-US')`）；
 *  ④ hydrate（预置 `os.locale='en-US'` → 初始渲染即 `en-US`）；
 *  ⑤ 非法值回退（`os.locale='fr-FR'` → 回退 `zh-CN`）；
 *  ⑥ 无 Provider 兜底（`useI18n` / `useT` 回退 `zh-CN`、不抛错）；
 *  ⑦ 三态解析（`'system'` → 设备语言；**必须 mock `expo-localization`**）；
 *  ⑧ 探测失败兜底（`getLocales` 抛错 / 空数组 → `zh-CN`）；
 *  ⑨ `user.locale` seed 优先级（本地无偏好 → 用 seed；本地有偏好 → 不被 seed 覆盖）。
 *
 * ⚠️ 铁律：凡 `'system'` 用例**必须** mock `expo-localization`（固定设备语言），否则测试随
 *    运行机设备语言随机变红（`M-P2-05-27`）。默认路径（偏好 ≠ `'system'`）**永不** require
 *    该原生模块 ⇒ 本文件对非 `'system'` 用例零副作用。
 */

import { type ReactNode } from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { TParams, TranslationKey } from '@/i18n'
import { I18nProvider, useI18n, useT, type I18nContextValue } from '@/store/I18nProvider'
import { PREFERENCE_KEYS } from '@/services/config'

// ────────────────────────────────────────────────────────────────
// mock ①：设备语言探测（expo-localization）—— 变量名以 `mock` 前缀满足 jest hoist 约束
// 工厂内仅创建闭包、**不读取**变量 ⇒ 避开 babel-jest 提升导致的 TDZ。
// ────────────────────────────────────────────────────────────────
/** 探测返回值（可变；按用例设置） */
let mockLocales: Array<{ languageTag: string }> | null = [{ languageTag: 'en-US' }]
/** 探测是否抛错（可变；按用例设置） */
let mockProbeThrows = false

jest.mock('expo-localization', () => ({
  getLocales: () => {
    if (mockProbeThrows) throw new Error('probe failed')
    return mockLocales ?? []
  },
}))

// ────────────────────────────────────────────────────────────────
// mock ②：`user.locale` seed 读取入口（`useOptionalAppContext`）—— 仅返回 seed，不加载真实
// AppProvider（避免拉起 services / secureStore 等重依赖）。
// ────────────────────────────────────────────────────────────────
/** seed 语言（可变；按用例设置；null = 无 Provider ⇒ seed 缺失） */
let mockSeedLocale: string | null = null

jest.mock('@/store/AppProvider', () => ({
  useOptionalAppContext: () =>
    mockSeedLocale === null ? null : { user: { locale: mockSeedLocale } },
}))

/** 最近一次渲染捕获的 i18n 上下文（Provider 用例） */
let captured: I18nContextValue | null = null
/** 无 Provider 兜底用例捕获的上下文（模块作用域：避开 TS 对块级 let 的窄化） */
let bareCaptured: I18nContextValue | null = null
/** 无 Provider 兜底用例经 `useT()` 捕获的取词函数 */
let bareT: ((key: TranslationKey, params?: TParams) => string) | null = null

/** 探针：捕获 i18n 上下文取值 */
function Probe(): null {
  captured = useI18n()
  return null
}

/** 探针：同时经 `useI18n()` 与 `useT()` 取值（验证二者一致） */
function BareProbe(): null {
  bareCaptured = useI18n()
  bareT = useT()
  return null
}

/** 挂载 Provider + 任意子树，并 flush hydrate 的异步 effect */
async function mountWith(child: ReactNode): Promise<TestRenderer.ReactTestRenderer> {
  let renderer!: TestRenderer.ReactTestRenderer
  await act(async () => {
    renderer = TestRenderer.create(<I18nProvider>{child}</I18nProvider>)
  })
  return renderer
}

/** 挂载 Provider + 探针 */
function mount(): Promise<TestRenderer.ReactTestRenderer> {
  return mountWith(<Probe />)
}

beforeEach(async () => {
  mockLocales = [{ languageTag: 'en-US' }]
  mockProbeThrows = false
  mockSeedLocale = null
  captured = null
  bareCaptured = null
  bareT = null
  ;(AsyncStorage.setItem as jest.Mock).mockClear()
  ;(AsyncStorage.getItem as jest.Mock).mockClear()
  await AsyncStorage.clear()
})

// ────────────────────────────────────────────────────────────────
// ① 默认 = zh-CN
// ────────────────────────────────────────────────────────────────
describe('I18nProvider —— 默认 zh-CN', () => {
  it("无持久化、无 seed → locale='zh-CN'、preference='zh-CN'、t('common.confirm')='确认'", async () => {
    const renderer = await mount()
    expect(captured?.locale).toBe('zh-CN')
    expect(captured?.preference).toBe('zh-CN')
    expect(captured?.t('common.confirm')).toBe('确认')
    expect(captured?.isReady).toBe(true)
    await act(async () => {
      renderer.unmount()
    })
  })
})

// ────────────────────────────────────────────────────────────────
// ② 切换即时生效
// ────────────────────────────────────────────────────────────────
describe('I18nProvider —— 切换即时生效', () => {
  it("setPreference('en-US') → 同一渲染树内 locale/t 立即变英文（无需重挂载）", async () => {
    const renderer = await mount()
    expect(captured?.locale).toBe('zh-CN')

    await act(async () => {
      await captured?.setPreference('en-US')
    })

    expect(captured?.locale).toBe('en-US')
    expect(captured?.preference).toBe('en-US')
    expect(captured?.t('common.confirm')).toBe('Confirm')

    await act(async () => {
      renderer.unmount()
    })
  })

  it("切回 setPreference('zh-CN') → 立即恢复中文", async () => {
    const renderer = await mount()
    await act(async () => {
      await captured?.setPreference('en-US')
    })
    expect(captured?.t('common.confirm')).toBe('Confirm')

    await act(async () => {
      await captured?.setPreference('zh-CN')
    })
    expect(captured?.locale).toBe('zh-CN')
    expect(captured?.t('common.confirm')).toBe('确认')

    await act(async () => {
      renderer.unmount()
    })
  })
})

// ────────────────────────────────────────────────────────────────
// ③ 持久化
// ────────────────────────────────────────────────────────────────
describe('I18nProvider —— 持久化', () => {
  it("setPreference('en-US') → AsyncStorage.setItem('os.locale', 'en-US')", async () => {
    const renderer = await mount()
    await act(async () => {
      await captured?.setPreference('en-US')
    })
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(PREFERENCE_KEYS.locale, 'en-US')
    await act(async () => {
      renderer.unmount()
    })
  })

  it("setPreference('system') → 以 ('os.locale', 'system') 写入", async () => {
    const renderer = await mount()
    await act(async () => {
      await captured?.setPreference('system')
    })
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(PREFERENCE_KEYS.locale, 'system')
    await act(async () => {
      renderer.unmount()
    })
  })
})

// ────────────────────────────────────────────────────────────────
// ④ hydrate
// ────────────────────────────────────────────────────────────────
describe('I18nProvider —— hydrate', () => {
  it("预置 os.locale='en-US' → 初始渲染后 locale='en-US'", async () => {
    await AsyncStorage.setItem(PREFERENCE_KEYS.locale, 'en-US')
    const renderer = await mount()
    expect(captured?.locale).toBe('en-US')
    expect(captured?.preference).toBe('en-US')
    expect(captured?.t('common.confirm')).toBe('Confirm')
    await act(async () => {
      renderer.unmount()
    })
  })

  it("预置 os.locale='zh-CN' → locale='zh-CN'", async () => {
    await AsyncStorage.setItem(PREFERENCE_KEYS.locale, 'zh-CN')
    const renderer = await mount()
    expect(captured?.locale).toBe('zh-CN')
    await act(async () => {
      renderer.unmount()
    })
  })
})

// ────────────────────────────────────────────────────────────────
// ⑤ 非法值回退
// ────────────────────────────────────────────────────────────────
describe('I18nProvider —— 非法值回退', () => {
  it("预置 os.locale='fr-FR' → normalizePreference 返回 null ⇒ 回退 zh-CN", async () => {
    await AsyncStorage.setItem(PREFERENCE_KEYS.locale, 'fr-FR')
    const renderer = await mount()
    expect(captured?.locale).toBe('zh-CN')
    expect(captured?.preference).toBe('zh-CN')
    expect(captured?.t('common.confirm')).toBe('确认')
    await act(async () => {
      renderer.unmount()
    })
  })
})

// ────────────────────────────────────────────────────────────────
// ⑥ 无 Provider 兜底（L1）
// ────────────────────────────────────────────────────────────────
describe('useI18n / useT —— 无 Provider 兜底（L1）', () => {
  it("不包 Provider 直接 useI18n()/useT() → 回退 zh-CN、t('common.confirm')='确认'、不抛错", async () => {
    let renderer!: TestRenderer.ReactTestRenderer
    await act(async () => {
      renderer = TestRenderer.create(<BareProbe />)
    })

    expect(bareCaptured?.locale).toBe('zh-CN')
    expect(bareCaptured?.preference).toBe('zh-CN')
    expect(bareCaptured?.isReady).toBe(true)
    expect(bareCaptured?.t('common.confirm')).toBe('确认')
    expect(bareT).not.toBeNull()
    expect(bareT?.('common.confirm')).toBe('确认')

    // 兜底 setPreference 为可 await 的 no-op：不抛错
    await expect(bareCaptured?.setPreference('en-US')).resolves.toBeUndefined()
    // no-op 后仍为 zh-CN（不产生任何持久化 / 状态变化）
    expect(bareCaptured?.locale).toBe('zh-CN')

    await act(async () => {
      renderer.unmount()
    })
  })
})

// ────────────────────────────────────────────────────────────────
// ⑦ 三态解析（'system' → 设备语言；必须 mock expo-localization）
// ────────────────────────────────────────────────────────────────
describe("I18nProvider —— 三态解析（'system'）", () => {
  it("setPreference('system') → preference='system'，设备语言 en-US ⇒ locale='en-US'", async () => {
    mockLocales = [{ languageTag: 'en-US' }]
    const renderer = await mount()
    await act(async () => {
      await captured?.setPreference('system')
    })
    expect(captured?.preference).toBe('system')
    expect(captured?.locale).toBe('en-US')
    expect(captured?.t('common.confirm')).toBe('Confirm')
    await act(async () => {
      renderer.unmount()
    })
  })

  it("setPreference('system') 且设备语言 zh-CN ⇒ locale='zh-CN'", async () => {
    mockLocales = [{ languageTag: 'zh-CN' }]
    const renderer = await mount()
    await act(async () => {
      await captured?.setPreference('system')
    })
    expect(captured?.preference).toBe('system')
    expect(captured?.locale).toBe('zh-CN')
    expect(captured?.t('common.confirm')).toBe('确认')
    await act(async () => {
      renderer.unmount()
    })
  })

  it("hydrate 'system'（预置 os.locale='system'）+ 设备语言 en-US ⇒ locale='en-US'", async () => {
    mockLocales = [{ languageTag: 'en-US' }]
    await AsyncStorage.setItem(PREFERENCE_KEYS.locale, 'system')
    const renderer = await mount()
    expect(captured?.preference).toBe('system')
    expect(captured?.locale).toBe('en-US')
    await act(async () => {
      renderer.unmount()
    })
  })
})

// ────────────────────────────────────────────────────────────────
// ⑧ 探测失败兜底
// ────────────────────────────────────────────────────────────────
describe('I18nProvider —— 探测失败兜底', () => {
  it("getLocales 抛错 ⇒ locale='zh-CN' 且不崩", async () => {
    mockProbeThrows = true
    const renderer = await mount()
    await act(async () => {
      await captured?.setPreference('system')
    })
    expect(captured?.preference).toBe('system')
    expect(captured?.locale).toBe('zh-CN')
    await act(async () => {
      renderer.unmount()
    })
  })

  it("getLocales 返回空数组 ⇒ locale='zh-CN' 且不崩", async () => {
    mockLocales = []
    const renderer = await mount()
    await act(async () => {
      await captured?.setPreference('system')
    })
    expect(captured?.preference).toBe('system')
    expect(captured?.locale).toBe('zh-CN')
    await act(async () => {
      renderer.unmount()
    })
  })

  it('getLocales 返回 null ⇒ locale=\'zh-CN\' 且不崩', async () => {
    mockLocales = null
    const renderer = await mount()
    await act(async () => {
      await captured?.setPreference('system')
    })
    expect(captured?.locale).toBe('zh-CN')
    await act(async () => {
      renderer.unmount()
    })
  })
})

// ────────────────────────────────────────────────────────────────
// ⑨ user.locale seed 优先级
// ────────────────────────────────────────────────────────────────
describe('I18nProvider —— user.locale seed 优先级', () => {
  it("本地无偏好 + seed='en-US' ⇒ locale='en-US'", async () => {
    mockSeedLocale = 'en-US'
    const renderer = await mount()
    expect(captured?.locale).toBe('en-US')
    expect(captured?.preference).toBe('en-US')
    await act(async () => {
      renderer.unmount()
    })
  })

  it("本地无偏好 + seed='zh-CN' ⇒ locale='zh-CN'", async () => {
    mockSeedLocale = 'zh-CN'
    const renderer = await mount()
    expect(captured?.locale).toBe('zh-CN')
    await act(async () => {
      renderer.unmount()
    })
  })

  it("本地偏好 'zh-CN' + seed='en-US' ⇒ 本地优先，locale='zh-CN'（不被 seed 覆盖）", async () => {
    mockSeedLocale = 'en-US'
    await AsyncStorage.setItem(PREFERENCE_KEYS.locale, 'zh-CN')
    const renderer = await mount()
    expect(captured?.locale).toBe('zh-CN')
    expect(captured?.preference).toBe('zh-CN')
    await act(async () => {
      renderer.unmount()
    })
  })

  it("本地偏好 'en-US' + seed='zh-CN' ⇒ 本地优先，locale='en-US'", async () => {
    mockSeedLocale = 'zh-CN'
    await AsyncStorage.setItem(PREFERENCE_KEYS.locale, 'en-US')
    const renderer = await mount()
    expect(captured?.locale).toBe('en-US')
    await act(async () => {
      renderer.unmount()
    })
  })
})
