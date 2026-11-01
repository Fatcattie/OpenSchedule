/**
 * 职责：路由守卫 —— 未登录跳 /login；已登录但无用户信息时先拉 GET /auth/me 再渲染子路由
 */
import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { authApi } from '@/api/authApi'
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

  // 刷新页面后 token 还在但用户信息丢失 → 经 /auth/me 恢复；失败（token 失效且 refresh 失败）清空凭证
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

  if (!accessToken) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!user) return <LoadingView height="60vh" tip="正在恢复登录状态…" />
  return <Outlet />
}
