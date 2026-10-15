/**
 * 职责：设备语言探测适配层（增量 12 · L0 · T01）—— 全仓**唯一**可引用 `expo-localization` 的模块。
 *
 * 唯一职责：把「设备语言」收敛为 `Locale`。
 *
 * 三级兜底（永不抛错）：
 *   ① 设备语言 `zh*` → `'zh-CN'`；
 *   ② 其余一切 → `'en-US'`；
 *   ③ 探测抛错 / 返回空 → `'zh-CN'`。
 *
 * 懒加载（`M-P2-05-27` ④）：顶层**不做运行时 `import`**，仅 `import type`（编译期擦除）；
 * 真正的 `require('expo-localization')` 放在函数体内 —— 默认路径（偏好 ≠ `'system'`）永不执行此
 * `require` ⇒ **不加载原生模块**、既有 55 套件零新增 mock。
 *
 * Web 支持：`expo-localization` 在 Web 走 `navigator.language`，`getLocales()` 返回同一形状
 * ⇒ 本实现天然支持 Web，无需 Web 专用分支。
 */

import type { Locale } from './types'
// ★ 仅类型引用（编译期擦除）——顶层不做运行时 import，保证默认路径零副作用
import type * as ExpoLocalization from 'expo-localization'

/**
 * 解析设备语言 → 生效 `Locale`（三级兜底，永不抛错）。
 *
 * 仅在偏好 = `'system'` 时被 `I18nProvider` 调用；其余路径不触发本函数。
 *
 * @returns `'zh-CN'`（设备语言 `zh*` / 探测异常 / 返回空）或 `'en-US'`（其余）
 */
export function resolveSystemLocale(): Locale {
  try {
    // 懒加载：默认路径（偏好 ≠ 'system'）永不执行此 require ⇒ 不加载原生模块
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-localization') as typeof ExpoLocalization
    const locales = mod.getLocales?.() ?? []
    const first = locales[0]
    const tag = String(first?.languageTag ?? first?.languageCode ?? '').toLowerCase()
    if (!tag) return 'zh-CN' // 空 → zh
    return tag.startsWith('zh') ? 'zh-CN' : 'en-US' // zh* → zh；其余一切 → en
  } catch {
    return 'zh-CN' // 抛错 → zh
  }
}
