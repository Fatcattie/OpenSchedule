/**
 * useCurrentRole —— 当前工作台角色（R7：服务端角色唯一来源）。
 * 不再读取/写入 localStorage 的 workspace_role；角色由 /auth/me 的 Bearer 会话实时声明推导。
 * tenant.owner/admin 或带全量权限的角色映射为 manager，其余映射为 member；无角色时 fail-closed 为 member。
 */
import { useAuthStore } from '@/stores/authStore'
import type { AuthRoleValue } from '@/types'

export type WorkspaceRole = 'manager' | 'member'

function roleKey(role: AuthRoleValue): string {
  return typeof role === 'string' ? role : role.key
}

export function isManagerRole(roles: AuthRoleValue[] | undefined): boolean {
  return (roles ?? []).some((role) => {
    const key = roleKey(role)
    return key === 'tenant.owner' || key === 'tenant.admin' ||
      (typeof role !== 'string' && role.permissions?.includes('*') === true)
  })
}

export function useCurrentRole(): WorkspaceRole {
  const roles = useAuthStore((state) => state.user?.roles)
  return isManagerRole(roles) ? 'manager' : 'member'
}
