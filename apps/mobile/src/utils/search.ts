/**
 * 职责：看板任务搜索 —— **纯函数**（关键词命中判定 / 看板列过滤）。
 *
 * 匹配语义与 Web 端 `apps/web/src/utils/searchWorkspace.ts` 的**任务分支**对齐：
 *   text = [title, description ?? '', (tags ?? []).join(' ')].join(' ')
 *   命中 = text.toLowerCase().indexOf(keyword.trim().toLowerCase()) >= 0
 * 即「标题 + 描述（可空）+ 标签」拼接后做**大小写不敏感的包含匹配**；关键词 `trim()` 后为空则不过滤。
 *
 * 依赖仅为**类型**（`import type`，编译期擦除、运行期零引用），避免与 `@/services` 形成循环依赖。
 */
import type { BoardColumn } from '@/services'
import type { Task } from '@/types'

/**
 * 关键词是否命中任务（标题 / 描述 / 标签，大小写不敏感）。
 * 关键词 `trim()` 后为空 ⇒ 恒为 `true`（不过滤，语义上「匹配全部」）。
 */
export function matchesTaskKeyword(task: Task, keyword: string): boolean {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return true
  const text = [task.title, task.description ?? '', (task.tags ?? []).join(' ')].join(' ')
  return text.toLowerCase().indexOf(kw) >= 0
}

/**
 * 按关键词过滤看板列。
 * - 保留列结构与顺序，仅替换 `tasks`（命中项保持原有顺序）；
 * - 关键词 `trim()` 后为空 ⇒ **原样返回**入参（引用不变，便于调用方做依赖比较）。
 */
export function filterBoardColumns(columns: BoardColumn[], keyword: string): BoardColumn[] {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return columns
  return columns.map((column) => ({
    ...column,
    tasks: column.tasks.filter((task) => matchesTaskKeyword(task, kw)),
  }))
}
