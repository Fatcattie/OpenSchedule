/**
 * 职责：en 字典（增量 12 · L0 · T01 独占）—— 合并各域，类型为 `Record<TranslationKey, string>`。
 *
 * ★ 类型约束：`en` 显式标注 `Record<TranslationKey, string>` ⇒ **漏键**（缺属性）与
 *   **多键**（多余属性，对象字面量触发 excess property check）**均为编译错误**。
 * ★ 本文件由 T01 独占（一次注册全部域）；T02–T05 只填充各自拥有的域文件。
 */

import type { TranslationKey } from '../../types'
import { business } from './business'
import { common } from './common'
import { domain } from './domain'
import { nav } from './nav'
import { screensCore } from './screens.core'
import { screensMore } from './screens.more'
import { services } from './services'
import { ui } from './ui'

/** en 字典（各域合并；键集合由 `zh` 派生强制一致） */
export const en: Record<TranslationKey, string> = {
  ...common,
  ...domain,
  ...nav,
  ...ui,
  ...screensCore,
  ...screensMore,
  ...business,
  ...services,
}
