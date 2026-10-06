/**
 * 职责：权限矩阵全组合测试（ARCH §8 / PRD §3 / M2-P0-01）。
 * 断言 `can()` 与 `PERMISSIONS` 逐格一致；含「member 看不到创建 / 审核入口」类断言。
 *
 * 说明：本用例只覆盖无 React 依赖的纯函数 `can` / `PERMISSIONS`；
 * `useCan()` 为薄封装（读 AppProvider.role），此处以 mock 隔离，避免拉起 RN/Expo 原生模块。
 */
jest.mock('@/store/AppProvider', () => ({
  useAppContext: () => ({ role: 'manager' }),
}))

import { PERMISSIONS, PERMISSION_ACTIONS, can, type PermissionAction } from '@/utils/permission'
import type { AppRole } from '@/types'

/** 全部演示角色 */
const ROLES: AppRole[] = ['manager', 'member']

/** 期望矩阵（与 PRD §3 逐项一致，独立于实现再写一遍） */
const EXPECTED: Record<PermissionAction, AppRole[]> = {
  'project:create': ['manager'],
  'task:create': ['manager'],
  'submission:create': ['manager', 'member'],
  'submission:review': ['manager'],
  'submission:withdraw': ['manager', 'member'],
  'item:edit': ['manager'],
  'item:delete': ['manager'],
  'review:view_pending': ['manager'],
  'personal:manage': ['manager', 'member'],
}

/** member 下应被拒绝的全部动作 */
const MEMBER_FORBIDDEN: PermissionAction[] = [
  'project:create',
  'task:create',
  'submission:review',
  'review:view_pending',
  'item:edit',
  'item:delete',
]

/** 双角色均允许的动作 */
const BOTH_ALLOWED: PermissionAction[] = [
  'submission:create',
  'submission:withdraw',
  'personal:manage',
]

describe('PERMISSIONS —— 单一事实来源', () => {
  it('动作 key 集合与 PRD §3 完全一致', () => {
    expect(new Set(PERMISSION_ACTIONS)).toEqual(new Set(Object.keys(EXPECTED)))
  })

  it('每个动作的角色列表与期望矩阵逐项一致', () => {
    PERMISSION_ACTIONS.forEach((action) => {
      expect(new Set(PERMISSIONS[action])).toEqual(new Set(EXPECTED[action]))
    })
  })
})

describe('can() —— 2 角色 × 全部动作 全组合', () => {
  ROLES.forEach((role) => {
    PERMISSION_ACTIONS.forEach((action) => {
      const shouldAllow = EXPECTED[action].includes(role)
      it(`can('${role}', '${action}') === ${shouldAllow}`, () => {
        expect(can(role, action)).toBe(shouldAllow)
      })
    })
  })
})

describe('can() —— member 看不到创建 / 审核入口（M2-P0-01）', () => {
  it.each(MEMBER_FORBIDDEN)("member 不具备 '%s'", (action) => {
    expect(can('member', action)).toBe(false)
  })

  it.each(BOTH_ALLOWED)("双角色均具备 '%s'", (action) => {
    expect(can('manager', action)).toBe(true)
    expect(can('member', action)).toBe(true)
  })

  it('manager 具备全部 9 个动作', () => {
    PERMISSION_ACTIONS.forEach((action) => expect(can('manager', action)).toBe(true))
  })

  it('submission:review 与 review:view_pending 同源', () => {
    ROLES.forEach((role) => {
      expect(can(role, 'submission:review')).toBe(can(role, 'review:view_pending'))
    })
  })
})
