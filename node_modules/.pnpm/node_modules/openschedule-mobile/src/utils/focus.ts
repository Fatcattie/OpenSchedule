/**
 * 职责：「今日聚焦」头部汇总口径的**唯一**纯函数实现点（K13 / PRD M4-P0-02）。
 * 本文件只放无副作用纯函数（不读 `db`、无 IO、无 React），便于独立单测（AC-02 / INV-7）。
 */
import type { Task } from '@/types'

/** 「今日聚焦」三分组的最小结构约束（`TodayFocusData` 结构上满足之） */
export interface FocusGroups {
  dueToday: readonly Task[]
  pendingReview: readonly Task[]
  approaching: readonly Task[]
}

/**
 * 今日聚焦头部汇总口径：**三分组按 `task.id` 取并集后计数**（PRD M4-P0-02 / INV-7）。
 *
 * 语义：
 * - `groups == null` ⇒ 返回 `0`（页面取数未就绪时的等价空口径）；
 * - `options.includeReview === false`（member 角色）⇒ `pendingReview` 分组**整组不参与并集**
 *   （**不是**「先并集再减 1」：若某任务同属 `dueToday` 与 `pendingReview`，member 视角下
 *   它**仍应计 1**，因为它确实出现在「今日到期」里）；
 * - 同一 `task.id` 在多个分组出现 ⇒ 去重后**计 1**；
 * - 计数单位是**唯一任务**，与「分组徽标 = 分组长度」是两个不同口径（K13），不得混用。
 *
 * ⚠️ 口径锚点（M5-P0-04 / INV-2 / ① 裁定 R5-1，**零行为变更**）：
 * - **徽标** = 该分组的**长度**（`TodayFocusScreen` 的 `counts`，按分组 `length` 注入）；
 * - **头部 N** = 三分组按 `task.id` 的**并集基数**（本函数返回值）；
 * - 二者**允许不等**（`badgeSum ≥ headerUnion`）—— 因为三分组是**三种视角**（日历日 / 角色 /
 *   滚动 24h），不是对全集的一次划分，重叠是定义使然（`dueToday ∩ approaching` 为交叉重叠，
 *   且**不是**包含关系）；
 * - **不得**为「让二者相等」而改变任一分组的取数内容（会让每个列表不再符合自己的定义：
 *   例如「临期预警排除今日到期」会把最紧急的今日到期任务从预警里拿掉 ⇒ 安全退化）。
 *
 * @param groups 三分组数据（`null` / `undefined` 视为空）
 * @param options.includeReview 是否计入「待我审核」分组（= `can('review:view_pending')`）
 * @returns 唯一任务数（非负整数）
 */
export function countVisibleFocusTasks(
  groups: FocusGroups | null | undefined,
  options: { includeReview: boolean },
): number {
  if (!groups) return 0
  const ids = new Set<string>()
  for (const task of groups.dueToday) ids.add(task.id)
  for (const task of groups.approaching) ids.add(task.id)
  if (options.includeReview) {
    for (const task of groups.pendingReview) ids.add(task.id)
  }
  return ids.size
}
