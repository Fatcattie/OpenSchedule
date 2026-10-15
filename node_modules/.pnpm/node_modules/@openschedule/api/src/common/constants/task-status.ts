/**
 * 任务状态机规格代码化（规格来源：chapter_03.md §3.3 迁移表 T1-T13、§3.1 错误码、§3.5.5 校验规则）。
 * 本文件是 common 层唯一由"业务模块员"创建的文件；其余 common 文件（PrismaService/AuditService/异常过滤器等）由基建员提供，不得在此重复定义。
 */
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

/** 任务基础五态 + PendingReview 扩展态（Phase 2 启用，status varchar(20) 自然扩展，不新增表结构） */
export enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  BLOCKED = 'blocked',
  DONE = 'done',
  CANCELLED = 'cancelled',
  /** Phase 2 扩展态：待验收（审批流/AI 执行结果确认用） */
  PENDING_REVIEW = 'pending_review',
}

/** 优先级枚举（§3.5.5：默认 medium） */
export enum TaskPriority {
  URGENT = 'urgent',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

/** 任务相关错误码（§3.1 分段码表 409x 段；其余模块错误码用字面量 + 注释） */
export const TASK_ERROR_CODES = {
  /** 乐观锁冲突：version 不匹配，前端据此刷新重试 */
  OPTIMISTIC_LOCK: 40901,
  /** 状态迁移非法：响应体 details 必带 allowed_transitions 枚举 */
  ILLEGAL_TRANSITION: 40902,
} as const;

/** 阻塞/取消/重开原因最小长度（§3.5.5：必填 ≥4 字符，兼作 AI 检测语料） */
export const REASON_MIN_LENGTH = 4;

/** 迁移表"允许执行者"角色（§3.3 列） */
export type TaskActorRole =
  | 'assignee' // assignee 本人
  | 'project_owner' // 项目负责人（含租户 Admin 代开/代操作）
  | 'tenant_admin' // 租户 Admin
  | 'creator' // 创建者（仅 T8 限定场景）
  | 'reviewer' // 验收人/审批链审批人（Phase 2，T4/T11/T12）
  | 'system'; // 系统自动触发（Phase 2，T10）

/** 迁移表行（from→to→{允许执行者, 前置条件, 副作用}） */
export interface TaskTransition {
  /** 规格迁移编号（T1-T13；同编号多行=一源多目标，如 T8/T9） */
  id: string;
  from: TaskStatus | '*';
  to: TaskStatus;
  /** 触发动作名（对应端点语义：claim/block/cancel/complete/reopen/...） */
  action: string;
  /** 允许执行者（"项目负责人、租户 Admin"合并为 project_owner 语义：见 actorMatches） */
  allowedActors: TaskActorRole[];
  /** 前置条件（§3.5.5 校验规则） */
  preconditions?: {
    /** assignee 非空（T1：为空则先领取，A5 默认先到先得） */
    assigneeRequired?: boolean;
    /** 原因必填 ≥4 字符（T2/T8/T9） */
    reasonRequired?: boolean;
    /** actual_hours 必填（T4/T7，★D3 采集点） */
    actualHoursRequired?: boolean;
    /** T8 创建者取消仅限"Todo 且未分配" */
    creatorOnlyIfTodoUnassigned?: boolean;
  };
  /** 副作用（必做清单；审计在事务内落实，通知/事件在事务提交后由调用方发布） */
  sideEffects: string[];
  /** 1=Phase 1 启用；2=PendingReview 扩展态（Phase 2 启用，T10/T11/T12） */
  phase: 1 | 2;
}

/** 迁移校验上下文（由 service 从请求与资源构造；assigneeId 取迁移生效后的值，claim 场景=领取人） */
export interface TransitionContext {
  /** 当前操作者 */
  userId: string;
  /** 迁移生效后的 assignee */
  assigneeId: string | null;
  /** 项目负责人（projects.owner_id 派生，非独立角色实体） */
  projectOwnerId: string | null;
  /** 任务创建者 */
  createdBy: string | null;
  /** 租户 Admin/Owner */
  isTenantAdmin: boolean;
}

/** 角色匹配：allowedActors 列 → 实际权限判定（§3.3"允许执行者"列 + §3.4 权限矩阵） */
export function actorMatches(
  role: TaskActorRole,
  ctx: TransitionContext,
  task: { assigneeId: string | null; createdBy: string | null },
): boolean {
  switch (role) {
    case 'assignee':
      return ctx.userId === ctx.assigneeId;
    case 'project_owner':
      return ctx.isTenantAdmin || (ctx.projectOwnerId !== null && ctx.userId === ctx.projectOwnerId);
    case 'tenant_admin':
      return ctx.isTenantAdmin;
    case 'creator':
      return ctx.userId === task.createdBy;
    case 'reviewer':
      // Phase4：评审/审批人 = 项目负责人或租户 Admin（评审任务完成后由其审批主任务）
      return ctx.isTenantAdmin || (ctx.projectOwnerId !== null && ctx.userId === ctx.projectOwnerId);
    case 'system':
      return false; // Phase 2：系统自动触发 TODO（AI 执行经审批门后触发）
  }
}

/** 迁移表（§3.3 T1-T13 的代码化；T13=任意态→归档走软删流程，非状态迁移，见 TasksService.softDelete） */
export const TASK_TRANSITIONS: TaskTransition[] = [
  // T1 领取/开始执行（assignee 非空；为空则先领取，A5 默认先到先得）
  {
    id: 'T1', from: TaskStatus.TODO, to: TaskStatus.IN_PROGRESS, action: 'claim',
    allowedActors: ['assignee', 'project_owner', 'tenant_admin'],
    preconditions: { assigneeRequired: true },
    sideEffects: ['审计', '通知项目负责人'],
    phase: 1,
  },
  // T2 标记阻塞
  {
    id: 'T2', from: TaskStatus.TODO, to: TaskStatus.BLOCKED, action: 'block',
    allowedActors: ['assignee', 'project_owner', 'tenant_admin'],
    preconditions: { reasonRequired: true },
    sideEffects: ['审计', '通知负责人'],
    phase: 1,
  },
  // T3 退回待办
  {
    id: 'T3', from: TaskStatus.IN_PROGRESS, to: TaskStatus.TODO, action: 'back_to_todo',
    allowedActors: ['assignee'],
    sideEffects: ['审计'],
    phase: 1,
  },
  // T4 标记完成（★D3：落 actual_hours + completed_at）
  {
    id: 'T4', from: TaskStatus.IN_PROGRESS, to: TaskStatus.DONE, action: 'complete',
    allowedActors: ['assignee', 'reviewer'],
    preconditions: { actualHoursRequired: true },
    sideEffects: ['审计', '写 completed_at=now', '通知关注人/验收人', 'Phase 2 起触发自动化规则'],
    phase: 1,
  },
  // T5 标记阻塞
  {
    id: 'T5', from: TaskStatus.IN_PROGRESS, to: TaskStatus.BLOCKED, action: 'block',
    allowedActors: ['assignee', 'project_owner', 'tenant_admin'],
    preconditions: { reasonRequired: true },
    sideEffects: ['审计', '通知负责人'],
    phase: 1,
  },
  // T6 解除阻塞/再激活
  {
    id: 'T6', from: TaskStatus.BLOCKED, to: TaskStatus.IN_PROGRESS, action: 'unblock',
    allowedActors: ['assignee', 'project_owner', 'tenant_admin'],
    sideEffects: ['审计', '通知负责人', '阻塞>3 天自动升级通知（Phase 3 偏差检测）'],
    phase: 1,
  },
  // T7 标记完成（阻塞态直接完成）
  {
    id: 'T7', from: TaskStatus.BLOCKED, to: TaskStatus.DONE, action: 'complete',
    allowedActors: ['assignee', 'reviewer'],
    preconditions: { actualHoursRequired: true },
    sideEffects: ['审计', '写 completed_at=now', '通知关注人/验收人'],
    phase: 1,
  },
  // T8 取消（创建者仅限 Todo 且未分配）
  {
    id: 'T8', from: TaskStatus.TODO, to: TaskStatus.CANCELLED, action: 'cancel',
    allowedActors: ['project_owner', 'tenant_admin', 'creator'],
    preconditions: { reasonRequired: true, creatorOnlyIfTodoUnassigned: true },
    sideEffects: ['审计', '通知 assignee'],
    phase: 1,
  },
  {
    id: 'T8', from: TaskStatus.IN_PROGRESS, to: TaskStatus.CANCELLED, action: 'cancel',
    allowedActors: ['project_owner', 'tenant_admin'],
    preconditions: { reasonRequired: true },
    sideEffects: ['审计', '通知 assignee'],
    phase: 1,
  },
  {
    id: 'T8', from: TaskStatus.BLOCKED, to: TaskStatus.CANCELLED, action: 'cancel',
    allowedActors: ['project_owner', 'tenant_admin'],
    preconditions: { reasonRequired: true },
    sideEffects: ['审计', '通知 assignee'],
    phase: 1,
  },
  // T9 重开（completed_at 置空、actual_hours 保留）
  {
    id: 'T9', from: TaskStatus.DONE, to: TaskStatus.TODO, action: 'reopen',
    allowedActors: ['project_owner', 'tenant_admin'],
    preconditions: { reasonRequired: true },
    sideEffects: ['审计', 'completed_at 置空、actual_hours 保留'],
    phase: 1,
  },
  {
    id: 'T9', from: TaskStatus.DONE, to: TaskStatus.IN_PROGRESS, action: 'reopen',
    allowedActors: ['project_owner', 'tenant_admin'],
    preconditions: { reasonRequired: true },
    sideEffects: ['审计', 'completed_at 置空、actual_hours 保留'],
    phase: 1,
  },
  // T10 提交验收（Phase4 启用：需要评审的任务，assignee 提报完成 → pending_review + 自动生成评审子任务）
  {
    id: 'T10', from: TaskStatus.IN_PROGRESS, to: TaskStatus.PENDING_REVIEW, action: 'submit_review',
    allowedActors: ['assignee', 'project_owner', 'tenant_admin'],
    preconditions: { actualHoursRequired: true },
    sideEffects: ['审计', '自动创建项目评审子任务并分配项目负责人', '通知项目负责人'],
    phase: 2,
  },
  {
    id: 'T10', from: TaskStatus.BLOCKED, to: TaskStatus.PENDING_REVIEW, action: 'submit_review',
    allowedActors: ['assignee', 'project_owner', 'tenant_admin'],
    preconditions: { actualHoursRequired: true },
    sideEffects: ['审计', '自动创建项目评审子任务并分配项目负责人', '通知项目负责人'],
    phase: 2,
  },
  // T11 审批通过（Phase4 启用：评审子任务完成后，项目负责人/租户 Admin 才能通过；实际工时已在 T10 采集）
  {
    id: 'T11', from: TaskStatus.PENDING_REVIEW, to: TaskStatus.DONE, action: 'approve',
    allowedActors: ['reviewer', 'project_owner', 'tenant_admin'],
    sideEffects: ['审计', '写 completed_at=now', '通知 assignee'],
    phase: 2,
  },
  // T12 审批驳回（Phase4 启用：驳回原因必填，任务退回进行中）
  {
    id: 'T12', from: TaskStatus.PENDING_REVIEW, to: TaskStatus.IN_PROGRESS, action: 'reject',
    allowedActors: ['reviewer', 'project_owner', 'tenant_admin'],
    preconditions: { reasonRequired: true },
    sideEffects: ['审计', '通知 assignee', '驳回原因回流'],
    phase: 2,
  },
];

/** 查迁移表（默认仅 Phase 1 行；includePhase2 供 Phase 2 扩展） */
export function findTransition(from: TaskStatus, to: TaskStatus, opts: { includePhase2?: boolean } = {}): TaskTransition | undefined {
  return TASK_TRANSITIONS.find(t => t.from === from && t.to === to && (opts.includePhase2 || t.phase === 1));
}

/** 当前状态可用迁移枚举（不带执行者过滤；40902 details.allowed_transitions 的兜底） */
export function getAllowedTransitions(from: TaskStatus, opts: { includePhase2?: boolean } = {}): { to: TaskStatus; action: string }[] {
  return TASK_TRANSITIONS.filter(t => t.from === from && (opts.includePhase2 || t.phase === 1)).map(t => ({ to: t.to, action: t.action }));
}

/** 按操作者过滤可执行迁移（前端据此渲染可用按钮；T8 创建者场景按任务实际 assignee 判断） */
export function getAllowedTransitionsForActor(
  from: TaskStatus,
  ctx: TransitionContext,
  task: { assigneeId: string | null; createdBy: string | null },
  opts: { includePhase2?: boolean } = {},
): { to: TaskStatus; action: string }[] {
  return TASK_TRANSITIONS.filter(t => {
    if (t.from !== from) return false;
    if (t.phase !== 1 && !opts.includePhase2) return false;
    // 创建者取消：仅限 Todo 且未分配（§3.3 T8）
    if (t.preconditions?.creatorOnlyIfTodoUnassigned && task.assigneeId !== null) return false;
    return t.allowedActors.some(role => actorMatches(role, ctx, task));
  }).map(t => ({ to: t.to, action: t.action }));
}

/** 前置条件校验（§3.5.5；失败抛 40001 业务校验错误） */
export function checkTransitionPreconditions(
  t: TaskTransition,
  opts: { reason?: string; actualHours?: number | null; ctx: TransitionContext },
): void {
  if (t.preconditions?.assigneeRequired && !opts.ctx.assigneeId) {
    throw new BadRequestException({ code: 40001, message: 'T1 前置条件：assignee 非空（为空则先领取，A5 先到先得）' });
  }
  if (t.preconditions?.reasonRequired && (opts.reason == null || opts.reason.trim().length < REASON_MIN_LENGTH)) {
    throw new BadRequestException({ code: 40001, message: `原因必填且不少于 ${REASON_MIN_LENGTH} 个字符（兼作 AI 语料）` });
  }
  if (t.preconditions?.actualHoursRequired && opts.actualHours == null) {
    throw new BadRequestException({ code: 40001, message: 'actual_hours 必填（T4/T7，★D3 采集点；未计时则需在请求体提供）' });
  }
}

/**
 * 迁移表查表校验（§3.3 补充规则）：
 * - 非法迁移一律 40902，details 带 allowed_transitions（按当前操作者过滤）
 * - 执行者不匹配抛 40301（§3.4 权限矩阵）
 */
export function assertTransitionLegal(
  from: TaskStatus,
  to: TaskStatus,
  ctx: TransitionContext,
  task: { assigneeId: string | null; createdBy: string | null },
  opts: { includePhase2?: boolean } = {},
): TaskTransition {
  const t = findTransition(from, to, opts);
  if (!t) {
    throw new ConflictException({
      code: TASK_ERROR_CODES.ILLEGAL_TRANSITION,
      message: `非法状态迁移: ${from} → ${to}`,
      details: { allowed_transitions: getAllowedTransitionsForActor(from, ctx, task) },
    });
  }
  if (!t.allowedActors.some(role => actorMatches(role, ctx, task))) {
    throw new ForbiddenException({
      code: 40301,
      message: `当前用户无权执行迁移 ${from} → ${to}（允许执行者：${t.allowedActors.join('/')}）`,
    });
  }
  return t;
}

/** 列表查询允许的排序字段白名单（§3.1：sort 参数走白名单） */
export const TASK_SORT_WHITELIST = ['createdAt', 'updatedAt', 'dueAt', 'priority', 'sortOrder'] as const;
