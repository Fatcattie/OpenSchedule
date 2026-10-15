/**
 * PrismaService：PrismaClient 封装 + 租户过滤扩展（工程决策 1：tenant_id 自动注入 where/data，防漏租户谓词）。
 * 只对 TENANT_SCOPED_MODELS 自动注入；显式已带 tenantId 的 where 不覆盖；旁路模式（bypass）不注入。
 * 租户作用域打开方式：HTTP 请求由 AuthGuard 绑定；worker/定时任务用 tenantContext.runWithTenant。
 */
import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { tenantContext } from '../tenant/tenant-context.service';

/**
 * 强制租户隔离的业务模型（tenant_id NOT NULL 铁律表，§3.1）。
 * roles/templates 等 tenant_id 可空的表不在此列，由业务代码显式过滤。
 */
export const TENANT_SCOPED_MODELS: ReadonlySet<string> = new Set([
  'MemberProfile',
  'UserRole',
  'Project',
  'Task',
  'PersonalTask',
  'TimeEntry',
  'TaskDependency',
  'TaskComment',
  'AiProposal',
  'Notification',
  'NotificationPreference',
  'Reminder',
  'Attachment',
  'AuditLog',
]);

/** 需要注入 tenant_id 的查询操作 */
const WHERE_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'upsert',
]);

/**
 * 租户过滤扩展：上下文存在 tenantId 且非旁路时，
 * - where 类操作：若 where 未显式带 tenantId，则注入 { ...where, tenantId }（findUnique 走 extendedWhereUnique，Prisma >=4.5）
 * - create/createMany/upsert：若 data 未带 tenantId，则注入（tenant_id 铁律兜底：漏注入即 403/空结果）
 */
const tenantFilterExtension = Prisma.defineExtension({
  name: 'tenant-filter',
  query: {
    $allModels: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async $allOperations({ model, operation, args, query }: { model: string; operation: string; args: any; query: any }) {
        const tenantId = tenantContext.getTenantId();
        if (tenantId && TENANT_SCOPED_MODELS.has(model)) {
          const a = args as {
            where?: Record<string, unknown>;
            data?: Record<string, unknown> | Record<string, unknown>[];
            create?: Record<string, unknown>;
            update?: Record<string, unknown>;
          };
          if (WHERE_OPS.has(operation) && a.where && typeof a.where === 'object' && a.where.tenantId === undefined) {
            a.where = { ...a.where, tenantId };
          }
          if (operation === 'create' && a.data && typeof a.data === 'object' && (a.data as Record<string, unknown>).tenantId === undefined) {
            (a.data as Record<string, unknown>).tenantId = tenantId;
          }
          if (operation === 'createMany' && a.data) {
            const list = Array.isArray(a.data) ? a.data : [a.data];
            for (const item of list) {
              if (item && typeof item === 'object' && item.tenantId === undefined) item.tenantId = tenantId;
            }
          }
          if (operation === 'upsert') {
            if (a.where && typeof a.where === 'object' && a.where.tenantId === undefined) a.where = { ...a.where, tenantId };
            if (a.create && typeof a.create === 'object' && a.create.tenantId === undefined) a.create.tenantId = tenantId;
            // update 不注入 tenantId（tenant_id 不可变）
          }
        }
        return query(args);
      },
    },
  },
});

/** 把 DB_POOL_MAX 拼入 DATABASE_URL（Prisma 无原生 pool 配置项，走 connection_limit 参数，§3.7） */
function buildDatasourceUrl(envUrl: string): string {
  const poolMax = process.env.DB_POOL_MAX;
  if (!poolMax || envUrl.includes('connection_limit')) return envUrl;
  const sep = envUrl.includes('?') ? '&' : '?';
  return `${envUrl}${sep}connection_limit=${poolMax}`;
}

@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    const url = buildDatasourceUrl(process.env.DATABASE_URL ?? '');
    const log: Prisma.LogLevel[] = process.env.APP_ENV === 'production' ? ['warn', 'error'] : ['warn', 'error'];
    super({
      // findUnique/findUniqueOrThrow 注入 tenantId 必需（Prisma 6 默认启用 extendedWhereUnique，无需显式配置；租户过滤扩展依赖）
      datasources: { db: { url } },
      log,
      errorFormat: 'minimal',
    });
    // 构造时返回带租户过滤扩展的客户端（constructor return 覆盖模式）。
    // 注意：本类不能再声明实例字段/方法（会被丢弃）；Prisma 6 惰性连接，无需 onModuleInit。
    return this.$extends(tenantFilterExtension) as this;
  }
}
