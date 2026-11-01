/**
 * useCurrentRole —— 工作台角色判定（R7-3：服务端角色唯一来源）
 *
 * - isManagerRole：纯函数，单测覆盖 tenant.owner / tenant.admin / 含 * 权限 / 其他 / 边界
 * - useCurrentRole：hook 行为，依赖 authStore；用 act+selector 形式隔离 store 状态
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { isManagerRole, useCurrentRole } from '@/hooks/useCurrentRole'
import { useAuthStore } from '@/stores/authStore'
import type { AuthRole } from '@/types'

describe('isManagerRole 纯函数（R7-3 服务端角色唯一来源）', () => {
  it('undefined / 空数组 → false（fail-closed 为 member）', () => {
    expect(isManagerRole(undefined)).toBe(false)
    expect(isManagerRole([])).toBe(false)
  })

  it('字符串角色 key：tenant.owner / tenant.admin → true', () => {
    expect(isManagerRole(['tenant.owner'])).toBe(true)
    expect(isManagerRole(['tenant.admin'])).toBe(true)
  })

  it('字符串角色 key：其它角色（如 tenant.member / project.lead）→ false', () => {
    expect(isManagerRole(['tenant.member'])).toBe(false)
    expect(isManagerRole(['project.lead'])).toBe(false)
  })

  it('对象角色：key 字段为 tenant.owner / tenant.admin → true', () => {
    const ownerRole: AuthRole = { key: 'tenant.owner' }
    const adminRole: AuthRole = { key: 'tenant.admin' }
    expect(isManagerRole([ownerRole])).toBe(true)
    expect(isManagerRole([adminRole])).toBe(true)
  })

  it('对象角色：permissions 含通配符 * → true', () => {
    const wildcard: AuthRole = { key: 'tenant.member', permissions: ['*'] }
    expect(isManagerRole([wildcard])).toBe(true)
  })

  it('对象角色：permissions 不含 * → false（即使 key 类似）', () => {
    const limited: AuthRole = { key: 'tenant.member', permissions: ['read'] }
    expect(isManagerRole([limited])).toBe(false)
  })

  it('字符串角色 key 不参与 permissions 字段检查（mock 兼容路径）', () => {
    // 字符串值无 permissions 字段 —— must fall back to key 比对；不应当成 * 匹配
    expect(isManagerRole(['tenant.owner'])).toBe(true)
    expect(isManagerRole(['tenant.guest'])).toBe(false)
  })

  it('多角色：任意一项命中即视为 manager（OR 语义）', () => {
    expect(isManagerRole(['tenant.member', 'tenant.admin'])).toBe(true)
    expect(isManagerRole(['tenant.member', { key: 'project.lead', permissions: ['*'] }])).toBe(true)
  })
})

describe('useCurrentRole hook（依赖 useAuthStore）', () => {
  beforeEach(() => {
    // 每个用例前清空 user —— authStore 是 zustand 单例
    useAuthStore.setState({ user: null })
  })

  it('user.roles 未设置时 → member（fail-closed）', () => {
    useAuthStore.setState({ user: { id: 'u1', email: 'a@b.c', displayName: 'a', roles: undefined } as never })
    const { result } = renderHook(() => useCurrentRole())
    expect(result.current).toBe('member')
  })

  it('user.roles 含 tenant.owner → manager', () => {
    useAuthStore.setState({
      user: { id: 'u1', email: 'a@b.c', displayName: 'a', roles: ['tenant.owner'] } as never,
    })
    const { result } = renderHook(() => useCurrentRole())
    expect(result.current).toBe('manager')
  })

  it('user.roles 仅含 tenant.member → member', () => {
    useAuthStore.setState({
      user: { id: 'u1', email: 'a@b.c', displayName: 'a', roles: ['tenant.member'] } as never,
    })
    const { result } = renderHook(() => useCurrentRole())
    expect(result.current).toBe('member')
  })

  it('store 状态变化时 hook 实时反映（zustand 订阅）', () => {
    useAuthStore.setState({
      user: { id: 'u1', email: 'a@b.c', displayName: 'a', roles: ['tenant.member'] } as never,
    })
    const { result, rerender } = renderHook(() => useCurrentRole())
    expect(result.current).toBe('member')
    useAuthStore.setState({
      user: { id: 'u1', email: 'a@b.c', displayName: 'a', roles: ['tenant.admin'] } as never,
    })
    rerender()
    expect(result.current).toBe('manager')
  })
})
