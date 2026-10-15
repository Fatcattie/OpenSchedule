/**
 * 职责：协作任务统一搜索（第六批需求 1）
 *
 * - 数据源：useWorkspaceTasks 的 localStorage 任务（协作体系真实数据），同时覆盖
 *   任务（标题/描述/标签）、团队协作项目（kind='project'）、执行页评论。
 * - 角色区分：管理人员搜索全部；普通人员仅返回「自己涉及」的事项——
 *   承接 / 创建 / 参与人 / 评论过 / 评论 @到我 / 祖先链上任一任务由我承接或创建。
 * - 命中形状与 SearchHit 兼容（type/id/title/snippet/taskId/projectId/createdAt），
 *   供 AppLayout 顶栏即时下拉与 SearchPage 全局搜索页共用。
 */
import dayjs from 'dayjs'
import type { WorkspaceTask } from '@/types'

export interface WorkspaceSearchHit {
  type: 'task' | 'project' | 'comment'
  id: string
  title: string
  snippet: string
  projectId: string | null
  taskId: string | null
  createdAt: string
}

export interface SearchViewer {
  userId: string
  displayName: string
  isManager: boolean
}

/** 截取关键词上下文片段 */
function snippetAround(text: string, idx: number, len: number): string {
  const start = Math.max(0, idx - 16)
  const end = Math.min(text.length, idx + len + 24)
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
}

/** 判断用户是否「涉及」某任务：承接/创建/参与/评论过/@到我/祖先链相关 */
export function isTaskInvolved(task: WorkspaceTask, tasks: WorkspaceTask[], viewer: SearchViewer): boolean {
  const me = viewer.userId
  if (viewer.isManager) return true
  if (task.assigneeId === me || task.createdBy === me) return true
  if (task.participants?.includes(me)) return true
  // 我在该任务下评论过，或评论 @ 到我
  if (task.comments?.some((c) => c.authorId === me || c.content.includes(`@${viewer.displayName}`))) return true
  // 祖先链上任一任务由我承接/创建（父级承接人涉及其子任务）
  let cursor = task.parentId ? tasks.find((t) => t.id === task.parentId) : undefined
  const seen = new Set<string>()
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id)
    if (cursor.assigneeId === me || cursor.createdBy === me) return true
    cursor = cursor.parentId ? tasks.find((t) => t.id === cursor!.parentId) : undefined
  }
  return false
}

/** 统一搜索：keyword 模糊匹配任务标题/描述/标签、项目标题、评论内容 */
export function searchWorkspace(
  tasks: WorkspaceTask[],
  keyword: string,
  viewer: SearchViewer,
  type: 'all' | 'task' | 'project' | 'comment' = 'all',
  limit = 60,
): WorkspaceSearchHit[] {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return []
  const hits: WorkspaceSearchHit[] = []
  const push = (h: WorkspaceSearchHit) => {
    if (hits.length < limit) hits.push(h)
  }

  for (const t of tasks) {
    if (t.isDraft) continue
    const isProject = t.kind === 'project'
    if ((type === 'all' || type === 'project') && isProject) {
      const text = [t.title, t.description ?? ''].join(' ')
      const idx = text.toLowerCase().indexOf(kw)
      if (idx >= 0 && isTaskInvolved(t, tasks, viewer)) {
        push({ type: 'project', id: t.id, title: t.title, snippet: snippetAround(text, idx, kw.length), projectId: t.id, taskId: null, createdAt: t.createdAt })
      }
    }
    if ((type === 'all' || type === 'task') && !isProject && t.kind !== 'review') {
      const text = [t.title, t.description ?? '', (t.tags ?? []).join(' ')].join(' ')
      const idx = text.toLowerCase().indexOf(kw)
      if (idx >= 0 && isTaskInvolved(t, tasks, viewer)) {
        push({ type: 'task', id: t.id, title: t.title, snippet: snippetAround(text, idx, kw.length), projectId: t.projectId, taskId: t.id, createdAt: t.createdAt })
      }
    }
    if (type === 'all' || type === 'comment') {
      for (const c of t.comments ?? []) {
        const idx = c.content.toLowerCase().indexOf(kw)
        if (idx >= 0 && (viewer.isManager || c.authorId === viewer.userId || isTaskInvolved(t, tasks, viewer))) {
          push({ type: 'comment', id: `${t.id}-${c.id}`, title: t.title, snippet: `${c.authorName}：${snippetAround(c.content, idx, kw.length)}`, projectId: t.projectId, taskId: t.id, createdAt: c.createdAt ?? t.updatedAt })
        }
      }
    }
  }

  return hits.sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf())
}