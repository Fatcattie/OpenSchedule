/**
 * 租户上下文（AsyncLocalStorage）：请求级 tenantId/userId 传递，Prisma 租户扩展与 AuditService 从中取值。
 * 设计：TenantFilterMiddleware 打开请求级 store → JwtAuthGuard 校验成功后 attach 租户/用户 →
 * PrismaService 租户扩展在查询时自动注入 tenant_id（漏 tenant_id 即 403/空结果，工程决策 1）。
 */
import { AsyncLocalStorage } from 'node:async_hooks';

/** 请求上下文 store 形状 */
export interface RequestContextStore {
  tenantId?: string;
  userId?: string;
  bypass?: boolean;
  requestId?: string;
  ip?: string;
  userAgent?: string;
}

/**
 * 租户上下文服务。同时导出单例 tenantContext 供 PrismaService 扩展闭包使用
 * （PrismaService 构造时尚未完成 DI 注入，闭包捕获单例引用）。
 */
export class TenantContextService {
  private readonly als = new AsyncLocalStorage<RequestContextStore>();

  /** 打开请求级上下文（TenantFilterMiddleware 调用，包裹 next()） */
  runWithRequest(fn: () => void): void {
    this.als.run({}, fn);
  }

  /** 绑定当前租户与用户（JwtAuthGuard 校验成功后调用；异步链后续查询自动生效） */
  attach(tenantId: string, userId?: string): void {
    const store = this.als.getStore();
    if (store) {
      store.tenantId = tenantId;
      if (userId) store.userId = userId;
    } else {
      // 兜底：无中间件场景（如单测直接调 guard）用 enterWith 进入上下文
      this.als.enterWith({ tenantId, userId });
    }
  }

  /** 写入请求溯源信息（RequestIdMiddleware 调用） */
  setRequestInfo(info: { requestId: string; ip?: string; userAgent?: string }): void {
    const store = this.als.getStore();
    if (store) {
      store.requestId = info.requestId;
      store.ip = info.ip;
      store.userAgent = info.userAgent;
    } else {
      this.als.enterWith({ ...info });
    }
  }

  /**
   * 手动打开租户作用域（worker/定时任务/测试用）。
   * 注意 PrismaPromise 是惰性的：`runWithTenant(t, () => prisma.x.findMany())` 返回后在作用域外 await，
   * 查询才真正执行，扩展读不到租户 → 不注入、跨租户泄漏。故 fn 返回 thenable 时在作用域内立即触发 then，
   * 返回的是已启动的原生 Promise（不可再放进 $transaction([...]) 数组形式）。
   */
  runWithTenant<T>(tenantId: string, fn: () => T): T {
    return this.als.run({ tenantId }, () => startInScope(fn()));
  }

  /** 旁路：临时关闭租户自动注入（系统级跨租户操作，如登录按邮箱查用户）；惰性 PrismaPromise 处理同 runWithTenant */
  bypass<T>(fn: () => T): T {
    return this.als.run({ bypass: true }, () => startInScope(fn()));
  }

  getTenantId(): string | undefined {
    return this.als.getStore()?.tenantId;
  }

  getUserId(): string | undefined {
    return this.als.getStore()?.userId;
  }

  /** 是否处于租户过滤旁路模式 */
  isBypassed(): boolean {
    return this.als.getStore()?.bypass === true;
  }

  getRequestInfo(): { requestId?: string; ip?: string; userAgent?: string } {
    const s = this.als.getStore();
    return { requestId: s?.requestId, ip: s?.ip, userAgent: s?.userAgent };
  }
}

/** 在当前 ALS 作用域内触发 thenable（惰性 PrismaPromise 由 then 启动执行），非 thenable 原样返回 */
function startInScope<T>(result: T): T {
  if (result !== null && typeof result === 'object' && typeof (result as { then?: unknown }).then === 'function') {
    return (result as unknown as PromiseLike<unknown>).then((v) => v) as unknown as T;
  }
  return result;
}

/** 全局单例（PrismaService 租户扩展等非 DI 场景使用） */
export const tenantContext = new TenantContextService();
