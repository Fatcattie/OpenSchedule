/**
 * useUsers.ts —— 本地用户/人员管理共享存储
 *
 * - 与 mockUsers 保持同构（User 类型）。
 * - 首次使用以 mockUsers 作为种子。
 * - 当前登录用户通过 authStore 同步；修改当前用户资料时同步更新 authStore。
 */
import { useCallback, useMemo } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useLocalStorageState } from './useLocalStorageState'
import { mockMe, mockUsers } from '@/api/mock/data'
import type { User, UserStatus } from '@/types'

const STORAGE_KEY = 'users'

function seedUsers(): User[] {
  return [...mockUsers]
}

export function useUsers() {
  const [users, setUsers] = useLocalStorageState<User[]>(STORAGE_KEY, seedUsers)
  const authUser = useAuthStore((s) => s.user)
  const setAuthUser = useAuthStore((s) => s.setUser)

  const me = useMemo(() => {
    // 优先以本地存储中 id 与 mockMe 相同的记录为准；authStore 仅作缓存
    const localMe = users.find((u) => u.id === mockMe.id)
    return localMe ?? authUser ?? mockMe
  }, [users, authUser])

  /** 更新当前登录用户资料（同时更新 users 列表与 authStore） */
  const updateMe = useCallback(
    (patch: Partial<User>) => {
      const nextMe = { ...me, ...patch, updatedAt: new Date().toISOString() } as User
      setUsers((prev) => prev.map((u) => (u.id === nextMe.id ? nextMe : u)))
      setAuthUser(nextMe)
      return nextMe
    },
    [me, setUsers, setAuthUser],
  )

  /** 创建新员工 */
  const createUser = useCallback(
    (input: Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { status?: UserStatus }) => {
      const now = new Date().toISOString()
      const newUser: User = {
        ...input,
        id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        status: input.status ?? 'active',
        createdAt: now,
        updatedAt: now,
      }
      setUsers((prev) => [newUser, ...prev])
      return newUser
    },
    [setUsers],
  )

  /** 更新员工 */
  const updateUser = useCallback(
    (id: string, patch: Partial<User>) => {
      setUsers((prev) =>
        prev.map((u) => (u.id === id ? { ...u, ...patch, updatedAt: new Date().toISOString() } : u)),
      )
    },
    [setUsers],
  )

  /** 删除员工 */
  const deleteUser = useCallback(
    (id: string) => {
      setUsers((prev) => prev.filter((u) => u.id !== id))
    },
    [setUsers],
  )

  /** 启用 / 禁用 */
  const setUserStatus = useCallback(
    (id: string, status: UserStatus) => {
      updateUser(id, { status })
    },
    [updateUser],
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
