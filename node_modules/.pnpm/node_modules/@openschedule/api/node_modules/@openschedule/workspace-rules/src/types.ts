/**
 * 工作台任务的规则视图（与 apps/web WorkspaceTask 同形的宽松子集）。
 * 规则只读写这里列出的字段，其余字段原样透传（索引签名承载）。
 */

export type ApprovalStatus = 'none' | 'pending' | 'approved' | 'rejected';
export type ApprovalType = 'proposal' | 'assign' | 'content' | 'completion' | 'reschedule' | null;
export type TaskKind = 'task' | 'review' | 'plan' | 'project';

export interface AuditLogEntry {
  id: string;
  taskId: string;
  action: 'approve' | 'reject' | 'withdraw';
  opinion: 'agree' | 'reject' | 'rework' | 'other';
  reason: string;
  operatorId: string;
  operatorName: string;
  createdAt: string;
}

export interface AuthoredEntry {
  id: string;
  authorId: string;
  [key: string]: unknown;
}

export interface SopNodeLite {
  id: string;
  title: string;
  note?: string;
  children: SopNodeLite[];
}

export interface SopFlowLite {
  steps: SopNodeLite[];
  source: 'manual' | 'ai' | 'inherited';
  updatedAt: string;
}

export interface RuleTask {
  id: string;
  kind?: TaskKind;
  status?: string;
  title?: string;
  description?: string | null;
  createdBy?: string;
  assigneeId?: string | null;
  parentId?: string | null;
  projectId?: string | null;
  tenantId?: string;
  priority?: string;
  tags?: string[];
  approvalStatus?: ApprovalStatus;
  approvalType?: ApprovalType;
  proposalStatus?: 'none' | 'pending' | 'approved' | 'rejected';
  reviewStatus?: 'none' | 'pending' | 'passed';
  needReview?: boolean;
  recommendedAssigneeId?: string | null;
  pendingContent?: { title: string; description: string; startAt?: string | null; endAt?: string | null } | null;
  completion?: { completedAt: string; summary?: string } | null;
  completedAt?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  isDraft?: boolean;
  pendingDelete?: boolean;
  sop?: SopFlowLite | null;
  auditLogs?: AuditLogEntry[];
  executionLogs?: AuthoredEntry[];
  comments?: AuthoredEntry[];
  recurrenceGroupId?: string | null;
  updatedAt?: string;
  [key: string]: unknown;
}

/** 「SOP 与经验」沉淀文档（与 apps/web SopLibraryDoc 同形） */
export interface SopLibraryDocLite {
  id: string;
  title: string;
  sourceTask: string;
  sourceTaskId?: string;
  steps: string[];
  references: number;
  summary?: string;
  flow?: SopNodeLite[];
  archivedAt?: string;
}

export interface RuleActor {
  userId: string;
  displayName: string;
  /** 租户 owner/admin（前端 useCurrentRole 的 manager） */
  isManager: boolean;
}
