/**
 * resource-pool.dto.ts —— 资源池 DTO（输出用 interface）
 */

// ==================== 成员负载 ====================

export interface MemberProjectLoadDto {
  projectId: string
  projectName: string
  hours: number
  taskCount: number
  inProgressCount: number
}

export interface ResourceMemberDto {
  assigneeId: string
  name?: string
  projects: MemberProjectLoadDto[]
  totalHours: number
  capacityHours: number
  utilization: number
  loadLevel: 'idle' | 'normal' | 'heavy' | 'overload'
  inProgressCount: number
  todoCount: number
  dueSoonCount: number
  criticalTaskCount: number
}

// ==================== 资源冲突 ====================

export interface ResourceConflictDto {
  id: string
  type: 'cross_project_overload' | 'same_deadline_contention' | 'critical_shared_task'
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string
  assigneeId: string
  assigneeName?: string
  relatedProjectIds: string[]
  relatedTaskIds: string[]
  metric?: {
    name: string
    value: number
    threshold: number
    unit: string
  }
}

// ==================== 概览 ====================

export interface ResourcePoolOverviewDto {
  members: ResourceMemberDto[]
  totalCapacity: number
  totalAllocated: number
  utilization: number
  overloadCount: number
  idleCount: number
  topBottlenecks: string[]
  conflicts: ResourceConflictDto[]
}

// ==================== 再平衡 ====================

export interface RebalanceActionDto {
  id: string
  actionType: 'reassign' | 'split_work' | 'defer_low_priority' | 'hire_support'
  title: string
  rationale: string
  fromAssigneeId?: string
  toAssigneeId?: string
  relatedTaskIds: string[]
  estimatedHoursReduction?: number
  impact: string
}

export interface RebalanceSuggestionDto {
  actions: RebalanceActionDto[]
  overloadedMembers: number
  idleMembers: number
  utilizationBefore: number
  utilizationAfterEstimate: number
  summary: string
  generatedAt: string
  proposalId?: string
}

// ==================== 矩阵 ====================

export interface ResourceMatrixDto {
  projectIds: string[]
  projectNames: string[]
  assigneeIds: string[]
  assigneeNames: string[]
  matrix: number[][]  // 行=成员, 列=项目
}