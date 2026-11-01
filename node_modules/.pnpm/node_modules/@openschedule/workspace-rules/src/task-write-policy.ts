/**
 * 工作台任务写入守卫（D-07 二期）：通用批量写（PUT /workspace/tasks）逐条目校验 before → after。
 * 目标是堵住「同租户成员经 API 直接写审批结果」的信任缺口，规则与前端现有流程对齐：
 *
 * 所有角色：
 *  - 条目键必须等于 data.id；审核留痕 auditLogs 只能由审核命令追加（批量写不得改动，新建必须为空）
 *  - createdBy 不可修改；执行记录 executionLogs / 评论 comments 只能追加，且新条目作者必须是本人
 *  - 处于待审（pending）的事项不能经批量写离开待审——通过/驳回/撤回一律走审核命令
 * 非管理（member / viewer 不会到这里，共享集合写权限已在上层拦截）：
 *  - 不能把审批状态写成 approved/rejected，不能把提报状态写成 approved
 *  - 普通任务/项目不能直接置为完成（须「提报完成」→ 审核），评审任务与个人计划除外
 *  - 承接人只能「领取」（空 → 本人）或「退回」（本人 → 空）；提交待审、评审任务、个人计划除外
 *  - 新建任务的创建人必须是本人（重复任务的后续实例沿用同组创建人除外）
 *  - 删除仅限本人的草稿 / 个人计划 / 尚在待审的新任务提报，其余须提交删除申请
 */
import type { AuthoredEntry, RuleActor, RuleTask } from './types';
import { stableEqual } from './util';

export interface TaskWriteContext {
  actor: RuleActor;
  /** 已存在的重复任务组：groupId → 该组创建人（用于放行重复任务后续实例的新建） */
  recurrenceGroupCreators?: ReadonlyMap<string, string>;
}

export const RESERVED_TASK_KEYS = new Set(['__order__']);

const SELF_COMPLETABLE_KINDS = new Set(['review', 'plan']);

/** 校验新建/覆盖一条任务；返回错误消息，null = 放行 */
export function checkTaskUpsert(key: string, before: RuleTask | null, after: unknown, ctx: TaskWriteContext): string | null {
  if (key === '__value__') return '工作台任务必须按条目存储（不允许整值写入）';
  if (RESERVED_TASK_KEYS.has(key)) return Array.isArray(after) && after.every((x) => typeof x === 'string') ? null : '顺序表格式非法';
  if (!after || typeof after !== 'object' || Array.isArray(after)) return '任务数据必须是对象';
  const next = after as RuleTask;
  if (next.id !== key) return '任务 id 与条目键不一致';

  const { actor } = ctx;
  const manager = actor.isManager;

  // —— 所有角色 ——
  if (before) {
    if (!stableEqual(next.auditLogs ?? [], before.auditLogs ?? [])) return '审核留痕只能由审核操作写入';
    if ((next.createdBy ?? null) !== (before.createdBy ?? null)) return '创建人不可修改';
  } else if ((next.auditLogs ?? []).length > 0) {
    return '新建任务不能携带审核留痕';
  }
  const logErr = checkAppendOnly(before?.executionLogs, next.executionLogs, actor.userId, '执行记录')
    ?? checkAppendOnly(before?.comments, next.comments, actor.userId, '评论');
  if (logErr) return logErr;
  if (before?.approvalStatus === 'pending' && next.approvalStatus !== 'pending') {
    return '待审事项须通过审核操作（通过/驳回/撤回）处理';
  }

  if (manager) return null;

  // —— 非管理 ——
  if (!before) {
    const group = next.recurrenceGroupId ? ctx.recurrenceGroupCreators?.get(next.recurrenceGroupId) : undefined;
    const isRecurrenceSibling = group !== undefined && group === next.createdBy;
    if (next.createdBy !== actor.userId && !isRecurrenceSibling) return '新建任务的创建人必须是本人';
    if (isRecurrenceSibling) return checkStatusAndApproval(null, next);
  }
  const err = checkStatusAndApproval(before, next);
  if (err) return err;

  const prevAssignee = before?.assigneeId ?? null;
  const nextAssignee = next.assigneeId ?? null;
  if (prevAssignee !== nextAssignee) {
    const exempt = next.approvalStatus === 'pending' || SELF_COMPLETABLE_KINDS.has(next.kind ?? 'task');
    const claim = prevAssignee === null && nextAssignee === actor.userId;
    const release = prevAssignee === actor.userId && nextAssignee === null;
    if (!exempt && !claim && !release) return '只能领取或退回自己的任务，指派他人须提交承接人审核';
  }
  return null;
}

/** 校验删除一条任务 */
export function checkTaskDelete(key: string, before: RuleTask | null, ctx: TaskWriteContext): string | null {
  if (key === '__value__' || RESERVED_TASK_KEYS.has(key) || !before) return null;
  if (before.approvalStatus === 'pending' && before.pendingDelete) return '删除申请审核中，请通过审核操作处理';
  if (ctx.actor.isManager) return null;
  const own = before.createdBy === ctx.actor.userId;
  const ownProposal = before.approvalStatus === 'pending' && before.approvalType === 'proposal';
  if (own && (before.isDraft || before.kind === 'plan' || ownProposal)) return null;
  return '删除须提交删除申请，由管理人员审核';
}

function checkStatusAndApproval(before: RuleTask | null, next: RuleTask): string | null {
  const nextApproval = next.approvalStatus ?? 'none';
  if ((nextApproval === 'approved' || nextApproval === 'rejected') && before?.approvalStatus !== nextApproval) {
    return '审核结果只能由管理人员通过审核操作产生';
  }
  if (next.proposalStatus === 'approved' && before?.proposalStatus !== 'approved') {
    return '提报只能由管理人员审核通过';
  }
  if (next.status === 'done' && before?.status !== 'done' && !SELF_COMPLETABLE_KINDS.has(next.kind ?? 'task')) {
    return '任务完成须提报完成并经管理人员审核';
  }
  return null;
}

function checkAppendOnly(
  prev: AuthoredEntry[] | undefined,
  next: AuthoredEntry[] | undefined,
  actorId: string,
  label: string,
): string | null {
  const a = prev ?? [];
  const b = next ?? [];
  if (b.length < a.length) return `${label}不能删除`;
  for (let i = 0; i < a.length; i += 1) {
    if (!stableEqual(a[i], b[i])) return `${label}不能修改`;
  }
  for (let i = a.length; i < b.length; i += 1) {
    if (!b[i] || b[i].authorId !== actorId) return `${label}的作者必须是本人`;
  }
  return null;
}
