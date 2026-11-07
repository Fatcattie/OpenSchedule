/**
 * 职责：用户/认证 DTO —— users 表字段（snake_case）→ camelCase 对齐；/auth 系列端点
 */
export type UserStatus = 'active' | 'disabled'

/** 后端实时展开的租户/项目角色（/auth/me.roles）；mock 兼容字符串角色 key */
export interface AuthRole {
  key: string
  scope?: string
  scopeResourceId?: string | null
  permissions?: string[]
}

export type AuthRoleValue = AuthRole | string

export interface User {
  id: string // users.id
  email: string // users.email（登录名）
  displayName: string // users.display_name
  avatarUrl: string | null // users.avatar_url
  locale: string // users.locale（中/英双语预留）
  timezone: string // users.timezone（提醒时区）
  status: UserStatus
  /** 个人资料扩展字段 */
  phone?: string
  address?: string
  bio?: string // 个人简介
  motto?: string
  /** 当前用户服务端角色声明；不持久化为 UI 可编辑状态 */
  roles?: AuthRoleValue[]
  createdAt: string // timestamptz → ISO8601 UTC
  updatedAt: string
}

/** 登录返回（规格 3.5.1：POST /auth/login 返回 access + refresh；R6-1 新增 mustChangePassword 强制改密标志） */
export interface AuthTokens {
  accessToken: string // JWT，TTL 15m（规格 3.7 JWT_ACCESS_TTL）
  /** TTL 7d；Web（Cookie 模式）下服务端不在响应体返回，改由 HttpOnly Cookie 承载（M-5） */
  refreshToken?: string
  /** R6-1（D-05 B）：管理员代建账号首次登录为 true，客户端据此走强制改密流程（POST /auth/change-password） */
  mustChangePassword?: boolean
}

export interface LoginInput {
  email: string
  password: string
}

export interface RegisterInput {
  email: string
  password: string
  displayName?: string
}

export interface TenantSummary {
  id: string
  name: string
  plan: 'free' | 'pro' | 'enterprise'
  status: 'active' | 'suspended'
}

/** GET /auth/me 响应：当前用户 + 所属租户/角色（字段形态以后端实现为准，TODO 对齐） */
export interface MeResponse {
  user: User
  tenant: TenantSummary | null
  roles: AuthRoleValue[]
}
