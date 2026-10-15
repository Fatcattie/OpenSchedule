/**
 * @Audited 装饰器：方法成功后自动写 audit_logs（工程决策 8 审计埋点）。
 * before/after 由配置函数捕获（函数内 this = 方法所属 service，可访问 prisma 取旧值）。
 * 注意：装饰器审计在方法返回后异步落库（独立插入，不与业务同事务）；
 * 需要"审计与业务原子"的场景请用 AuditService.record(input, tx) 事务内写法（推荐）。
 *
 * 用法示例：
 *   @Audited('task.update', {
 *     resourceType: 'task',
 *     resourceId: (args) => (args[0] as UpdateTaskDto).taskId,
 *     before: async function () { return await this.prisma.task.findUnique(...) },   // 旧值
 *     after: (args, result) => result,                                               // 新值
 *   })
 */
import { AuditService } from './audit.service';
import { tenantContext } from '../tenant/tenant-context.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface AuditedConfig {
  /** 资源类型（audit_logs.resource_type）；缺省取 'unknown' */
  resourceType?: string | ((this: any, args: any[], result: any) => string);
  /** 资源 id（audit_logs.resource_id）；缺省取方法第 1 个参数（若为 string/uuid） */
  resourceId?: (this: any, args: any[], result: any) => string | null | undefined;
  /** 变更前快照 */
  before?: (this: any, args: any[]) => unknown | Promise<unknown>;
  /** 变更后快照；缺省取方法返回值 */
  after?: (this: any, args: any[], result: any) => unknown | Promise<unknown>;
  /** 操作者类型（user/system/ai），缺省 user */
  actorType?: 'user' | 'system' | 'ai';
  /** 变更后从返回值中取 tenantId 的字段名（缺省 'tenantId'） */
  tenantField?: string;
}

export function Audited(action: string, config: AuditedConfig = {}): MethodDecorator {
  return function (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor {
    const original = descriptor.value as (...args: unknown[]) => unknown;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    descriptor.value = async function (this: any, ...args: any[]): Promise<unknown> {
      const result = await original.apply(this, args);
      const svc = AuditService.instance;
      if (svc) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const self = this as any;
          const resourceType =
            typeof config.resourceType === 'function'
              ? config.resourceType.apply(self, [args, result] as [any[], any])
              : (config.resourceType ?? 'unknown');
          const resourceId = config.resourceId
            ? config.resourceId.apply(self, [args, result] as [any[], any])
            : typeof args[0] === 'string'
              ? args[0]
              : null;
          const before = config.before ? await config.before.apply(self, args as [any[]]) : undefined;
          const after = config.after ? await config.after.apply(self, [args, result] as [any[], any]) : result;
          const tenantId =
            tenantContext.getTenantId() ??
            self?.tenantId ??
            (after && typeof after === 'object' ? (after as Record<string, unknown>)[config.tenantField ?? 'tenantId'] : undefined);
          // 无法解析租户归属时跳过审计（不写入无租户的审计行，避免外键违规）
          if (typeof tenantId !== 'string') return;
          const rid = resourceId ?? (after && typeof after === 'object' ? (after as Record<string, unknown>).id : undefined);
          await svc.record({
            tenantId,
            actorId: tenantContext.getUserId(),
            actorType: config.actorType ?? 'user',
            action,
            resourceType,
            resourceId: typeof rid === 'string' ? rid : null,
            before,
            after,
          });
        } catch {
          // 审计失败不阻断业务（AuditService.record 内部已容错）
        }
      }
      return result;
    };
    return descriptor;
  };
}
