/**
 * 职责：项目 DTO —— projects 表字段（snake_case）→ camelCase 对齐；/projects 系列端点
 */
export type ProjectStatus = 'active' | 'archived' | 'completed'

export interface Project {
  id: string
  tenantId: string // projects.tenant_id（租户铁律，后端强制注入）
  name: string // ≤200
  description: string | null
  ownerId: string | null // projects.owner_id（项目负责人，派生项目级角色，非独立实体）
  status: ProjectStatus
  deadline: string | null // timestamptz → ISO8601 UTC（大计划截止）
  workflowId: string | null // 自定义状态流配置引用（Phase 2）
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface CreateProjectInput {
  name: string
  description?: string
  deadline?: string | null // ISO8601
}

export interface UpdateProjectInput {
  name?: string
  description?: string | null
  deadline?: string | null
}
