/**
 * useCurrentRole —— 当前工作台角色
 *
 * 当前实现：从 localStorage 的 workspace_role 读取（兼容现有演示切换）。
 * 未来接入真实登录态时，改为从 auth context / 租户成员角色推导，调用处无需改动。
 */
import { useLocalStorageState } from './useLocalStorageState'

export type WorkspaceRole = 'manager' | 'member'

export function useCurrentRole(): WorkspaceRole {
  const [role] = useLocalStorageState<WorkspaceRole>('workspace_role', 'manager')
  return role
}
