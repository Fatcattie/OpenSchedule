/**
 * 职责：zh 权威字典（增量 12 · L0 · T01 独占）—— 合并各域为单一对象。
 *
 * ★ 本文件由 T01 独占（一次注册全部域）；T02–T05 只填充各自拥有的域文件，**不触碰本文件**。
 *
 * 键类型约束：各域 `as const` ⇒ `zh` 的键为字面量联合 ⇒ `TranslationKey = keyof typeof zh`。
 */

import { business } from './business'
import { common } from './common'
import { domain } from './domain'
import { nav } from './nav'
import { screensCore } from './screens.core'
import { screensMore } from './screens.more'
import { services } from './services'
import { ui } from './ui'

/** zh 权威字典（各域合并；键的单一事实来源） */
export const zh = {
  ...common,
  ...domain,
  ...nav,
  ...ui,
  ...screensCore,
  ...screensMore,
  ...business,
  ...services,
} as const
