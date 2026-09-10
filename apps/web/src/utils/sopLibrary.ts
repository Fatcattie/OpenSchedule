/**
 * 职责：SOP 沉淀库读写
 *
 * 覆盖需求 6：任务闭环后（完成并审核通过），SOP 流程以任务标题、总结字段和流程图
 * 的形式总结到「SOP 与经验」看板，供后续任务参考和选择应用。
 *
 * 「SOP 与经验」看板的数据存在 localStorage `os_ws_v1_sops`（与 useLocalStorageState 对齐），
 * 本工具直接读写同一份存储，供执行页审核通过、工作台审核中心等多处调用。
 */
import type { SopFlow, SopNode, TaskCompletion, WorkspaceTask } from '@/types'
import { sopFlowTitles } from '@/types'

/** 与 CollaborationWorkspacePage.SopDocument 对齐（后三个字段为沉淀增强字段，旧数据可缺省） */
export interface SopLibraryDoc {
  id: string
  title: string
  sourceTask: string
  steps: string[]
  references: number
  /** 完成总结（任务闭环时写入） */
  summary?: string
  /** 流程图（树形结构，任务闭环时写入） */
  flow?: SopNode[]
  /** 沉淀时间 */
  archivedAt?: string
  /** 来源任务 id（便于跳转） */
  sourceTaskId?: string
}

/** 与协作工作台「SOP 与经验」看板共用同一份 localStorage（键名 `sops`），保证任务闭环沉淀后即时出现在看板 */
const SOP_KEY = 'sops'

export function readSopLibrary(): SopLibraryDoc[] {
  try {
    const raw = localStorage.getItem(SOP_KEY)
    if (raw != null) return JSON.parse(raw) as SopLibraryDoc[]
  } catch {
    // 解析失败按空库处理
  }
  return []
}

export function writeSopLibrary(docs: SopLibraryDoc[]): void {
  try {
    localStorage.setItem(SOP_KEY, JSON.stringify(docs))
  } catch {
    // 忽略写入异常
  }
}

/** 查找任务自身或最近祖先持有的 SOP（继承语义），返回 [流程, 来源任务] */
export function effectiveSop(
  tasks: WorkspaceTask[],
  task: WorkspaceTask,
): { flow: SopFlow; owner: WorkspaceTask } | null {
  let cursor: WorkspaceTask | undefined = task
  while (cursor) {
    if (cursor.sop && cursor.sop.steps.length > 0) return { flow: cursor.sop, owner: cursor }
    cursor = tasks.find((t) => t.id === cursor!.parentId)
  }
  return null
}

/**
 * 任务闭环（完成并审核通过）时沉淀 SOP：
 * 标题 = 任务标题 + " SOP"；流程图 = 生效 SOP（自身或继承自父级）；总结 = 完成提报的 summary。
 * 同一任务重复闭环时覆盖旧记录。
 */
export function archiveSopFromTask(tasks: WorkspaceTask[], task: WorkspaceTask): SopLibraryDoc | null {
  const hit = effectiveSop(tasks, task)
  const completion: TaskCompletion | null = task.completion ?? null
  const flow = hit?.flow ?? null
  // 既没有 SOP 流程也没有总结时不沉淀，避免空卡
  if (!flow && !completion?.summary) return null
  const doc: SopLibraryDoc = {
    id: `sop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: `${task.title} SOP`,
    sourceTask: task.title,
    sourceTaskId: task.id,
    steps: flow ? sopFlowTitles(flow) : (completion?.summary ? [completion.summary] : []),
    references: 0,
    summary: completion?.summary,
    flow: flow ? JSON.parse(JSON.stringify(flow.steps)) as SopNode[] : undefined,
    archivedAt: new Date().toISOString(),
  }
  const list = readSopLibrary().filter((d) => d.sourceTaskId !== task.id)
  writeSopLibrary([doc, ...list])
  return doc
}

/**
 * 在父级任务/项目的 SOP 顶层步骤中同步节点（需求 9：子任务=流程节点，增删改变动流程）。
 * - mode='remove'：按标题移除顶层节点；返回移除后的 SOP（无匹配则返回原 SOP 拷贝）。
 * - mode='append'：若顶层不存在同名节点则追加到末尾（需求 4：任务新增 → 流程末尾新增节点）。
 * 父级无 SOP 时返回 null。
 */
export function syncSopStep(
  tasks: WorkspaceTask[],
  parentId: string,
  title: string,
  mode: 'remove' | 'append',
): SopFlow | null {
  const parent = tasks.find((t) => t.id === parentId && !!t.sop)
  if (!parent?.sop) return null
  const flow: SopFlow = JSON.parse(JSON.stringify(parent.sop)) as SopFlow
  if (mode === 'remove') {
    const idx = flow.steps.findIndex((s) => s.title === title)
    if (idx >= 0) flow.steps.splice(idx, 1)
    flow.updatedAt = new Date().toISOString()
    return flow
  }
  if (flow.steps.some((s) => s.title === title)) return flow
  flow.steps.push({ id: `sopn-${Date.now().toString(36)}-${flow.steps.length + 1}`, title, children: [] })
  flow.updatedAt = new Date().toISOString()
  return flow
}
