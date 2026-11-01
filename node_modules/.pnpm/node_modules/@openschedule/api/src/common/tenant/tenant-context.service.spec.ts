/**
 * TenantContextService：惰性 thenable（PrismaPromise 形态）须在作用域内启动，
 * 否则在作用域外 await 时扩展读不到租户 → 不注入 tenant_id（跨租户泄漏）。
 */
import { describe, expect, it } from 'vitest';
import { TenantContextService } from './tenant-context.service';

/** 模拟 PrismaPromise：then 被调用时才「执行查询」，并记录执行时看到的租户 */
function lazyQuery(ctx: TenantContextService) {
  return {
    then<R>(resolve: (v: string | undefined) => R) {
      return Promise.resolve(ctx.getTenantId()).then(resolve);
    },
  };
}

describe('TenantContextService', () => {
  it('runWithTenant：返回的惰性查询在作用域外 await 仍读到租户', async () => {
    const ctx = new TenantContextService();
    const pending = ctx.runWithTenant('t-1', () => lazyQuery(ctx));
    expect(ctx.getTenantId()).toBeUndefined();
    await expect(pending).resolves.toBe('t-1');
  });

  it('bypass：惰性查询执行时处于旁路作用域', async () => {
    const ctx = new TenantContextService();
    const seen = ctx.bypass(() => ({
      then<R>(resolve: (v: boolean) => R) {
        return Promise.resolve(ctx.isBypassed()).then(resolve);
      },
    }));
    await expect(seen).resolves.toBe(true);
  });

  it('同步返回值原样透传', () => {
    const ctx = new TenantContextService();
    expect(ctx.runWithTenant('t-2', () => ctx.getTenantId())).toBe('t-2');
  });
});
