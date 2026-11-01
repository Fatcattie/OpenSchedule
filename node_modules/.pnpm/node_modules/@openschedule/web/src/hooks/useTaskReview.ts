/**
 * 职责：工作台任务审核（D-07 二期）—— 审核中心 / 工作台审核收口 / 任务执行页审核区的统一入口
 *
 * - 真实模式：POST /workspace/tasks/:id/review，规则与副作用（完成闭环、内容/时间/承接人生效、删除级联、
 *   项目按 SOP 生成任务、SOP 沉淀、审核留痕）全部在服务端执行；完成后重新拉取 tasks / sops
 * - mock 演示模式：在本地执行同一份 @openschedule/workspace-rules 规则，写回 localStorage
 * 失败时弹出原因并返回 null（调用方据此不关闭弹窗）。
 */
import { useCallback } from 'react'
import { message } from 'antd'
import { applyTaskReview, type ReviewResult, type RuleTask, type SopLibraryDocLite } from '@openschedule/workspace-rules'
import { USE_MOCK } from '@/api/config'
import { reviewWorkspaceTask, type ReviewTaskInput, type ReviewTaskResult } from '@/api/workspaceApi'
import { readWorkspaceValueLocal, runWorkspaceCommand, updateWorkspaceValue } from './useWorkspaceState'
import { useCurrentRole } from './useCurrentRole'
import { useMe } from './useWorkspaceIdentity'

/** 把审核结果并入任务列表：替换修改项、移除删除项、新建项置顶 */
export function mergeReviewResult<T extends { id: string }>(list: T[], result: ReviewResult): T[] {
  const updated = new Map(result.upserts.map((t) => [t.id, t as unknown as T]))
  const removed = new Set(result.deletes)
  const created = result.prepend.map((id) => updated.get(id)).filter((t): t is T => Boolean(t))
  const rest = list.filter((t) => !removed.has(t.id)).map((t) => updated.get(t.id) ?? t)
  return [...created, ...rest]
}

export function useTaskReview() {
  const me = useMe()
  const isManager = useCurrentRole() === 'manager'

  return useCallback(
    async (taskId: string, input: ReviewTaskInput): Promise<ReviewTaskResult | null> => {
      try {
        if (!USE_MOCK) {
          return await runWorkspaceCommand(['tasks', 'sops'], () => reviewWorkspaceTask(taskId, input))
        }
        const tasks = readWorkspaceValueLocal<RuleTask[]>('tasks', [])
        let seq = 0
        const result = applyTaskReview(tasks, { taskId, ...input }, {
          actor: { userId: me.id, displayName: me.displayName, isManager },
          now: new Date().toISOString(),
          newId: (prefix) => `${prefix}-${Date.now().toString(36)}-${(seq += 1)}`,
        })
        updateWorkspaceValue<RuleTask[]>('tasks', (cur) => mergeReviewResult(cur, result), [])
        const doc = result.sopDoc
        if (doc) {
          updateWorkspaceValue<SopLibraryDocLite[]>('sops', (cur) => [doc, ...cur.filter((d) => d.sourceTaskId !== doc.sourceTaskId)], [])
        }
        const reviewed = result.upserts.find((t) => t.id === taskId)
        return {
          taskId,
          action: input.action,
          approvalStatus: reviewed?.approvalStatus ?? null,
          generated: result.prepend.length,
          sopArchived: Boolean(doc),
        }
      } catch (err) {
        message.error(err instanceof Error && err.message ? err.message : '审核失败，请稍后重试')
        return null
      }
    },
    [me.id, me.displayName, isManager],
  )
}
