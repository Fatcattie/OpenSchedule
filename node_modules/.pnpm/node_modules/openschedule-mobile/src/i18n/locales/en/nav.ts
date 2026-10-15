/**
 * 职责：en 字典 —— 导航层域（增量 12 · L2 · T02 填充）。
 *
 * ★ 键集合必须与 `zh/nav.ts` **完全一致**（由 `en/index.ts` 的
 *   `Record<TranslationKey, string>` 在编译期强制：漏键 / 多键均为编译错误）。
 * ★ 术语表：Tab 标题取 PRD §6-D12（`Workspace / Today / Projects / Time / Me`，最短化防截断）。
 */

/** 导航层词条（英文） */
export const nav = {
  // ── 底部 5 Tab 标题（权威登记；MainTabs 渲染由 TAB_LABEL / TAB_LABEL_EN 选表）──
  'nav.tab.workspace': 'Workspace',
  'nav.tab.today': 'Today',
  'nav.tab.project': 'Projects',
  'nav.tab.time': 'Time',
  'nav.tab.me': 'Me',

  // ── 冷启动品牌态（RootNavigator 的 BootSplash）────────────────────
  'nav.boot.restoring': 'Restoring session…',

  // ── AI 提议抽屉（navigation/stacks.tsx 的 AiProposalSheetScreen）──
  'nav.proposal.title': 'AI proposal',
  'nav.proposal.status': 'Status: {status}',
  'nav.proposal.missingTitle': 'Proposal not found or expired',
  'nav.proposal.missingDescription': 'It may have already been handled. Go back and refresh.',
  'nav.proposal.reject': 'Reject',
  'nav.proposal.confirm': 'Confirm',
  'nav.proposal.demoReason': 'Rejected in demo environment',
}
