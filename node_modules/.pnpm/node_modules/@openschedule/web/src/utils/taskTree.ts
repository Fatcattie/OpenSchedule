/**
 * 职责：协作工作台任务树与时间冲突工具
 *
 * 覆盖需求：
 * - 需求 3：子任务挂在父任务下展示（buildTaskTree / flattenTaskTree）
 * - 需求 4：个人计划与任务时间冲突检测（detectTimeConflict）
 * - 需求 9：合并任务时整棵子树转移，且需防止把自己挂到自己的子孙下（findDescendantIds）
 */
import dayjs from 'dayjs'
import type { Task, WorkspaceTask } from '@/types'

/** 任务树节点（带层级深度，供列表缩进渲染） */
export interface TaskNode {
  task: WorkspaceTask
  children: TaskNode[]
  depth: number
}

/**
 * 把后端 Task 补齐为工作台任务。
 * 对已是 WorkspaceTask 的对象保留原值，仅填补缺失字段，保证 localStorage 历史数据可读。
 */
export function toWorkspaceTask(t: Task & Partial<Omit<WorkspaceTask, keyof Task>>): WorkspaceTask {
  return {
    ...t,
    taskMode: t.taskMode ?? 'team',
    kind: t.kind ?? 'task',
    needReview: t.needReview ?? false,
    reviewStatus: t.reviewStatus ?? 'none',
    proposalStatus: t.proposalStatus ?? 'none',
    participants: t.participants ?? [],
    reviewOfTaskId: t.reviewOfTaskId ?? null,
    startAt: t.startAt ?? null,
    endAt: t.endAt ?? t.dueAt ?? null,
    importance: t.importance,
    urgencyDegree: t.urgencyDegree,
    sop: t.sop ?? null,
    approvalStatus: t.approvalStatus ?? 'none',
    approvalType: t.approvalType ?? null,
    recommendedAssigneeId: t.recommendedAssigneeId ?? null,
    pendingContent: t.pendingContent ?? null,
    executionLogs: (t.executionLogs ?? []).map((l) => ({ ...l, attachments: l.attachments ?? [] })),
    comments: (t.comments ?? []).map((c) => ({ ...c, attachments: c.attachments ?? [] })),
    completion: t.completion ?? null,
    auditLogs: t.auditLogs ?? [],
    dailyPlans: t.dailyPlans ?? [],
    isDraft: t.isDraft ?? false,
    pendingDelete: t.pendingDelete ?? false,
    pendingSop: t.pendingSop ?? null,
  }
}

/** 批量补齐，并按 sortOrder 稳定排序 */
export function normalizeTasks(tasks: WorkspaceTask[]): WorkspaceTask[] {
  return [...tasks].map(toWorkspaceTask).sort((a, b) => a.sortOrder - b.sortOrder)
}

/** 构建任务树：parentId 为 null 的是顶层主任务 */
export function buildTaskTree(tasks: WorkspaceTask[], parentId: string | null = null, depth = 0): TaskNode[] {
  return tasks
    .filter((t) => (t.parentId ?? null) === parentId)
    .map((t) => ({
      task: t,
      depth,
      children: depth >= 3 ? [] : buildTaskTree(tasks, t.id, depth + 1),
    }))
}

/** 按折叠状态展开为一维数组，供表格/列表逐行渲染 */
export function flattenTaskTree(nodes: TaskNode[], collapsed: Set<string> = new Set()): TaskNode[] {
  const out: TaskNode[] = []
  const walk = (list: TaskNode[]) => {
    list.forEach((n) => {
      out.push(n)
      if (!collapsed.has(n.task.id) && n.children.length > 0) walk(n.children)
    })
  }
  walk(nodes)
  return out
}

/** 收集某任务的全部后代 id（含子、孙…），用于合并任务时整棵子树转移 */
export function findDescendantIds(tasks: WorkspaceTask[], rootId: string): string[] {
  const out: string[] = []
  const walk = (pid: string) => {
    tasks.filter((t) => t.parentId === pid).forEach((t) => {
      out.push(t.id)
      walk(t.id)
    })
  }
  walk(rootId)
  return out
}

/** 判断 maybeChildId 是否在 ancestorId 的子树内（防止合并成环） */
export function isDescendant(tasks: WorkspaceTask[], ancestorId: string, maybeChildId: string): boolean {
  return findDescendantIds(tasks, ancestorId).includes(maybeChildId)
}

/** 判断某用户是否参与任务及其整棵子树（创建人或承接人） */
export function isUserInTaskSubtree(tasks: { parentId: string | null; assigneeId: string | null; createdBy: string; id: string }[], rootId: string, userId: string): boolean {
  const ids = new Set([rootId, ...findDescendantIds(tasks as WorkspaceTask[], rootId)])
  return tasks.some((t) => ids.has(t.id) && (t.assigneeId === userId || t.createdBy === userId))
}

/**
 * 需求 4：统一任务跳转规则 —— 所有板块点击任务名称时使用。
 * 父级任务（无父级）或含下级子任务的任务 → 任务详情页 /tasks/:id；
 * 叶子子任务（有父级且无下级）→ 任务执行页 /tasks/:id/execution。
 */
export function taskRoute(
  tasks: { id: string; parentId: string | null }[],
  task: { id: string; parentId: string | null },
): string {
  const hasChildren = tasks.some((t) => t.parentId === task.id)
  if (task.parentId === null || hasChildren) return `/tasks/${task.id}`
  return `/tasks/${task.id}/execution`
}

/** 判断任务周期是否超过一天（需求 5：跨天任务才需要每日节点规划） */
export function spansMoreThanOneDay(t: { startAt?: string | null; endAt?: string | null }): boolean {
  if (!t.startAt || !t.endAt) return false
  return dayjs(t.endAt).diff(dayjs(t.startAt), 'day') >= 1
}

export interface TimeRange {
  start: string
  end: string
}

/** 取任务的排期区间：优先 startAt/endAt，回退 startedAt/dueAt */
export function getTaskTimeRange(t: WorkspaceTask): TimeRange | null {
  const start = t.startAt ?? t.startedAt ?? null
  const end = t.endAt ?? t.dueAt ?? null
  if (!start && !end) return null
  return { start: start ?? (end as string), end: end ?? (start as string) }
}

/**
 * 检测候选时间区间与既有任务是否重叠（需求 4）。
 * 半开区间判定：仅端点相接不算冲突（如 10:00-11:00 与 11:00-12:00）。
 */
export function detectTimeConflict(
  candidate: TimeRange,
  tasks: WorkspaceTask[],
  excludeId?: string,
): WorkspaceTask[] {
  const cs = dayjs(candidate.start)
  const ce = dayjs(candidate.end)
  if (!cs.isValid() || !ce.isValid() || !ce.isAfter(cs)) return []
  return tasks.filter((t) => {
    if (t.id === excludeId) return false
    if (t.status === 'cancelled') return false
    const r = getTaskTimeRange(t)
    if (!r) return false
    const rs = dayjs(r.start)
    const re = dayjs(r.end)
    if (!rs.isValid() || !re.isValid()) return false
    return cs.isBefore(re) && ce.isAfter(rs)
  })
}

/** 统计子树完成情况（父任务进度 = 后代完成数 / 后代总数） */
export function getSubtreeProgress(tasks: WorkspaceTask[], rootId: string): { done: number; total: number; percent: number } {
  const ids = findDescendantIds(tasks, rootId)
  const children = tasks.filter((t) => ids.includes(t.id) && t.kind !== 'review')
  if (children.length === 0) return { done: 0, total: 0, percent: 0 }
  const done = children.filter((t) => t.status === 'done').length
  return { done, total: children.length, percent: Math.round((done / children.length) * 100) }
}

/**
 * 半开区间重叠判定（需求 4/6/7）：仅端点相接不算冲突。
 */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const as = dayjs(aStart)
  const ae = dayjs(aEnd)
  const bs = dayjs(bStart)
  const be = dayjs(bEnd)
  if (!as.isValid() || !ae.isValid() || !bs.isValid() || !be.isValid()) return false
  return as.isBefore(be) && ae.isAfter(bs)
}

/**
 * 取某「人」相关的有时间区间的事项（用于「仅同人」冲突检测，需求 4/6/7/8）。
 * 关联口径：承接人 / 创建人 / 参与者；排除已取消、以及没有起止时间的条目。
 */
export function personItems(tasks: WorkspaceTask[], userId: string): WorkspaceTask[] {
  return tasks.filter((t) => {
    if (t.status === 'cancelled') return false
    if (!t.startAt || !t.endAt) return false
    return t.assigneeId === userId || t.createdBy === userId || t.participants.includes(userId)
  })
}

/**
 * 仅同人冲突检测：候选区间是否与某用户相关的其他事项重叠（排除自身）。
 */
export function detectPersonTimeConflict(
  candidate: TimeRange,
  tasks: WorkspaceTask[],
  userId: string,
  excludeId?: string,
): WorkspaceTask[] {
  return detectTimeConflict(candidate, personItems(tasks, userId), excludeId)
}

/** 冲突簇：同一人名下互相时间重叠的一组事项 */
export interface ConflictCluster {
  id: string
  ownerId: string
  items: WorkspaceTask[]
}

/**
 * 构建单人的全部时间冲突簇（需求 7/8）：将互相重叠的事项按连通分量聚成一组。
 * 仅当一组内 >= 2 个事项时才算冲突簇。
 */
export function buildPersonConflicts(tasks: WorkspaceTask[], userId: string): ConflictCluster[] {
  const items = personItems(tasks, userId)
  const n = items.length
  const adj: number[][] = items.map(() => [])
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (rangesOverlap(items[i].startAt!, items[i].endAt!, items[j].startAt!, items[j].endAt!)) {
        adj[i].push(j)
        adj[j].push(i)
      }
    }
  }
  const seen = new Array(n).fill(false)
  const clusters: ConflictCluster[] = []
  for (let i = 0; i < n; i++) {
    if (seen[i]) continue
    const stack = [i]
    seen[i] = true
    const comp: number[] = []
    while (stack.length) {
      const cur = stack.pop()!
      comp.push(cur)
      for (const nb of adj[cur]) {
        if (!seen[nb]) {
          seen[nb] = true
          stack.push(nb)
        }
      }
    }
    if (comp.length >= 2) {
      const memberIds = comp.map((k) => items[k].id)
      clusters.push({
        id: `cc-${userId}-${memberIds.join('-')}`,
        ownerId: userId,
        items: comp.map((k) => items[k]),
      })
    }
  }
  return clusters
}
