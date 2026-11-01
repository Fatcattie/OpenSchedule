/**
 * onboarding.ts —— 成员 onboarding 纯函数（R6-1 / D-05 B：管理员代建账号）。
 * 只做输入 → 领域值映射，不做 IO/副作用；供 AuthService.adminCreateMember 调用。
 */
import { TENANT_ROLE_KEYS } from '../../common/constants/tenant-roles';

/** 管理员可代建的角色（owner 不可代建：owner = 租户创建者，§3.4 派生语义） */
export const MEMBER_ROLE_TO_KEY: Record<string, string> = {
  admin: TENANT_ROLE_KEYS.ADMIN,
  member: TENANT_ROLE_KEYS.MEMBER,
  viewer: TENANT_ROLE_KEYS.VIEWER,
} as const;

export type MemberRoleAlias = 'admin' | 'member' | 'viewer';

/** 角色别名 → 租户角色 key；缺省/未知一律回落 member（最小权限，防越权提权） */
export function resolveMemberRoleKey(role: string | undefined | null): string {
  if (!role) return TENANT_ROLE_KEYS.MEMBER;
  return MEMBER_ROLE_TO_KEY[role] ?? TENANT_ROLE_KEYS.MEMBER;
}