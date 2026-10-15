/**
 * 职责：i18n 纯函数运行时（增量 12 · L0 · T01）。
 *
 * - `interpolate(template, params?)`：极简插值（`{name}` → `params.name`；缺失参数**保留占位符**，不抛错）；
 * - `translate(locale, key, params?)`：取词，**缺键回退 zh → 回退 key 本身**（绝不抛错、绝不空白）；
 *   `__DEV__` 下缺键 `console.warn`（零依赖告警）。
 *
 * 类型铁律（A6）：`locale` 参数类型**只接受 `Locale`**（`'zh-CN' | 'en-US'`），
 * `'system'` 在**类型层不可传入**（`'system'` 只存在于偏好层）。
 *
 * 本文件零 React 依赖，可独立单测。
 */

import type { Locale, TParams, TranslationKey } from './types'
import { zh } from './locales/zh'
import { en } from './locales/en'

/** 全部语言字典（键集合由 `zh` 派生强制一致） */
const DICTS: Record<Locale, Record<TranslationKey, string>> = {
  'zh-CN': zh,
  'en-US': en,
}

/**
 * 极简插值：把模板中的 `{name}` 替换为 `params.name`。
 *
 * 缺失参数**保留原占位符**（不抛错、不输出 `undefined`）；未传 `params` 时原样返回。
 *
 * @param template 含 `{占位符}` 的模板串
 * @param params   插值参数（可选）
 * @returns 插值后的字符串
 */
export function interpolate(template: string, params?: TParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  )
}

/**
 * 取词：按语言与键取文案并插值。
 *
 * 回退链（绝不抛错、绝不空白）：`dict[key]` → `zh[key]` → `key` 本身；
 * 仅在 `__DEV__` 下对完全缺键做 `console.warn`（生产环境静默）。
 *
 * @param locale 已解析语言（**只接受 `Locale`**；`'system'` 类型层不可传入）
 * @param key    翻译键（`TranslationKey`，写错键名 = 编译错误）
 * @param params 插值参数（可选）
 * @returns 对应文案（含插值）
 */
export function translate(locale: Locale, key: TranslationKey, params?: TParams): string {
  const dict = DICTS[locale] ?? zh
  const template = dict[key] ?? zh[key]
  if (template === undefined) {
    if (__DEV__) console.warn(`[i18n] missing key: ${key}`)
    return key
  }
  return interpolate(template, params)
}
