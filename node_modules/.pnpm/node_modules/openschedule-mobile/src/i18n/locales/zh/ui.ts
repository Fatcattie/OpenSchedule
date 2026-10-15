/**
 * 职责：zh 字典 —— 通用组件 / 全局提示域（增量 12 · L3 · T02 填充）。
 *
 * 键前缀：`profile.language.*`（L1「语言」区块）· `component.*`（无业务语义的通用组件与全局提示层）。
 * ★ 本文件由 T02 独占；zh 取值**必须与改造前逐字相同**（既有 ≈216 处中文断言的前提）。
 */

/** 通用组件与全局提示词条（T02 填充） */
export const ui = {
  // ── L1「我的 → 语言」区块（与「外观」同构）────────────────────────
  'profile.language.title': '语言',
  'profile.language.system': '跟随系统',
  'profile.language.residual': '日期格式 / 演示数据 / 服务端提示仍为中文',

  // ── 错误态（StateViews.ErrorState）──────────────────────────────
  'component.error.title': '加载失败',
  'component.error.description': '网络异常，请检查网络后重试',

  // ── 全局提示层（增量 8）────────────────────────────────────────
  'component.refreshToast.message': '网络已恢复，已刷新',
  'component.undoToast.undo': '撤销',
  'component.offline.title.network': '当前无网络连接',
  'component.offline.title.server': '服务暂时不可用',
  'component.offline.subtitle': '正在显示上次缓存内容',
  'component.stale.badge': '缓存',
  'component.stale.updatedAt': '上次更新 {time}',

  // ── 排期视图（ScheduleTimeline）────────────────────────────────
  'component.schedule.dragging': '{title} 拖动中',
} as const
