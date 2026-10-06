/**
 * 职责：审核中心服务层（增量 7，ARCH §5.2）—— 相关任务口径 + 审核动作编排。
 *
 * 分层：
 * - `listAuditTasks`：按「相关任务口径」取任务集合（管理=全部；成员=本人承接或创建），供四栏筛选；
 * - `submitAudit`：把审核中心抽屉的「动作 / 意见 / 原因」编排到既有服务入口 ——
 *   approve/reject → `reviewSubmission`（写 `AuditLog` + `pushAudit` + 通知）；
 *   withdraw       → `withdrawCompletionAndNotify`（提报人本人撤回 + 通知）。
 *
 * 说明：后端无 approve/reject 端点（N6），落库仍走 mock（`USE_MOCK`），保留 `TODO(real-api)`。
 */
import { db, isManagerUser } from '@/data'
import type { AuditOpinion, Task } from '@/types'
import { isTaskRelated } from '@/utils/audit'
import { httpClient, simulateLatency } from './client'
import { USE_MOCK } from './config'
import { reviewSubmission, withdrawCompletionAndNotify } from './task.service'

/** 审核动作（与 `AuditAction` 同集） */
export type SubmitAuditAction = 'approve' | 'reject' | 'withdraw'

/** 提交审核入参（审核中心抽屉 → 服务层） */
export interface SubmitAuditInput {
  taskId: string
  action: SubmitAuditAction
  /** 审核意见（仅留痕） */
  opinion: AuditOpinion
  /** 原因 / 备注（reject 必填 ≥4 字；other 建议必填） */
  reason?: string
  version: number
  /** 真实操作人 */
  actorId: string
}

/**
 * 取「相关任务」集合（对齐 `AuditPage.tsx:65-70`）：
 * - 管理角色 ⇒ 全部任务；
 * - 成员 ⇒ `assigneeId === me || createdBy === me`（移动端无 participants 字段，省略该分支）。
 */
export async function listAuditTasks(actorId: string, isManager: boolean): Promise<Task[]> {
  if (USE_MOCK) {
    await simulateLatency()
    return db.tasks
      .filter((task) => isTaskRelated(task, actorId, isManager))
      .map((task) => ({ ...task }))
  }
  // TODO(real-api): GET /tasks/audit?actorId=:actorId&isManager=:isManager
  return httpClient.get<Task[]>('/tasks/audit', { query: { actorId, isManager } })
}

/** 判断某用户是否为管理角色（审核中心入参推导用） */
export function resolveIsManager(actorId: string): boolean {
  return isManagerUser(actorId)
}

/**
 * 编排一次审核动作（ARCH §5.2）。
 * 通过 / 驳回 → `reviewSubmission`；撤回 → `withdrawCompletionAndNotify`（提报人本人）。
 */
export async function submitAudit(input: SubmitAuditInput): Promise<Task> {
  if (USE_MOCK) {
    await simulateLatency()
    if (input.action === 'withdraw') {
      return withdrawCompletionAndNotify(
        input.taskId,
        { version: input.version, actorId: input.actorId, reason: input.reason },
        input.opinion,
      )
    }
    return reviewSubmission(
      input.taskId,
      input.action,
      input.version,
      input.reason,
      input.actorId,
      input.opinion,
    )
  }
  // TODO(real-api): POST /tasks/:taskId/review  body: { action, opinion, reason, version }
  return httpClient.post<Task>(`/tasks/${input.taskId}/review`, input)
}
