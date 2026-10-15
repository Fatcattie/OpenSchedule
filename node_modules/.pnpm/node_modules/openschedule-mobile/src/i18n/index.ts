/**
 * 职责：i18n 桶文件（增量 12 · L0 · T01）—— 统一导出类型、纯函数与字典。
 *
 * ★ **不含 hooks**：`useI18n` / `useT` 只从 `@/store/I18nProvider` 导出
 *   （`@/hooks` 桶被 14 个既有测试工厂式 mock，从桶取会在运行时炸，N6 铁律）。
 */

export type { Locale, LocalePreference, TParams, TranslationKey } from './types'
export { interpolate, translate } from './translate'
export { resolveSystemLocale } from './systemLocale'
export { zh } from './locales/zh'
export { en } from './locales/en'
