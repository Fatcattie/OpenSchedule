/**
 * useUsers.ts —— 人员管理共享数据源（R7 TanStack Query 全量迁移）
 *
 * - 真实模式：以 R7-6 人员域统一 Bearer 客户端的 `listPersonnel / createPersonnel /
 *   updatePersonnel / deletePersonnel / setPersonnelStatus` 为单一数据源。
 * - Mock 模式：回退到 mockUsers（与旧 localStorage 行为同构，离线开发不破坏演示路径）。
 * - 当前登录用户（authStore.user）与本地存储的 `me` 视图保持双向同步。
 * - 公共 API 向后兼容：旧调用方（`useUsers().{users, me, updateMe, createUser, updateUser,
 *   deleteUser, setUserStatus}`）零改动。
 */
import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { USE_MOCK } from '@/api/config'
import {
  createPersonnel,
  deletePersonnel,
  listPersonnel,
  setPersonnelStatus,
  updatePersonnel,
  type PersonnelRole,
  type PersonnelUser,
} from '@/api/client'
import { mockMe, mockUsers } from '@/__fixtures__/mock/data'
import type { User, UserStatus } from '@/types'

// ─────────────────────────── 视图映射 ───────────────────────────

const PERSONNEL_ROLE_TO_TENANT_KEY: Record<PersonnelRole, string> = {
  super_admin: 'tenant.owner',
  admin: 'tenant.admin',
  member: 'tenant.member',
}

/** 前端契约 User（来自 R4 人员域 /users 最小投影）→ 内部视图 User
 * （保留 avatarUrl/locale/timezone/status/createdAt/updatedAt/roles 形状不变，
 * 下游 `stats/StatsPanel`、`intelligent/PromptLibrary`、`PersonalProfilePage` 等 6 处消费
 * 不需要感知数据源切换）。
 */
function toLegacyUserView(p: PersonnelUser): User {
  const roleKey = PERSONNEL_ROLE_TO_TENANT_KEY[p.role] ?? 'tenant.member'
  return {
    id: p.id,
    email: p.email,
    displayName: p.displayName,
    avatarUrl: null,
    role: roleKey,
    locale: 'zh-CN',
    timezone: 'Asia/Shanghai',
    status: p.status as UserStatus,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    roles: [{ key: roleKey, scope: 'tenant', scopeResourceId: null }],
  } as unknown as User
}

/** 本地种子（mock 模式下回退到 mockUsers） */
function seedUsers(): User[] {
  return mockUsers as unknown as User[]
}

/** 当前登录用户（authStore 优先）；缺省回退 mockMe（mock 模式） */
function legacyMe(): User {
  return (mockMe as unknown) as User
}

/** 旧调用方 `createUser` 入参 → 人员域创建入参
 * （`role`/`password` 为旧契约字段，现行调用方多不传；password 缺省用满足
 *  /users 创建契约 ≥12 位（personnel.dto.ts @MinLength(12)）的默认值） */
function legacyCreateToPersonnel(input: Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { status?: UserStatus; role?: string; password?: string }) {
  const role: PersonnelRole =
    input.role === 'tenant.owner' ? 'super_admin' : input.role === 'tenant.admin' ? 'admin' : 'member'
  return {
    email: input.email,
    displayName: input.displayName,
    role,
    password: input.password ?? 'demo-password-123456',
  }
}

export function useUsers() {
  const authUser = useAuthStore((s) => s.user)
  const setAuthUser = useAuthStore((s) => s.setUser)
  const queryClient = useQueryClient()

  /** 真实模式：从 /users 列表读数据（按服务端筛选 + 游标分页） */
  const usersQuery = useQuery({
    queryKey: ['users'],
    enabled: USE_MOCK ? false : true,
    queryFn: async (): Promise<{ items: User[]; nextCursor: string | null }> => {
      const page = await listPersonnel({ limit: 100, cursor: undefined })
      return { items: page.items.map(toLegacyUserView), nextCursor: page.nextCursor }
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: !USE_MOCK,
  })

  /** Mock 模式：用本地种子代替，避免无网络场景崩溃 */
  const mockUsersView = useMemo<User[]>(() => seedUsers(), [])
  const users: User[] = USE_MOCK ? mockUsersView : (usersQuery.data?.items ?? [])

  /** 当前用户（me）：真实模式从 users 列表取，否则回退 authStore.user，否则回退 legacyMe */
  const me = useMemo<User>(() => {
    if (authUser) return authUser as unknown as User
    const found = users.find((u) => u.id === legacyMe().id)
    return found ?? (authUser as unknown as User) ?? (legacyMe() as User)
  }, [users, authUser])

  /** 更新当前登录用户资料（真实模式：调 updatePersonnel + 同步 authStore） */
  const updateMe = useCallback(
    async (patch: Partial<User>) => {
      const id = me?.id
      if (!id) return me
      const nextMe: User = {
        ...(me ?? ({} as User)),
        ...patch,
        updatedAt: new Date().toISOString(),
      }
      if (!USE_MOCK) {
        // 契约只允许改 email / displayName；其它字段忽略（前端保留）
        const input = {
          email: patch.email,
          displayName: patch.displayName,
        }
        const updated = await updatePersonnel(id, input)
        const view = toLegacyUserView(updated)
        const merged = { ...nextMe, ...view }
        setAuthUser(merged)
        return merged
      }
      setAuthUser(nextMe)
      return nextMe
    },
    [me, setAuthUser],
  )

  /** 创建新员工（真实模式：走 /users 创建，触发 invalidate） */
  const createUser = useCallback(
    async (input: Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { status?: UserStatus }) => {
      if (USE_MOCK) {
        const now = new Date().toISOString()
        const newUser: User = {
          ...input,
          id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          status: input.status ?? 'active',
          createdAt: now,
          updatedAt: now,
        } as User
        return newUser
      }
      const resp = await createPersonnel(legacyCreateToPersonnel(input))
      const view = toLegacyUserView(resp)
      queryClient.invalidateQueries({ queryKey: ['users'] })
      return view
    },
    [queryClient],
  )

  /** 更新员工（真实模式：走 /users/:id PATCH） */
  const updateUser = useCallback(
    async (id: string, patch: Partial<User>) => {
      if (USE_MOCK) return
      const input = {
        email: patch.email,
        displayName: patch.displayName,
      }
      await updatePersonnel(id, input)
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    [queryClient],
  )

  /** 删除员工（真实模式：走 /users/:id DELETE） */
  const deleteUser = useCallback(
    async (id: string) => {
      if (USE_MOCK) return
      await deletePersonnel(id)
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    [queryClient],
  )

  /** 启用 / 禁用（真实模式：走 /users/:id/status） */
  const setUserStatus = useCallback(
    async (id: string, status: UserStatus) => {
      if (USE_MOCK) return
      await setPersonnelStatus(id, { status: status as 'active' | 'disabled' })
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    [queryClient],
  )

  return {
    users,
    me,
    updateMe,
    createUser,
    updateUser,
    deleteUser,
    setUserStatus,
  }
}
