/**
 * 职责：用户 / 认证 DTO（users 表字段 camelCase 对齐，ARCH §4）。
 */

export type UserStatus = 'active' | 'disabled'

export interface User {
  id: string
  /** 登录名 */
  email: string
  displayName: string
  avatarUrl: string | null
  /** 中 / 英双语预留 */
  locale: string
  /** 提醒时区（默认 Asia/Shanghai） */
  timezone: string
  status: UserStatus
  /** 个人资料扩展字段 */
  phone?: string
  address?: string
  bio?: string
  motto?: string
  /** ISO8601 UTC */
  createdAt: string
  updatedAt: string
}

/** 登录返回：access + refresh */
export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface LoginInput {
  email: string
  password: string
}

export interface TenantSummary {
  id: string
  name: string
  plan: 'free' | 'pro' | 'enterprise'
  status: 'active' | 'suspended'
}

/** GET /auth/me 响应 */
export interface MeResponse {
  user: User
  tenant: TenantSummary | null
  roles: string[]
}

/** 移动端演示角色（Q2 默认纯前端切换） */
export type AppRole = 'manager' | 'member'

/** 角色中文文案 */
export const ROLE_LABEL: Record<AppRole, string> = {
  manager: '管理人员',
  member: '普通人员',
}
