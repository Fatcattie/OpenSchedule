/**
 * 职责：用户/认证 DTO —— users 表字段（snake_case）→ camelCase 对齐；/auth 系列端点
 */
export type UserStatus = 'active' | 'disabled'

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
  createdAt: string // timestamptz → ISO8601 UTC
  updatedAt: string
}

/** 登录返回（规格 3.5.1：POST /auth/login 返回 access + refresh） */
export interface AuthTokens {
  accessToken: string // JWT，TTL 15m（规格 3.7 JWT_ACCESS_TTL）
  refreshToken: string // TTL 7d
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
  roles: string[]
}
