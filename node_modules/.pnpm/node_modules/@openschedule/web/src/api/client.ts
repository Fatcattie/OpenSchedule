/**
 * 职责：axios 实例与拦截器 —— Bearer token 注入、401 自动 refresh 重试（并发去重）、错误信封归一化
 */
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { API_BASE } from './config'
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
 * 用 refresh token 换新 access token（规格 3.1：40101=access 过期，客户端用 refresh 换新）
 * 并发多个 401 时只发起一次刷新请求，其余请求共享同一 Promise
 */
async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    const refreshToken = useAuthStore.getState().refreshToken
    if (!refreshToken) return null
    try {
      const resp = await rawClient.post<ApiResponse<{ accessToken: string; refreshToken?: string }>>('/auth/refresh', {
        refreshToken,
      })
      const tokens = resp.data?.data
      if (!tokens?.accessToken) return null
      useAuthStore.getState().setTokens(tokens.accessToken, tokens.refreshToken ?? refreshToken)
      return tokens.accessToken
    } catch {
      // 刷新失败：清空本地凭证并跳回登录页（full reload 让内存态全部复位）
      useAuthStore.getState().clear()
      if (window.location.pathname !== '/login') window.location.assign('/login')
      return null
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
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
