/**
 * 职责：工作台身份与通讯录（D-07 二期）—— 取代散落各页的 mockMe / mockUsers 假身份
 *
 * - useMe：当前登录用户（authStore）；mock 演示模式回退 mockMe
 * - useDirectory：团队通讯录（GET /workspace/directory，全员可读：id/显示名/头像/角色），
 *   用于显示名解析、承接人下拉、默认评审承接人（第一位管理）；mock 模式回退 mockUsers
 * - getCurrentUser：非组件代码的同步读取
 */
import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { USE_MOCK } from '@/api/config'
import { getWorkspaceDirectory, type DirectoryMember } from '@/api/workspaceApi'
import { queryClient as sharedQueryClient } from '@/lib/queryClient'
import { useAuthStore } from '@/stores/authStore'
import { mockMe, mockUsers } from '@/__fixtures__/mock/data'

export interface CurrentUser {
  id: string
  displayName: string
}

export type TeamMember = DirectoryMember

export const DIRECTORY_QUERY_KEY = ['workspace', 'directory'] as const

const MOCK_ME: CurrentUser = { id: mockMe.id, displayName: mockMe.displayName }
const MOCK_DIRECTORY: TeamMember[] = mockUsers.map((u) => ({
  id: u.id,
  displayName: u.displayName,
  avatarUrl: u.avatarUrl ?? null,
  role: u.id === mockMe.id ? 'manager' : 'member',
}))
const ANONYMOUS: CurrentUser = { id: '', displayName: '' }

/** 非组件代码读取当前用户 */
export function getCurrentUser(): CurrentUser {
  if (USE_MOCK) return MOCK_ME
  const u = useAuthStore.getState().user
  return u ? { id: u.id, displayName: u.displayName } : ANONYMOUS
}

/**
 * 非组件代码（模块级渲染辅助函数）按 id 取显示名：读通讯录缓存，未加载时返回 undefined。
 * 通讯录由 AppLayout 的 useDirectory 常驻拉取；组件内优先用 useDirectory().nameOf 以便加载后自动重渲染。
 */
export function lookupMemberName(id: string | null | undefined): string | undefined {
  if (!id) return undefined
  const list = USE_MOCK ? MOCK_DIRECTORY : sharedQueryClient.getQueryData<TeamMember[]>(DIRECTORY_QUERY_KEY)
  return list?.find((m) => m.id === id)?.displayName
}

export function useMe(): CurrentUser {
  const user = useAuthStore((s) => s.user)
  return useMemo(() => {
    if (USE_MOCK) return MOCK_ME
    return user ? { id: user.id, displayName: user.displayName } : ANONYMOUS
  }, [user])
}

export function useDirectory() {
  const query = useQuery({
    queryKey: DIRECTORY_QUERY_KEY,
    queryFn: getWorkspaceDirectory,
    enabled: !USE_MOCK,
    staleTime: 5 * 60_000,
  })
  const teamMembers = useMemo<TeamMember[]>(() => (USE_MOCK ? MOCK_DIRECTORY : (query.data ?? [])), [query.data])
  const byId = useMemo(() => new Map(teamMembers.map((m) => [m.id, m])), [teamMembers])
  const nameOf = useCallback((id: string | null | undefined) => (id ? byId.get(id)?.displayName : undefined), [byId])
  /** 默认评审承接人：通讯录中的第一位管理（无则 null，评审任务进入待承接池） */
  const defaultManagerId = useMemo(() => teamMembers.find((m) => m.role === 'manager')?.id ?? null, [teamMembers])
  return { teamMembers, nameOf, defaultManagerId }
}
