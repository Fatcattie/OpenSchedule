/**
 * 工作台审核命令（D-07 二期）：通过 / 驳回 / 撤回 一个待审事项。
 * 合并原前端四处审核入口（审核中心 AuditPage、工作台审核收口、任务执行页审核区、评估页）的语义为单一实现，
 * 服务端（POST /workspace/tasks/:id/review）与 mock 演示模式共用，保证两边行为一致。
 *
 * 纯函数：输入当前任务集合（按顺序），输出要写入/删除的条目与可选的 SOP 沉淀文档；不做 IO。
 */
import type {
  AuditLogEntry,
  RuleActor,
  RuleTask,
  SopFlowLite,
  SopLibraryDocLite,
  SopNodeLite,
} from './types';
import { toIsoFromLocal } from './util';

export type ReviewAction = 'approve' | 'reject' | 'withdraw';
export type ReviewOpinion = 'agree' | 'reject' | 'rework' | 'other';

export interface ReviewCommand {
  taskId: string;
  action: ReviewAction;
  opinion: ReviewOpinion;
  reason?: string;
}

export interface ReviewEnv {
  actor: RuleActor;
  now: string;
  /** 生成新 id（项目任务、审核留痕、SOP 文档） */
  newId: (prefix: string) => string;
}

export interface ReviewResult {
  /** 需写入的任务（含修改与新建），键 = 任务 id */
  upserts: RuleTask[];
  /** 需删除的任务 id */
  deletes: string[];
  /** 新建任务插到列表最前（与前端「新任务在前」一致） */
  prepend: string[];
  /** 完成审核通过时沉淀的 SOP 文档（写入 sops 集合，同来源任务旧文档由调用方替换） */
  sopDoc: SopLibraryDocLite | null;
}

export class ReviewRuleError extends Error {
  constructor(
    readonly kind: 'not_found' | 'forbidden' | 'invalid_state' | 'invalid_input',
    message: string,
  ) {
    super(message);
    this.name = 'ReviewRuleError';
  }
}

export function applyTaskReview(tasks: readonly RuleTask[], cmd: ReviewCommand, env: ReviewEnv): ReviewResult {
  const task = tasks.find((t) => t.id === cmd.taskId);
  if (!task) throw new ReviewRuleError('not_found', '任务不存在或不可见');
  if (task.approvalStatus !== 'pending') throw new ReviewRuleError('invalid_state', '该任务当前没有待审事项');
  if (cmd.opinion === 'other' && !cmd.reason?.trim()) throw new ReviewRuleError('invalid_input', '选择「其他」意见时须填写原因');

  const { actor, now } = env;
  if (cmd.action === 'withdraw') {
    if (!actor.isManager && task.createdBy !== actor.userId) throw new ReviewRuleError('forbidden', '只有提报人或管理人员可以撤回');
  } else if (!actor.isManager) {
    throw new ReviewRuleError('forbidden', '只有管理人员可以审核');
  }

  const log: AuditLogEntry = {
    id: env.newId('audit'),
    taskId: task.id,
    action: cmd.action,
    opinion: cmd.opinion,
    reason: cmd.reason?.trim() ?? '',
    operatorId: actor.userId,
    operatorName: actor.displayName,
    createdAt: now,
  };
  const base: RuleTask = { ...task, auditLogs: [...(task.auditLogs ?? []), log], updatedAt: now };
  const result: ReviewResult = { upserts: [], deletes: [], prepend: [], sopDoc: null };

  if (cmd.action === 'approve') {
    // 删除申请通过：连同子孙一并移除，并从父级 SOP 顶层步骤中移除同名节点
    if (task.pendingDelete) {
      const removeIds = [task.id, ...findDescendantIds(tasks, task.id)];
      result.deletes = removeIds;
      const parent = task.parentId ? tasks.find((t) => t.id === task.parentId) : undefined;
      if (parent?.sop && !removeIds.includes(parent.id)) {
        const flow = removeTopLevelStep(parent.sop, task.title ?? '', now);
        if (flow) result.upserts.push({ ...parent, sop: flow, updatedAt: now });
      }
      return result;
    }
    switch (task.approvalType) {
      case 'completion': {
        if (task.needReview && task.reviewStatus !== 'passed') {
          throw new ReviewRuleError('invalid_state', '该任务需要评审，请等待评审完成后再审批');
        }
        base.status = 'done';
        base.completedAt = toIsoFromLocal(task.completion?.completedAt, now);
        result.sopDoc = archiveSopDoc(tasks, { ...base }, env);
        break;
      }
      case 'content':
        if (task.pendingContent) {
          base.title = task.pendingContent.title;
          base.description = task.pendingContent.description;
        }
        base.pendingContent = null;
        break;
      case 'reschedule':
        if (task.pendingContent) {
          base.startAt = task.pendingContent.startAt ?? task.startAt ?? null;
          base.endAt = task.pendingContent.endAt ?? task.endAt ?? null;
        }
        base.pendingContent = null;
        break;
      case 'assign':
        base.assigneeId = task.recommendedAssigneeId ?? task.assigneeId ?? null;
        base.recommendedAssigneeId = null;
        break;
      case 'proposal':
        base.proposalStatus = 'approved';
        base.status = task.assigneeId ? 'in_progress' : 'todo';
        // 团队协作项目提报通过：按 SOP 顶层步骤生成项目内任务
        if (task.kind === 'project' && task.sop) {
          const generated = buildProjectTasksFromSop(base, task.sop, env);
          result.upserts.push(...generated);
          result.prepend = generated.map((g) => g.id);
        }
        break;
      default:
        break;
    }
    base.approvalStatus = 'approved';
    base.approvalType = null;
  } else if (cmd.action === 'reject') {
    if (task.pendingDelete) {
      // 删除申请被驳回：恢复任务
      base.pendingDelete = false;
      base.approvalStatus = 'none';
      base.approvalType = null;
    } else {
      base.approvalStatus = 'rejected';
      clearPendingPayload(base, task, 'rejected');
    }
  } else {
    // 撤回：退回「待提报」，清理待审内容
    base.approvalStatus = 'none';
    base.approvalType = null;
    if (task.pendingDelete) base.pendingDelete = false;
    else clearPendingPayload(base, task, 'none');
    if (task.approvalType === 'completion') base.status = 'in_progress';
  }

  result.upserts.unshift(base);
  return result;
}

function clearPendingPayload(base: RuleTask, task: RuleTask, proposalOutcome: 'rejected' | 'none'): void {
  switch (task.approvalType) {
    case 'content':
    case 'reschedule':
      base.pendingContent = null;
      break;
    case 'completion':
      base.completion = null;
      break;
    case 'assign':
      base.recommendedAssigneeId = null;
      break;
    case 'proposal':
      base.proposalStatus = proposalOutcome;
      break;
    default:
      break;
  }
}

export function findDescendantIds(tasks: readonly RuleTask[], rootId: string): string[] {
  const out: string[] = [];
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const t of tasks) {
      if (t.parentId === id && !out.includes(t.id)) {
        out.push(t.id);
        queue.push(t.id);
      }
    }
  }
  return out;
}

function removeTopLevelStep(flow: SopFlowLite, title: string, now: string): SopFlowLite | null {
  const idx = flow.steps.findIndex((s) => s.title === title);
  if (idx < 0) return null;
  const steps = flow.steps.filter((_, i) => i !== idx);
  return { ...flow, steps, updatedAt: now };
}

function sopTitles(nodes: SopNodeLite[]): string[] {
  const out: string[] = [];
  const walk = (list: SopNodeLite[]) =>
    list.forEach((n) => {
      out.push(n.title);
      walk(n.children ?? []);
    });
  walk(nodes);
  return out;
}

/** 自身或最近祖先持有的 SOP（继承语义，与前端 effectiveSop 一致） */
function effectiveSop(tasks: readonly RuleTask[], task: RuleTask): SopFlowLite | null {
  let cursor: RuleTask | undefined = task;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    if (cursor.sop && cursor.sop.steps.length > 0) return cursor.sop;
    const parentId: string | null | undefined = cursor.parentId;
    cursor = parentId ? tasks.find((t) => t.id === parentId) : undefined;
  }
  return null;
}

/** 任务闭环沉淀 SOP（标题 + 流程图 + 完成总结）；无流程也无总结时不沉淀 */
export function archiveSopDoc(tasks: readonly RuleTask[], task: RuleTask, env: ReviewEnv): SopLibraryDocLite | null {
  const flow = effectiveSop(tasks, task);
  const summary = task.completion?.summary;
  if (!flow && !summary) return null;
  return {
    id: env.newId('sop'),
    title: `${task.title ?? ''} SOP`,
    sourceTask: task.title ?? '',
    sourceTaskId: task.id,
    steps: flow ? sopTitles(flow.steps) : summary ? [summary] : [],
    references: 0,
    summary,
    flow: flow ? (JSON.parse(JSON.stringify(flow.steps)) as SopNodeLite[]) : undefined,
    archivedAt: env.now,
  };
}

/** 按 SOP 顶层步骤生成项目内任务（与前端 buildProjectTasksFromSop 字段一致） */
export function buildProjectTasksFromSop(project: RuleTask, sop: SopFlowLite, env: ReviewEnv): RuleTask[] {
  const { now } = env;
  return sop.steps.map((step, i) => ({
    id: env.newId('task'),
    tenantId: project.tenantId,
    projectId: project.id,
    parentId: null,
    title: step.title,
    description: step.note || null,
    status: 'todo',
    priority: project.priority,
    assigneeId: null,
    dueAt: project.endAt ?? null,
    estimatedHours: 2,
    actualHours: null,
    completedAt: null,
    startedAt: null,
    createdBy: project.createdBy,
    tags: ['项目任务', ...(project.tags ?? []).filter((t) => t !== '团队协作项目' && t !== '团队协作')],
    sortOrder: i + 1,
    workflowColumnId: null,
    isAiGenerated: false,
    version: 1,
    createdAt: now,
    updatedAt: now,
    taskMode: 'team',
    kind: 'task',
    needReview: false,
    reviewStatus: 'none',
    proposalStatus: 'none',
    participants: [],
    reviewOfTaskId: null,
    startAt: project.startAt ?? null,
    endAt: project.endAt ?? null,
    importance: project.importance,
    urgencyDegree: project.urgencyDegree,
    urgency: project.urgency,
    sop: step.children.length > 0 ? { steps: step.children, source: 'inherited', updatedAt: now } : null,
    approvalStatus: 'none',
    approvalType: null,
    recommendedAssigneeId: null,
    pendingContent: null,
    executionLogs: [],
    comments: [],
    completion: null,
    auditLogs: [],
    dailyPlans: [],
    isDraft: false,
    pendingDelete: false,
    pendingSop: null,
  }));
}
