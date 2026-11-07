/**
 * 职责：axios 实例与拦截器 —— Bearer token 注入、401 自动 refresh 重试（并发去重）、错误信封归一化
 */
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { API_BASE, AUTH_TRANSPORT_HEADERS, USE_MOCK } from './config'
import { normalizeError } from './errors'
import { useAuthStore } from '@/stores/authStore'
import type { ApiErrorEnvelope, ApiResponse } from '@/types'

/** 原始实例：不走拦截器，仅用于 /auth/refresh，避免刷新失败再触发 401 死循环 */
const rawClient = axios.create({ baseURL: API_BASE, timeout: 15_000 })

/** 主实例：所有业务请求统一走这里 */
export const client = axios.create({ baseURL: API_BASE, timeout: 15_000 })

// ── 请求拦截：注入 access token（规格 3.5：Authorization: Bearer <jwt>） ──
client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.set('Authorization', `Bearer ${token}`)
  return config
})

/** 认证端点不参与 401 自动刷新（登录/注册/刷新本身失败直接抛错） */
const AUTH_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/refresh']

let refreshPromise: Promise<string | null> | null = null

/**
 * 用 refresh Cookie 换新 access token（规格 3.1：40101=access 过期，客户端用 refresh 换新）。
 * M-5：refresh token 在 HttpOnly Cookie 里（Path=/api/v1/auth），浏览器自动携带，前端脚本不接触。
 * 并发多个 401 时只发起一次刷新请求，其余请求共享同一 Promise。
 */
async function exchangeRefreshCookie(): Promise<string | null> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    if (USE_MOCK) return useAuthStore.getState().accessToken
    try {
      const resp = await rawClient.post<ApiResponse<{ accessToken: string }>>('/auth/refresh', {}, { headers: AUTH_TRANSPORT_HEADERS })
      const accessToken = resp.data?.data?.accessToken
      if (!accessToken) return null
      useAuthStore.getState().setAccessToken(accessToken)
      return accessToken
    } catch {
      return null
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

/** 页面加载时恢复会话（RequireAuth 调用）：成功返回 true；失败不跳转，由守卫重定向登录页 */
export async function restoreSession(): Promise<boolean> {
  return (await exchangeRefreshCookie()) !== null
}

/** 业务请求 401 时刷新；失败则清空凭证并跳回登录页（full reload 让内存态全部复位） */
async function refreshAccessToken(): Promise<string | null> {
  const token = await exchangeRefreshCookie()
  if (!token) {
    useAuthStore.getState().clear()
    if (window.location.pathname !== '/login') window.location.assign('/login')
  }
  return token
}

// ── 响应拦截：错误信封归一化 + 401 自动刷新重试（最多重试 1 次） ──
client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined
    const status = error.response?.status
    const envelope = error.response?.data as ApiErrorEnvelope | undefined
    const url = original?.url ?? ''

    const isAuthFailure = status === 401 || envelope?.code === 40101
    const canRefresh = !AUTH_ENDPOINTS.some((endpoint) => url.includes(endpoint))

    if (isAuthFailure && canRefresh && original && !original._retry) {
      original._retry = true
      const newToken = await refreshAccessToken()
      if (newToken) {
        original.headers.set('Authorization', `Bearer ${newToken}`)
        return client(original)
      }
    }
    return Promise.reject(normalizeError(error))
  },
)

// ────────────────────────────────────────────────────────────
// 人员管理真实 API（R7-6 双鉴权收敛：人员域统一走 Bearer client，
// 历史 sessionClient / X-CSRF-Token / openschedule_session 已删除）。
// 数据与权限全部来自服务端（services/api/src/openapi/{auth,users,roles}.yaml 契约）：
// - 列表 / 创建 / 编辑 / 状态 / 删除走 Bearer client（统一 axios 拦截器注入 Bearer + 401 自动 refresh）
// - 菜单与操作按钮按 /me/capabilities 能力矩阵显隐（FR-007）；越权请求仍由服务端矩阵拒绝（FR-008）
// - 边界规则：admin 仅管理 member；super_admin 管理 admin 与 member；最后一名活跃 super_admin 受 409 保护（FR-002）
// ────────────────────────────────────────────────────────────

/** 固定三角色（FR-001 封闭枚举；契约/数据库/前后端共用同一标识，未知角色服务端拒绝） */
export type PersonnelRole = 'super_admin' | 'admin' | 'member'
/** 用户状态（users.yaml UserStatus） */
export type PersonnelUserStatus = 'active' | 'disabled'

/** 契约 User：持久化投影，永不含密码/凭证摘要（FR-003） */
export interface PersonnelUser {
  id: string
  email: string
  displayName: string
  role: PersonnelRole
  status: PersonnelUserStatus
  createdAt: string
  updatedAt: string
}

/** 契约 PersonnelCapability（roles.yaml）：服务端派生的当前能力，UI 唯一授权来源 */
export interface PersonnelCapability {
  list: boolean
  create: boolean
  update: boolean
  setStatus: boolean
  delete: boolean
  assignRole: boolean
  /** 可管理的目标角色：admin=[member]，super_admin=[admin,member]，member=[]（FR-002 边界） */
  manageableRoles: PersonnelRole[]
}

export interface MyPersonnelCapabilities {
  userId: string
  role: PersonnelRole
  personnel: PersonnelCapability
}

export interface PersonnelListParams {
  role?: PersonnelRole
  status?: PersonnelUserStatus
  search?: string
  limit?: number
  cursor?: string
}

/** 契约 UserListResponse：服务端筛选 + 游标分页 */
export interface PersonnelListResult {
  items: PersonnelUser[]
  nextCursor: string | null
}

export interface CreatePersonnelInput {
  email: string
  displayName: string
  role: PersonnelRole
  /** 契约 writeOnly：只进不出，任何响应都不含密码 */
  password: string
}

export interface UpdatePersonnelInput {
  email?: string
  displayName?: string
  /** 角色指派：仅 super_admin；服务端按目标当前快照复核（防请求体提权，FR-008） */
  role?: PersonnelRole
}

export interface SetPersonnelStatusInput {
  status: PersonnelUserStatus
}

/** 列表：服务端筛选 + 游标分页（FR-005 真实 API，无 mock 回退、无本地兜底数据） */
export async function listPersonnel(params: PersonnelListParams = {}): Promise<PersonnelListResult> {
  const resp = await client.get<ApiResponse<{ items: PersonnelUser[]; nextCursor: string | null }>>('/users', { params })
  return resp.data.data
}

/** 创建：admin 只能建 member，super_admin 可选 admin/member（服务端强制，FR-002） */
export async function createPersonnel(input: CreatePersonnelInput): Promise<PersonnelUser> {
  const resp = await client.post<ApiResponse<{ user: PersonnelUser }>>('/users', input)
  return resp.data.data.user
}

export async function getPersonnel(id: string): Promise<PersonnelUser> {
  const resp = await client.get<ApiResponse<{ user: PersonnelUser }>>(`/users/${encodeURIComponent(id)}`)
  return resp.data.data.user
}

export async function updatePersonnel(id: string, input: UpdatePersonnelInput): Promise<PersonnelUser> {
  const resp = await client.patch<ApiResponse<{ user: PersonnelUser }>>(`/users/${encodeURIComponent(id)}`, input)
  return resp.data.data.user
}

export async function setPersonnelStatus(id: string, input: SetPersonnelStatusInput): Promise<PersonnelUser> {
  const resp = await client.post<ApiResponse<{ user: PersonnelUser }>>(`/users/${encodeURIComponent(id)}/status`, input)
  return resp.data.data.user
}

/** 删除：204 无响应体；服务端 409 保护最后一名活跃超级管理员（FR-003 不变量） */
export async function deletePersonnel(id: string): Promise<void> {
  await client.delete(`/users/${encodeURIComponent(id)}`)
}

/** 能力自省（FR-007）：菜单/按钮按此显隐；越权请求仍会被服务端矩阵拒绝（FR-008） */
export async function getMyPersonnelCapabilities(): Promise<MyPersonnelCapabilities> {
  const resp = await client.get<ApiResponse<MyPersonnelCapabilities>>('/me/capabilities')
  return resp.data.data
}
