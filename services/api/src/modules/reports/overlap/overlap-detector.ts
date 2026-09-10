/**
 * overlap-detector.ts —— 重叠检测纯函数
 * 3 个维度：时间冲突、资源争抢、依赖交汇
 * 全部纯函数，可独立单测
 */

// ===== 基础类型 =====

export interface TaskForOverlap {
  id: string
  title: string
  assigneeId: string | null
  assigneeName?: string
  start: string // ISO date (YYYY-MM-DD)
  end: string   // ISO date (YYYY-MM-DD)
  estimatedHours: number
  status: string
  isOnCriticalPath?: boolean
}

export interface DependencyForOverlap {
  id: string
  prevTaskId: string
  nextTaskId: string
  isShared: boolean
  type: string
}

export type OverlapSeverity = 'low' | 'medium' | 'high'

// ===== 检测结果类型 =====

export interface TimeConflict {
  assigneeId: string
  assigneeName: string
  taskIds: string[]
  taskTitles: string[]
  overlapStart: string
  overlapEnd: string
  overlapDays: number
  severity: OverlapSeverity
}

export interface ResourceConflict {
  assigneeId: string
  assigneeName: string
  date: string
  totalHours: number
  threshold: number
  taskCount: number
  taskIds: string[]
  severity: OverlapSeverity
}

export interface DependencyHub {
  hubTaskId: string
  hubTaskTitle: string
  downstreamCount: number
  downstreamTasks: { id: string; title: string }[]
  isOnCriticalPath: boolean
  benefitScore: number
}

export interface OverlapSummary {
  timeConflicts: number
  resourceConflicts: number
  dependencyHubs: number
  totalAffectedTasks: number
  severity: OverlapSeverity
}

export interface OverlapResult {
  projectId: string
  generatedAt: string
  summary: OverlapSummary
  dimensions: {
    time: TimeConflict[]
    resource: ResourceConflict[]
    dependency: DependencyHub[]
  }
}

// ===== 工具函数 =====

/** YYYY-MM-DD -> Date (UTC 00:00) */
function parseDate(d: string): Date {
  return new Date(d + 'T00:00:00.000Z')
}

/** 两个闭区间 [a_start, a_end] ∩ [b_start, b_end] 的重叠天数（整数，含端点） */
function overlapDays(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const aS = parseDate(aStart).getTime()
  const aE = parseDate(aEnd).getTime()
  const bS = parseDate(bStart).getTime()
  const bE = parseDate(bEnd).getTime()
  const start = Math.max(aS, bS)
  const end = Math.min(aE, bE)
  if (start > end) return 0
  return Math.floor((end - start) / 86400000) + 1
}

/** 日期加 n 天，返回 YYYY-MM-DD */
function addDays(dateStr: string, n: number): string {
  const d = parseDate(dateStr)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** 取两个日期中较大的 */
function maxDate(a: string, b: string): string {
  return parseDate(a) >= parseDate(b) ? a : b
}

/** 取两个日期中较小的 */
function minDate(a: string, b: string): string {
  return parseDate(a) <= parseDate(b) ? a : b
}

/** 严重度：时间冲突 */
function timeSeverity(days: number): OverlapSeverity {
  if (days >= 4) return 'high'
  if (days >= 2) return 'medium'
  return 'low'
}

/** 严重度：资源争抢 */
function resourceSeverity(totalHours: number, threshold: number): OverlapSeverity {
  const ratio = totalHours / threshold
  if (ratio > 1.8) return 'high'
  if (ratio >= 1.3) return 'medium'
  return 'low'
}

// ===== 维度 1：时间冲突检测 =====

/**
 * 时间冲突：同一人在重叠时间段内有 2+ 个进行中/待办任务
 * 用并查集合并冲突组（A 撞 B，B 撞 C，A B C 同一组）
 */
export function detectTimeConflicts(tasks: TaskForOverlap[]): TimeConflict[] {
  const activeTasks = tasks.filter(t => t.assigneeId && t.status !== 'done' && t.status !== 'cancelled' && t.start && t.end)
  if (activeTasks.length < 2) return []

  // 按人分组
  const byAssignee = new Map<string, TaskForOverlap[]>()
  for (const t of activeTasks) {
    if (!t.assigneeId) continue
    const arr = byAssignee.get(t.assigneeId) ?? []
    arr.push(t)
    byAssignee.set(t.assigneeId, arr)
  }

  const result: TimeConflict[] = []

  for (const [assigneeId, myTasks] of byAssignee) {
    if (myTasks.length < 2) continue

    // 并查集
    const parent = new Map<string, string>()
    const find = (x: string): string => {
      if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!))
      return parent.get(x)!
    }
    const union = (a: string, b: string) => {
      const ra = find(a), rb = find(b)
      if (ra !== rb) parent.set(ra, rb)
    }
    for (const t of myTasks) parent.set(t.id, t.id)

    // 两两比较
    for (let i = 0; i < myTasks.length; i++) {
      for (let j = i + 1; j < myTasks.length; j++) {
        const od = overlapDays(myTasks[i].start, myTasks[i].end, myTasks[j].start, myTasks[j].end)
        if (od > 0) union(myTasks[i].id, myTasks[j].id)
      }
    }

    // 按根分组
    const groups = new Map<string, TaskForOverlap[]>()
    for (const t of myTasks) {
      const root = find(t.id)
      // 只有确实和别人冲突的才算（单元素不是冲突组）
      const arr = groups.get(root) ?? []
      arr.push(t)
      groups.set(root, arr)
    }

    for (const groupTasks of groups.values()) {
      if (groupTasks.length < 2) continue
      // 求所有任务的交集区间
      let oStart = groupTasks[0].start
      let oEnd = groupTasks[0].end
      for (let i = 1; i < groupTasks.length; i++) {
        oStart = maxDate(oStart, groupTasks[i].start)
        oEnd = minDate(oEnd, groupTasks[i].end)
      }
      const days = overlapDays(oStart, oEnd, oStart, oEnd)
      // 按 start 排序
      groupTasks.sort((a, b) => parseDate(a.start).getTime() - parseDate(b.start).getTime())
      result.push({
        assigneeId,
        assigneeName: groupTasks[0].assigneeName ?? assigneeId,
        taskIds: groupTasks.map(t => t.id),
        taskTitles: groupTasks.map(t => t.title),
        overlapStart: oStart,
        overlapEnd: oEnd,
        overlapDays: days,
        severity: timeSeverity(days),
      })
    }
  }

  // 按严重度降序、重叠天数降序
  const sevRank = { high: 3, medium: 2, low: 1 }
  result.sort((a, b) => sevRank[b.severity] - sevRank[a.severity] || b.overlapDays - a.overlapDays)
  return result
}

// ===== 维度 2：资源争抢检测 =====

/**
 * 资源争抢：同一人同一天被分配的估时 > 阈值
 * 假设：任务在 [start, end] 区间内平均分配每日工时 = estimatedHours / 总天数
 */
export function detectResourceConflicts(tasks: TaskForOverlap[], thresholdHoursPerDay = 8): ResourceConflict[] {
  const activeTasks = tasks.filter(t => t.assigneeId && t.status !== 'done' && t.status !== 'cancelled' && t.start && t.end && t.estimatedHours > 0)
  if (activeTasks.length === 0) return []

  // Map: assigneeId -> Map: date -> { totalHours, taskIds: [] }
  const dayMap = new Map<string, Map<string, { totalHours: number; taskIds: string[] }>>()

  for (const t of activeTasks) {
    if (!t.assigneeId) continue
    const totalDays = overlapDays(t.start, t.end, t.start, t.end)
    if (totalDays <= 0) continue
    const perDay = t.estimatedHours / totalDays

    let assigneeMap = dayMap.get(t.assigneeId)
    if (!assigneeMap) {
      assigneeMap = new Map()
      dayMap.set(t.assigneeId, assigneeMap)
    }

    for (let d = 0; d < totalDays; d++) {
      const date = addDays(t.start, d)
      const entry = assigneeMap.get(date) ?? { totalHours: 0, taskIds: [] }
      entry.totalHours += perDay
      entry.taskIds.push(t.id)
      assigneeMap.set(date, entry)
    }
  }

  const result: ResourceConflict[] = []
  for (const [assigneeId, assigneeMap] of dayMap) {
    for (const [date, entry] of assigneeMap) {
      if (entry.totalHours > thresholdHoursPerDay) {
        // 找一个名字
        const nameTask = activeTasks.find(t => t.assigneeId === assigneeId && entry.taskIds.includes(t.id))
        result.push({
          assigneeId,
          assigneeName: nameTask?.assigneeName ?? assigneeId,
          date,
          totalHours: Math.round(entry.totalHours * 100) / 100,
          threshold: thresholdHoursPerDay,
          taskCount: entry.taskIds.length,
          taskIds: entry.taskIds,
          severity: resourceSeverity(entry.totalHours, thresholdHoursPerDay),
        })
      }
    }
  }

  const sevRank = { high: 3, medium: 2, low: 1 }
  result.sort((a, b) => sevRank[b.severity] - sevRank[a.severity] || b.totalHours - a.totalHours)
  return result
}

// ===== 维度 3：依赖交汇检测 =====

/**
 * 依赖交汇：is_shared=true 的前置任务有 2+ 个下游
 * benefitScore = 下游数 × 下游任务平均估时
 */
export function detectDependencyHubs(tasks: TaskForOverlap[], deps: DependencyForOverlap[]): DependencyHub[] {
  const sharedDeps = deps.filter(d => d.isShared)
  if (sharedDeps.length === 0) return []

  // taskId -> task
  const taskMap = new Map(tasks.map(t => [t.id, t]))

  // 按 prevTaskId 分组
  const byPrev = new Map<string, string[]>()
  for (const d of sharedDeps) {
    const arr = byPrev.get(d.prevTaskId) ?? []
    arr.push(d.nextTaskId)
    byPrev.set(d.prevTaskId, arr)
  }

  const result: DependencyHub[] = []
  for (const [hubId, downstreamIds] of byPrev) {
    const unique = [...new Set(downstreamIds)]
    if (unique.length < 2) continue

    const hubTask = taskMap.get(hubId)
    const downstreamTasks = unique
      .map(id => taskMap.get(id))
      .filter(Boolean)
      .map(t => ({ id: t!.id, title: t!.title }))

    const avgEstimated = downstreamTasks.length > 0
      ? unique.reduce((sum, id) => sum + (taskMap.get(id)?.estimatedHours ?? 0), 0) / unique.length
      : 0

    result.push({
      hubTaskId: hubId,
      hubTaskTitle: hubTask?.title ?? hubId,
      downstreamCount: unique.length,
      downstreamTasks,
      isOnCriticalPath: hubTask?.isOnCriticalPath ?? false,
      benefitScore: Math.round(unique.length * avgEstimated * 100) / 100,
    })
  }

  // 按 benefitScore 降序
  result.sort((a, b) => b.benefitScore - a.benefitScore || b.downstreamCount - a.downstreamCount)
  return result
}

// ===== 综合：总入口 =====

/**
 * 综合重叠检测结果
 */
export function detectOverlaps(
  projectId: string,
  tasks: TaskForOverlap[],
  deps: DependencyForOverlap[],
  options: { resourceThreshold?: number; dimensions?: ('time' | 'resource' | 'dependency')[] } = {},
): OverlapResult {
  const dims = options.dimensions ?? ['time', 'resource', 'dependency']
  const threshold = options.resourceThreshold ?? 8

  const time = dims.includes('time') ? detectTimeConflicts(tasks) : []
  const resource = dims.includes('resource') ? detectResourceConflicts(tasks, threshold) : []
  const dependency = dims.includes('dependency') ? detectDependencyHubs(tasks, deps) : []

  // 受影响任务数（去重）
  const affected = new Set<string>()
  for (const c of time) c.taskIds.forEach(id => affected.add(id))
  for (const c of resource) c.taskIds.forEach(id => affected.add(id))
  for (const h of dependency) {
    affected.add(h.hubTaskId)
    h.downstreamTasks.forEach(t => affected.add(t.id))
  }

  // 综合严重度
  const hasHigh =
    time.some(c => c.severity === 'high') ||
    resource.some(c => c.severity === 'high') ||
    dependency.some(h => h.benefitScore >= 40) // 依赖交汇"严重"=收益高（应该优先做）

  const mediumCount =
    time.filter(c => c.severity === 'medium').length +
    resource.filter(c => c.severity === 'medium').length +
    dependency.filter(h => h.benefitScore >= 20 && h.benefitScore < 40).length

  let severity: OverlapSeverity = 'low'
  if (hasHigh) severity = 'high'
  else if (mediumCount >= 2) severity = 'medium'

  return {
    projectId,
    generatedAt: new Date().toISOString(),
    summary: {
      timeConflicts: time.length,
      resourceConflicts: resource.length,
      dependencyHubs: dependency.length,
      totalAffectedTasks: affected.size,
      severity,
    },
    dimensions: { time, resource, dependency },
  }
}
