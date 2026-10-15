/**
 * 职责：**模块级 locale 访问器**（增量 12 · L7 · T05）—— 供**非 React** 的服务层 / 工具层取词。
 *
 * 背景：`src/services/**` 与 `src/utils/**` 是纯模块，**不能调用 `useT()`**，且**不得改动服务函数签名**
 * （否则会与并行中的屏幕层耦合）。故由 `I18nProvider` 在渲染期把已解析的 `locale` 同步到本模块，
 * 服务层 / 工具层在**函数体内**读取 `getCurrentLocale()` 取词。
 *
 * 铁律：
 * - **默认 `'zh-CN'`**（模块初始值即 `'zh-CN'`）⇒ 既有服务层测试（不包裹 `I18nProvider`）仍得中文，零回归；
 * - **必须在函数体内调用**（顶层求值会冻结语言，切换语言不生效）；
 * - `translateCurrent` 内部**懒加载** `translate`，避免 `current → translate → locales/zh → utils/* → current`
 *   的**循环依赖**（`locales/zh/domain.ts` 反向依赖 `utils/submission` / `utils/audit`）。
 */

import type { Locale, TParams, TranslationKey } from './types'

/** 当前生效语言（模块级；由 `I18nProvider` 同步；默认 `'zh-CN'`） */
let currentLocale: Locale = 'zh-CN'

/** 读取当前生效语言（非 React 模块取词入口） */
export function getCurrentLocale(): Locale {
  return currentLocale
}

/** 写入当前生效语言（仅由 `I18nProvider` 调用） */
export function setCurrentLocale(locale: Locale): void {
  currentLocale = locale
}

/**
 * 取词（非 React 模块便捷入口）：等价 `translate(getCurrentLocale(), key, params)`。
 *
 * ⚠️ 内部**懒 `require`** `translate`：本模块被服务层 / 工具层广泛引用，而其中
 * `utils/submission.ts` / `utils/audit.ts` 又被 `locales/zh/domain.ts` 反向依赖 —— 若在顶层静态
 * `import` 会把 `i18n/translate → locales/zh → utils/*` 闭成循环（ESM 下触发 TDZ /
 * babel-CJS 下读到 `undefined`）。懒加载使该边在**运行时**（模块全部就绪后）才建立。
 *
 * @param key    翻译键（`TranslationKey`，写错键名 = 编译错误）
 * @param params 插值参数（可选）
 * @returns 当前语言下的文案（含插值）
 */
export function translateCurrent(key: TranslationKey, params?: TParams): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('./translate') as typeof import('./translate')
  return mod.translate(currentLocale, key, params)
}
