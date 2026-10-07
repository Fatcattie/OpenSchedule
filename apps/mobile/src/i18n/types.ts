/**
 * 职责：i18n 运行时类型契约（增量 12 · L0 · T01）。
 *
 * - `Locale`：**已解析**语言（字典查找只认这两个值；`'system'` 不得流入）；
 * - `LocalePreference`：用户偏好三态（第三态 `'system'` 由用户显式选择才生效；默认 `'zh-CN'`）；
 * - `TParams`：极简插值参数（`{name}` → `params.name`）；
 * - `TranslationKey`：全部翻译键（**单一事实来源 = `zh` 各域合并后的键联合**，`en` 必须与之一致）。
 *
 * 依赖方向（避免循环引用）：本文件仅以 `import type` 引用 `./locales/zh`
 * （`import type` 在编译期被完全擦除）⇒ 运行时**不存在** `types ↔ locales` 循环。
 */

import type { zh } from './locales/zh'

/** 已解析语言（字典查找只认这两个值；`'system'` 不得流入） */
export type Locale = 'zh-CN' | 'en-US'

/** 用户偏好三态（第三态由用户显式选择才生效；默认 `'zh-CN'`） */
export type LocalePreference = Locale | 'system'

/** 极简插值参数（`{name}` → `params.name`） */
export type TParams = Record<string, string | number>

/** 全部翻译键（`zh` 单一事实来源；`en` 必须与之一致，漏键 / 多键均为编译错误） */
export type TranslationKey = keyof typeof zh
