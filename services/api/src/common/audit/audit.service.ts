/**
 * AuditService：append-only 审计写入（§3.2 域 10 audit_logs；工程决策 8：所有写操作必须落审计，
 * Phase 1 同步写、Phase 3 异步队列；actor_type 区分 user/system/ai；不用 DB trigger）。
 * 两种使用方式：
 *  ① 事务内 record(input, tx)（业务同事现有写法，审计与业务同事务，原子性最强，推荐）；
 *  ② @Audited('action') 装饰器（方法成功后自动落审计，before/after 由配置函数捕获）。
 * 注：record 会自动把 Date/Decimal 等非 JSON 类型序列化（JSON.parse(JSON.stringify())），业务对象可直接传。
 */
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { tenantContext } from '../tenant/tenant-context.service';

/** 审计写入输入（tenantId 必填=租户铁律；actor 缺省时取当前请求用户） */
export interface AuditRecordInput {
  tenantId: string;
  actorId?: string | null;
  /** user/system/ai（AI 动作单独留痕，与 ai_proposals 联动形成"提案→审批→应用"审批链，决策 8） */
  actorType?: 'user' | 'system' | 'ai';
  action: string; // task.update/task.complete/ai.proposal.approve...（§3.2）
  resourceType: string;
  resourceId?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  before?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  after?: any;
}

@Injectable()
export class AuditService {
  /** 静态实例持有：@Audited 装饰器（非 DI 上下文）经此取服务（模块初始化时注册） */
  static instance: AuditService | null = null;

  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {
    AuditService.instance = this;
  }

  /**
   * 写一条审计（append-only，只插不更不删）。
   * @param input 审计内容（before/after 快照，diff 可回滚）
   * @param tx 可选事务客户端：与业务写操作同事务落审计（推荐）
   */
  async record(input: AuditRecordInput, tx?: Prisma.TransactionClient): Promise<void> {
    const db = tx ?? this.prisma;
    const reqInfo = tenantContext.getRequestInfo();
    const actorId = input.actorId ?? tenantContext.getUserId() ?? null;
    try {
      await db.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorId,
          actorType: input.actorType ?? 'user',
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId ?? null,
          before: input.before !== undefined ? this.sanitizeJson(input.before) : (Prisma.JsonNull as unknown as Prisma.InputJsonValue),
          after: input.after !== undefined ? this.sanitizeJson(input.after) : (Prisma.JsonNull as unknown as Prisma.InputJsonValue),
          ip: reqInfo.ip ?? null,
          userAgent: reqInfo.userAgent ?? null,
          requestId: reqInfo.requestId ?? null,
        },
      });
    } catch (err) {
      // 审计失败不阻断业务主链路（决策 8：Phase 1 同步写；Phase 3 异步队列防主链路阻塞）
      this.logger.error(
        `审计写入失败（action=${input.action}, resource=${input.resourceType}/${input.resourceId}）: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * 查询审计（/audit-logs 用，§3.5.1；租户 Admin 全量 / 项目负责人本项目，权限在调用方校验）。
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async list(tenantId: string, filter: { resourceType?: string; resourceId?: string; actorId?: string; page?: number; pageSize?: number }): Promise<any> {
    const page = filter.page ?? 1;
    const pageSize = Math.min(filter.pageSize ?? 20, 100);
    const where: Prisma.AuditLogWhereInput = {
      tenantId,
      ...(filter.resourceType ? { resourceType: filter.resourceType } : {}),
      ...(filter.resourceId ? { resourceId: filter.resourceId } : {}),
      ...(filter.actorId ? { actorId: filter.actorId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { data: items, meta: { page, pageSize, total } };
  }

  /** 非 JSON 安全值（Date/Decimal/undefined 等）→ Prisma.InputJsonValue */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sanitizeJson(value: any): Prisma.InputJsonValue {
    if (value === null || value === undefined) return Prisma.JsonNull as unknown as Prisma.InputJsonValue;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'bigint') return value.toString();
    if (typeof value !== 'object') return value as Prisma.InputJsonValue;
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
