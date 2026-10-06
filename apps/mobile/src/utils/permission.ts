/**
 * 职责：前端权限门禁的**单一事实来源**（PRD §3 权限矩阵 / ARCH §3 / §7）。
 *
 * 设计要点：
 * - `PERMISSIONS` 是唯一事实来源，`can()` 与 `useCan()` 都只读它；
 * - `can()` 为无 React 依赖的纯函数，可被 service / 纯函数测试复用；
 * - `useCan()` 为薄封装，读 `AppProvider.role` 并返回**稳定的 useCallback 函数**（可安全入依赖数组）；
 * - 页面统一姿势：`const can = useCan()` → `can('task:create') ? <入口/> : null`（**隐藏，不置灰**）。
 *   禁止在页面里手写 `role === 'manager'`。
 */
import { useCallback } from 'react'
import type { AppRole } from '@/types'
import { useAppContext } from '@/store/AppProvider'

/** 权限动作 key（与 PRD §3 权限矩阵逐项对齐） */
export type PermissionAction =
  | 'project:create'
  | 'task:create'
  | 'submission:create'
  | 'submission:review'
  | 'submission:withdraw'
  | 'item:edit'
  | 'item:delete'
  | 'review:view_pending'
  | 'personal:manage'

/**
 * 权限映射（PRD §3 矩阵的一一映射）。
 * 单一事实来源：`can` / `useCan` 均只读本表。
 */
export const PERMISSIONS: Record<PermissionAction, AppRole[]> = {
  'project:create': ['manager'],
  'task:create': ['manager'],
  // 同一入口，行为按角色分叉：manager 免审直接落地 / member 进待审核
  'submission:create': ['manager', 'member'],
  // 决定「待我审核」Tab 是否可见
  'submission:review': ['manager'],
  // 仅本人 pending 可撤回
  'submission:withdraw': ['manager', 'member'],
  // ⚠️ 预留，本增量无对应 UI：仅落权限 key，**不得**用于门禁任何已验收流程
  'item:edit': ['manager'],
  // ⚠️ 预留，本增量无对应 UI：仅落权限 key，**不得**用于门禁任何已验收流程
  'item:delete': ['manager'],
  // 与 submission:review 同源
  'review:view_pending': ['manager'],
  // 覆盖个人任务 CRUD（个人计划不做团队事项编辑）
  'personal:manage': ['manager', 'member'],
}

/** 全部权限动作（便于遍历 / 测试） */
export const PERMISSION_ACTIONS: PermissionAction[] = Object.keys(PERMISSIONS) as PermissionAction[]

/** 判断某角色是否具备某动作权限（纯函数） */
export function can(role: AppRole, action: PermissionAction): boolean {
  const allowed = PERMISSIONS[action]
  if (!allowed) return false
  return allowed.includes(role)
}

/**
 * 读 `AppProvider.role` 的便捷 hook。
 * 返回**稳定的 `useCallback` 函数**（依赖仅 `role`），可安全放入依赖数组。
 */
export function useCan(): (action: PermissionAction) => boolean {
  const { role } = useAppContext()
  return useCallback((action: PermissionAction) => can(role, action), [role])
}
