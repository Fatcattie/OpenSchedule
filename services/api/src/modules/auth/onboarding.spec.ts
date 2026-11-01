import { describe, expect, it } from 'vitest'
import { resolveMemberRoleKey, MEMBER_ROLE_TO_KEY } from './onboarding';
import { TENANT_ROLE_KEYS } from '../../common/constants/tenant-roles';

describe('onboarding.resolveMemberRoleKey', () => {
  it('映射 admin → tenant.admin', () => {
    expect(resolveMemberRoleKey('admin')).toBe(TENANT_ROLE_KEYS.ADMIN);
  });

  it('映射 member → tenant.member', () => {
    expect(resolveMemberRoleKey('member')).toBe(TENANT_ROLE_KEYS.MEMBER);
  });

  it('映射 viewer → tenant.viewer', () => {
    expect(resolveMemberRoleKey('viewer')).toBe(TENANT_ROLE_KEYS.VIEWER);
  });

  it('缺省（undefined/null）回落 member（最小权限）', () => {
    expect(resolveMemberRoleKey(undefined)).toBe(TENANT_ROLE_KEYS.MEMBER);
    expect(resolveMemberRoleKey(null)).toBe(TENANT_ROLE_KEYS.MEMBER);
  });

  it('未知角色别名回落 member（防越权提权）', () => {
    expect(resolveMemberRoleKey('owner')).toBe(TENANT_ROLE_KEYS.MEMBER);
    expect(resolveMemberRoleKey('superadmin')).toBe(TENANT_ROLE_KEYS.MEMBER);
  });

  it('role 映射表不含 owner（owner 不可代建）', () => {
    expect(MEMBER_ROLE_TO_KEY.owner).toBeUndefined();
  });
});
