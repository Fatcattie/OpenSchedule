/**
 * 职责：en 字典 —— 通用组件 / 全局提示域（增量 12 · L3 · T02 填充）。
 *
 * ★ 键集合必须与 `zh/ui.ts` **完全一致**（由 `en/index.ts` 的
 *   `Record<TranslationKey, string>` 在编译期强制：漏键 / 多键均为编译错误）。
 * ★ 语言名 `中文` / `English` **用自身语言书写、不翻译**，故不在此登记（由 ProfileScreen 常量承载）；
 *   仅第三态功能项 `跟随系统` / `System` 随界面语言变化，登记为 `profile.language.system`。
 */

/** 通用组件与全局提示词条（英文） */
export const ui = {
  // ── L1「我的 → 语言」区块（与「外观」同构）────────────────────────
  'profile.language.title': 'Language',
  'profile.language.system': 'System',
  'profile.language.residual': 'Dates, demo data and server messages remain in Chinese.',

  // ── 错误态（StateViews.ErrorState）──────────────────────────────
  'component.error.title': 'Load failed',
  'component.error.description': 'Network error. Check your connection and retry.',

  // ── 全局提示层（增量 8）────────────────────────────────────────
  'component.refreshToast.message': 'Back online, refreshed',
  'component.undoToast.undo': 'Undo',
  'component.offline.title.network': 'No network connection',
  'component.offline.title.server': 'Service temporarily unavailable',
  'component.offline.subtitle': 'Showing last cached content',
  'component.stale.badge': 'Cached',
  'component.stale.updatedAt': 'Updated {time}',

  // ── 排期视图（ScheduleTimeline）────────────────────────────────
  'component.schedule.dragging': '{title} dragging',
}
