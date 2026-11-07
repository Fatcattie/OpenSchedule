/**
 * 职责：认证状态 store（Zustand）—— access token（仅内存）+ 当前用户
 *
 * 安全问题 M-5：真实模式下 token 不落 localStorage——
 * - access token 只存内存（页面刷新即丢，由 restoreSession 用 refresh Cookie 换回）
 * - refresh token 由服务端写入 HttpOnly + SameSite=Strict Cookie（X-Auth-Transport: cookie），前端脚本永远读不到
 * mock 模式（VITE_USE_MOCK=true，仅本地开发）的假 token 无安全价值，仍持久化到 localStorage，便于刷新页面后保持登录。
 */
import { create } from 'zustand'
import { TOKEN_STORAGE_KEYS, USE_MOCK } from '@/api/config'
import type { User } from '@/types'

interface AuthState {
  accessToken: string | null
  user: User | null
  isAuthenticated: boolean
  /** 登录/刷新成功后写入 access token（真实模式只存内存） */
  setAccessToken: (accessToken: string) => void
  setUser: (user: User) => void
  /** 登出/刷新失败：清空凭证 */
  clear: () => void
}

function readMockToken(): string | null {
  if (!USE_MOCK) return null
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEYS.access)
  } catch {
    return null
  }
}

function removeStoredTokens(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEYS.access)
    localStorage.removeItem(TOKEN_STORAGE_KEYS.refresh)
  } catch {
    // 隐私模式等场景 localStorage 不可用，忽略
  }
}

// 迁移：清掉旧版本落在 localStorage 的真实 token（M-5 之前的版本会写入）
if (!USE_MOCK) removeStoredTokens()

const initialToken = readMockToken()

export const useAuthStore = create<AuthState>()((set) => ({
  accessToken: initialToken,
  user: null, // 刷新页面后由 RequireAuth 经 restoreSession + GET /auth/me 恢复
  isAuthenticated: !!initialToken,
  setAccessToken: (accessToken) => {
    if (USE_MOCK) {
      try {
        localStorage.setItem(TOKEN_STORAGE_KEYS.access, accessToken)
      } catch {
        // 忽略写入失败
      }
    }
    set({ accessToken, isAuthenticated: true })
  },
  setUser: (user) => set({ user }),
  clear: () => {
    removeStoredTokens()
    set({ accessToken: null, user: null, isAuthenticated: false })
  },
}))
