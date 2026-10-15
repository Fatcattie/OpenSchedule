/**
 * 职责：导航返回的**兜底判据**（纯函数，无 React / 无副作用，可单测）。
 *
 * ── 缺陷背景（本次修复） ────────────────────────────────────────────────
 * 根共享栈（`MainRootStack`）的 6 个页面 —— TaskDetail / Notifications / Submission /
 * CreateItem / PersonalPlan / MySubmissions —— 全部注册在 **Tab 容器之上**（全屏覆盖
 * TabBar）。它们的返回按钮一律写死 `navigation.goBack()`。
 *
 * 这在**应用内 push** 的路径下没问题（栈内有 `Tabs` 兜底）。但应用**冷启动直达深链**时
 * （真机：点击推送通知 → `openschedule://task/xxx`；Web：直接在地址栏打开 `/personal-plan`
 * 或在该页按 F5），根栈中**只有目标页本身**，其下没有 `Tabs` —— 此时 `goBack()` 是
 * **空操作**：按钮点了没反应，且因为 TabBar 被全屏覆盖，用户**彻底无法离开该页**。
 *
 * ── 判据 ──────────────────────────────────────────────────────────────
 * - `canGoBack()` 为真 ⇒ 正常返回上一页（应用内路径，行为与修复前**逐字节一致**）；
 * - `canGoBack()` 为假 ⇒ 兜底 `navigate(Tabs)`，落到工作台，保证**任何情况下都出得去**。
 *
 * 仅改「无路可退」这一种状态，其余状态零行为变更。
 */
import type { AppNavigationProp } from '@/types'

/** 兜底落点：底部 Tab 容器（其初始 Tab 即工作台） */
export const ROOT_FALLBACK_ROUTE = 'Tabs' as const

/** 返回按钮所需的最小导航能力（便于单测注入替身） */
export type BackCapableNavigation = Pick<AppNavigationProp, 'canGoBack' | 'goBack' | 'navigate'>

/**
 * 返回上一页；**栈内无可返回时兜底跳回 Tab 容器**。
 *
 * @param navigation 页面通过 `useNavigation<AppNavigationProp>()` 取得的导航对象
 */
export function goBackOrHome(navigation: BackCapableNavigation): void {
  if (navigation.canGoBack()) {
    navigation.goBack()
    return
  }
  navigation.navigate(ROOT_FALLBACK_ROUTE)
}
