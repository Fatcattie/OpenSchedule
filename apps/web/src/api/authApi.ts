/**
 * 职责：认证 API 封装 —— POST /auth/{login,register,refresh,logout}、GET /auth/me（规格 3.5.1 认证与团队）
 */
import { client } from './client'
import { mockOr } from './mock/dispatch'
import { useAuthStore } from '@/stores/authStore'
import type { ApiResponse } from '@/types'
import type { AuthTokens, LoginInput, MeResponse, RegisterInput } from '@/types'

/** 登录：POST /auth/login → access + refresh */
export async function login(input: LoginInput): Promise<AuthTokens> {
  return mockOr('mockLogin', async () => {
    const resp = await client.post<ApiResponse<AuthTokens>>('/auth/login', input)
    return resp.data.data
  }, input)
}

/** 注册：POST /auth/register（创建账号 + 可选创建租户） */
export async function register(input: RegisterInput): Promise<AuthTokens> {
  return mockOr('mockRegister', async () => {
    const resp = await client.post<ApiResponse<AuthTokens>>('/auth/register', input)
    return resp.data.data
  }, input)
}

/** 注销：POST /auth/logout（吊销 refresh；失败时前端本地清理兜底） */
export async function logout(): Promise<void> {
  return mockOr('mockLogout', async () => {
    const refreshToken = useAuthStore.getState().refreshToken
    await client.post<ApiResponse<null>>('/auth/logout', { refreshToken })
  })
}

/** 当前用户：GET /auth/me（用户 + 所属租户/角色） */
export async function fetchMe(): Promise<MeResponse> {
  return mockOr('mockFetchMe', async () => {
    const resp = await client.get<ApiResponse<MeResponse>>('/auth/me')
    return resp.data.data
  })
}

/** 改密（R6-1 / R7）：POST /auth/change-password（校验当前密码 → 写新密 → 清除强制改密标记；首次登录强制改密亦走此端点） */
export async function changePassword(currentPassword: string, newPassword: string): Promise<{ ok: true }> {
  const resp = await client.post<ApiResponse<{ ok: true }>>('/auth/change-password', { currentPassword, newPassword })
  return resp.data.data
}

// 命名空间导出，兼容 import { authApi } from '@/api/authApi'
export const authApi = { login, register, logout, fetchMe, changePassword }