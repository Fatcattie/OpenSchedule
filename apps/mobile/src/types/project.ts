/**
 * 职责：项目 DTO（projects 表字段 camelCase 对齐，ARCH §4）。
 */

export type ProjectStatus = 'active' | 'archived' | 'completed'

export interface Project {
  id: string
  /** projects.tenant_id（租户铁律） */
  tenantId: string
  name: string
  description: string | null
  /** 项目负责人（由 owner_id 派生） */
  ownerId: string | null
  status: ProjectStatus
  /** 大计划截止（ISO8601 UTC） */
  deadline: string | null
  /** 自定义状态流配置引用（Phase 2） */
  workflowId: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

/** 项目状态中文文案 */
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: '进行中',
  archived: '已归档',
  completed: '已完成',
}
