/**
 * 职责：认证状态 store（Zustand）—— access/refresh token（localStorage 持久化）+ 当前用户
 */
import { create } from 'zustand'
import { TOKEN_STORAGE_KEYS } from '@/api/config'
import type { User } from '@/types'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: User | null
  isAuthenticated: boolean
  /** 登录/刷新成功后写入 token（同时持久化） */
  setTokens: (accessToken: string, refreshToken: string) => void
  setUser: (user: User) => void
  /** 登出/刷新失败：清空凭证并跳登录页 */
  clear: () => void
}

function readToken(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    // 隐私模式等场景 localStorage 不可用，降级为内存态
    return null
  }
}

function writeToken(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 忽略写入失败
  }
}

export const useAuthStore = create<AuthState>()((set) => ({
  accessToken: readToken(TOKEN_STORAGE_KEYS.access),
  refreshToken: readToken(TOKEN_STORAGE_KEYS.refresh),
  user: null, // TODO: 刷新页面后由 RequireAuth 经 GET /auth/me 恢复
  isAuthenticated: !!readToken(TOKEN_STORAGE_KEYS.access),
  setTokens: (accessToken, refreshToken) => {
    writeToken(TOKEN_STORAGE_KEYS.access, accessToken)
    writeToken(TOKEN_STORAGE_KEYS.refresh, refreshToken)
    set({ accessToken, refreshToken, isAuthenticated: true })
  },
  setUser: (user) => set({ user }),
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEYS.access)
      localStorage.removeItem(TOKEN_STORAGE_KEYS.refresh)
    } catch {
      // 忽略
    }
    set({ accessToken: null, refreshToken: null, user: null, isAuthenticated: false })
  },
}))
