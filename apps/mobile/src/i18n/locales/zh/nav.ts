/**
 * 职责：zh 字典 —— 导航层域（增量 12 · L2 · T02 填充）。
 *
 * 键前缀：`nav.*`。覆盖底部 5 Tab 标题（权威登记）· 冷启动品牌态 · AI 提议抽屉（路由级 transparentModal）。
 *
 * ★ 硬边界（F10 / §0.2-Q10）：`navigation/MainTabs.tsx` 源码必须继续出现 5 个中文 Tab 字面串
 *   （`tests/increment-ui-polish.test.tsx:358-365` 对源码做文本断言），故 MainTabs 内部保留
 *   `TAB_LABEL` 表（含 5 个中文字面串）并按 locale 选表渲染；本文件的 `nav.tab.*` 为**字典权威登记**，
 *   供跨文件消费 / 深链等场景取词，取值与 `TAB_LABEL` 完全一致。
 */

/** 导航层词条（T02 填充） */
export const nav = {
  // ── 底部 5 Tab 标题（权威登记；MainTabs 渲染由 TAB_LABEL / TAB_LABEL_EN 选表）──
  'nav.tab.workspace': '工作台',
  'nav.tab.today': '今日',
  'nav.tab.project': '项目',
  'nav.tab.time': '时间',
  'nav.tab.me': '我的',

  // ── 冷启动品牌态（RootNavigator 的 BootSplash）────────────────────
  'nav.boot.restoring': '正在恢复会话…',

  // ── AI 提议抽屉（navigation/stacks.tsx 的 AiProposalSheetScreen）──
  'nav.proposal.title': 'AI 提议',
  'nav.proposal.status': '状态：{status}',
  'nav.proposal.missingTitle': '提议不存在或已过期',
  'nav.proposal.missingDescription': '可能已被处理，请返回刷新',
  'nav.proposal.reject': '驳回',
  'nav.proposal.confirm': '确认落库',
  'nav.proposal.demoReason': '演示环境驳回',
} as const
