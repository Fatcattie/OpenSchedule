/**
 * 职责：路由守卫 —— 未登录跳 /login；已登录但无用户信息时先拉 GET /auth/me 再渲染子路由
 *
 * M-5：access token 只存内存，刷新页面后为空 → 先经 restoreSession（HttpOnly refresh Cookie 换 access）恢复会话，
 * 恢复失败才跳登录页。
 */
import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { authApi } from '@/api/authApi'
import { restoreSession } from '@/api/client'
import type { MeResponse } from '@/types'
import LoadingView from '@/components/LoadingView'
import { useAuthStore } from '@/stores/authStore'

export default function RequireAuth() {
  const location = useLocation()
  const accessToken = useAuthStore((s) => s.accessToken)
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const clear = useAuthStore((s) => s.clear)
  const [loadingMe, setLoadingMe] = useState(false)
  /** 无 access token 时的会话恢复状态：pending=恢复中，failed=无有效 refresh Cookie */
  const [restore, setRestore] = useState<'idle' | 'pending' | 'failed'>('idle')

  useEffect(() => {
    if (accessToken || restore !== 'idle') return
    setRestore('pending')
    restoreSession()
      .then((ok) => setRestore(ok ? 'idle' : 'failed'))
      .catch(() => setRestore('failed'))
  }, [accessToken, restore])

  // 有 token 但用户信息丢失 → 经 /auth/me 恢复；失败（token 失效且 refresh 失败）清空凭证
  useEffect(() => {
    if (accessToken && !user && !loadingMe) {
      setLoadingMe(true)
      authApi
        .fetchMe()
        .then((me: MeResponse) => setUser({ ...me.user, roles: me.roles }))
        .catch(() => clear())
        .finally(() => setLoadingMe(false))
    }
  }, [accessToken, user, loadingMe, setUser, clear])

  if (!accessToken) {
    if (restore === 'failed') return <Navigate to="/login" replace state={{ from: location.pathname }} />
    return <LoadingView height="60vh" tip="正在恢复登录状态…" />
  }
  if (!user) return <LoadingView height="60vh" tip="正在恢复登录状态…" />
  return <Outlet />
}
