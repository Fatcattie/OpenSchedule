/**
 * 职责：今日聚焦前端排序 —— 后端 `services/api/src/modules/tasks/today.ts` 的同口径前端移植
 *
 * `GET /me/today` 服务端已按「逾期 → 截止时间 → 优先级 → 原始顺序」排序返回；
 * 前端将 dueAt 映射为 Date 后按同一算法再排一次，保证展示顺序与服务端口径一致
 * （即使未来服务端排序变化或分页合并导致乱序，前端展示仍稳定）。
 */

/** 今日聚焦展示项（前端视图形态；dueAt 已解析为 Date） */
export interface TodayItem {
  id: string
  title: string
  /** team=团队任务（指派给我）；personal=个人任务 */
  type: 'team' | 'personal'
  status: string
  priority: string
  dueAt: Date | null
}

const PRIORITY_WEIGHT: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 }

export function sortTodayItems<T extends TodayItem>(items: T[], now = new Date()): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aOverdue = !!a.item.dueAt && a.item.dueAt.getTime() < now.getTime()
      const bOverdue = !!b.item.dueAt && b.item.dueAt.getTime() < now.getTime()
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
      if (a.item.dueAt && b.item.dueAt && a.item.dueAt.getTime() !== b.item.dueAt.getTime()) {
        return a.item.dueAt.getTime() - b.item.dueAt.getTime()
      }
      if (!!a.item.dueAt !== !!b.item.dueAt) return a.item.dueAt ? -1 : 1
      if (a.item.dueAt && b.item.dueAt) {
        const priorityDiff = (PRIORITY_WEIGHT[b.item.priority] ?? 0) - (PRIORITY_WEIGHT[a.item.priority] ?? 0)
        if (priorityDiff) return priorityDiff
      }
      return a.index - b.index
    })
    .map(({ item }) => item)
}
