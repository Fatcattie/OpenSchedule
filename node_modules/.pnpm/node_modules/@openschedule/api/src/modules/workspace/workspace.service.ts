/**
 * WorkspaceService —— 协作工作台文档存储（D-07 一期）+ 任务业务规则服务端化（D-07 二期）。
 * - 集合白名单 + 可见范围见 workspace-collections.ts；未知集合一律 404（防探测）；
 * - tenant_id 由服务强制，私有集合 owner_key = 当前用户，请求体不可指定；
 * - 批量写单事务原子生效，条目级乐观锁（40901），整批一条审计（只记键名，不记大体积 data）；
 * - 二期：tasks 集合批量写经 @openschedule/workspace-rules 写入守卫（40301）；通过/驳回/撤回只能走
 *   reviewTask 审核命令（服务端执行全部副作用并追加审核留痕，操作人取自令牌不可伪造）；
 *   directory 提供全员可读的通讯录（成员无 /users 权限，但工作台需显示名与承接人候选）。
 */
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ReviewRuleError,
  applyTaskReview,
  checkTaskDelete,
  checkTaskUpsert,
  type RuleActor,
  type RuleTask,
  type SopLibraryDocLite,
  type TaskWriteContext,
} from '@openschedule/workspace-rules';
import { isTenantAdmin } from '../../common/decorators/current-user.decorator';
import { CONFLICT_CODES } from '../../common/constants/error-codes';
import { TENANT_ROLE_KEYS } from '../../common/constants/tenant-roles';
import { ReviewWorkspaceTaskDto } from './dto/review-workspace-task.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { ApiException } from '../../common/exceptions/api.exception';
import type { AuthUser } from '../../common/auth/auth-user.interface';
import { ApplyWorkspaceBatchDto } from './dto/apply-workspace-batch.dto';
import {
  MAX_BATCH_OPS,
  MAX_ITEM_BYTES,
  WorkspaceCollectionScope,
  canWriteShared,
  collectionScope,
  jsonByteLength,
  ownerKeyFor,
} from './workspace-collections';

export interface WorkspaceEntry {
  key: string;
  data: unknown;
  version: number;
}

export interface DirectoryEntry {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  /** manager = 租户 owner/admin（对应前端 useCurrentRole 的 manager） */
  role: 'manager' | 'member' | 'viewer';
}

const TASKS_COLLECTION = 'tasks';
const SOPS_COLLECTION = 'sops';
const ORDER_KEY = '__order__';
const VALUE_KEY = '__value__';

type Tx = Prisma.TransactionClient;
type ItemWhere = (itemKey: string) => { tenantId: string; collection: string; ownerKey: string; itemKey: string };
interface LoadedRow {
  itemKey: string;
  data: unknown;
  version: number;
}

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** 读整个集合（本租户；私有集合仅本人） */
  async list(user: AuthUser, collection: string): Promise<{ data: { items: WorkspaceEntry[] } }> {
    const scope = this.scopeOr404(collection);
    const rows = await this.prisma.workspaceItem.findMany({
      where: { tenantId: user.tenantId, collection, ownerKey: ownerKeyFor(scope, user) },
      select: { itemKey: true, data: true, version: true },
      orderBy: { createdAt: 'asc' },
    });
    return { data: { items: rows.map((r) => ({ key: r.itemKey, data: r.data, version: r.version })) } };
  }

  /** 批量写（单事务；任一条目版本冲突整批回滚） */
  async applyBatch(
    user: AuthUser,
    collection: string,
    dto: ApplyWorkspaceBatchDto,
  ): Promise<{ data: { items: { key: string; version: number }[]; deleted: string[] } }> {
    const scope = this.scopeOr404(collection);
    this.assertWritable(scope, user);
    const upserts = dto.upserts ?? [];
    const deletes = dto.deletes ?? [];
    this.assertBatchShape(upserts.map((u) => u.key), deletes.map((d) => d.key));
    for (const u of upserts) {
      if (jsonByteLength(u.data) > MAX_ITEM_BYTES) {
        throw ApiException.badRequest(`条目 ${u.key} 超过 ${MAX_ITEM_BYTES / 1024 / 1024}MB 上限`);
      }
    }

    const tenantId = user.tenantId;
    const ownerKey = ownerKeyFor(scope, user);
    const where = (itemKey: string) => ({ tenantId, collection, ownerKey, itemKey });

    const result = await this.prisma.$transaction(async (tx) => {
      // D-07 二期：工作台任务写入守卫（审批结果/留痕/创建人/完成/指派/删除），逐条校验 before → after
      if (collection === TASKS_COLLECTION) {
        await this.guardTaskBatch(tx, user, where, upserts, deletes);
      }
      const items: { key: string; version: number }[] = [];
      for (const u of upserts) {
        const data = u.data as Prisma.InputJsonValue;
        if (u.baseVersion == null) {
          const exists = await tx.workspaceItem.findFirst({ where: where(u.key), select: { id: true } });
          if (exists) throw ApiException.optimisticLock(`条目 ${u.key} 已被他人创建，请刷新后重试`);
          try {
            await tx.workspaceItem.create({
              data: { ...where(u.key), data, version: 1, createdBy: user.userId, updatedBy: user.userId },
            });
          } catch (err) {
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
              throw ApiException.optimisticLock(`条目 ${u.key} 已被他人创建，请刷新后重试`);
            }
            throw err;
          }
          items.push({ key: u.key, version: 1 });
        } else {
          const { count } = await tx.workspaceItem.updateMany({
            where: { ...where(u.key), version: u.baseVersion },
            data: { data, version: { increment: 1 }, updatedBy: user.userId },
          });
          if (count === 0) throw ApiException.optimisticLock(`条目 ${u.key} 已被他人修改或删除，请刷新后重试`);
          items.push({ key: u.key, version: u.baseVersion + 1 });
        }
      }

      const deleted: string[] = [];
      for (const d of deletes) {
        const { count } = await tx.workspaceItem.deleteMany({ where: { ...where(d.key), version: d.baseVersion } });
        if (count === 0) {
          const stillThere = await tx.workspaceItem.findFirst({ where: where(d.key), select: { id: true } });
          if (stillThere) throw ApiException.optimisticLock(`条目 ${d.key} 已被他人修改，请刷新后重试`);
        }
        deleted.push(d.key);
      }

      await this.audit.record(
        {
          tenantId,
          actorId: user.userId,
          action: 'workspace.batch',
          resourceType: 'workspace_collection',
          resourceId: collection,
          after: { scope, upserted: items.map((i) => i.key), deleted },
        },
        tx,
      );
      return { items, deleted };
    });
    return { data: result };
  }

  /** 通讯录：本租户全部有租户级角色的启用用户（全员可读；只含显示所需字段） */
  async directory(user: AuthUser): Promise<{ data: { items: DirectoryEntry[] } }> {
    const rows = await this.prisma.userRole.findMany({
      where: { tenantId: user.tenantId, scopeResourceId: null, role: { scope: 'tenant' } },
      select: {
        role: { select: { key: true } },
        user: { select: { id: true, displayName: true, avatarUrl: true, status: true } },
      },
    });
    const rank = { manager: 0, member: 1, viewer: 2 } as const;
    const byUser = new Map<string, DirectoryEntry>();
    for (const r of rows) {
      if (r.user.status !== 'active') continue;
      const role = roleOf(r.role.key);
      const prev = byUser.get(r.user.id);
      if (!prev || rank[role] < rank[prev.role]) {
        byUser.set(r.user.id, { id: r.user.id, displayName: r.user.displayName, avatarUrl: r.user.avatarUrl, role });
      }
    }
    const items = [...byUser.values()].sort((a, b) => rank[a.role] - rank[b.role] || a.displayName.localeCompare(b.displayName, 'zh-CN'));
    return { data: { items } };
  }

  /**
   * 审核命令：通过 / 驳回 / 撤回一个待审任务（单事务）。
   * 规则与副作用（完成闭环、内容/时间/承接人生效、删除级联、项目按 SOP 生成任务、SOP 沉淀）全部服务端执行，
   * 审核留痕由服务端追加，操作人取自令牌。
   */
  async reviewTask(
    user: AuthUser,
    taskId: string,
    dto: ReviewWorkspaceTaskDto,
  ): Promise<{ data: { taskId: string; action: string; approvalStatus: string | null; generated: number; sopArchived: boolean } }> {
    this.assertWritable('tenant', user);
    const actor = await this.actorOf(user);
    const tenantId = user.tenantId;
    const taskWhere: ItemWhere = (itemKey) => ({ tenantId, collection: TASKS_COLLECTION, ownerKey: '', itemKey });

    return this.prisma.$transaction(async (tx) => {
      const rows = await this.loadRows(tx, tenantId, TASKS_COLLECTION);
      const byKey = new Map(rows.map((r) => [r.itemKey, r]));
      const tasks = orderedItems<RuleTask>(rows);

      let result;
      try {
        result = applyTaskReview(
          tasks,
          { taskId, action: dto.action, opinion: dto.opinion, reason: dto.reason },
          { actor, now: new Date().toISOString(), newId: (prefix) => `${prefix}-${randomUUID()}` },
        );
      } catch (err) {
        throw toApiError(err);
      }

      for (const t of result.upserts) {
        await this.writeItem(tx, taskWhere, byKey.get(t.id), t, user.userId);
      }
      for (const id of result.deletes) {
        const row = byKey.get(id);
        if (row) await this.deleteItem(tx, taskWhere, row);
      }
      if (result.prepend.length > 0 || result.deletes.length > 0) {
        await this.rewriteOrder(tx, taskWhere, byKey.get(ORDER_KEY), rows, result.prepend, result.deletes, user.userId);
      }
      if (result.sopDoc) await this.archiveSop(tx, tenantId, result.sopDoc, user.userId);

      const reviewed = result.upserts.find((t) => t.id === taskId);
      await this.audit.record(
        {
          tenantId,
          actorId: user.userId,
          action: `workspace.task.${dto.action}`,
          resourceType: 'workspace_task',
          resourceId: taskId,
          after: {
            opinion: dto.opinion,
            reason: dto.reason ?? '',
            approvalStatus: reviewed?.approvalStatus ?? null,
            deleted: result.deletes,
            generated: result.prepend,
            sopArchived: result.sopDoc?.id ?? null,
          },
        },
        tx,
      );
      return {
        data: {
          taskId,
          action: dto.action,
          approvalStatus: reviewed?.approvalStatus ?? null,
          generated: result.prepend.length,
          sopArchived: Boolean(result.sopDoc),
        },
      };
    });
  }

  // ===================== 内部工具 =====================

  private async actorOf(user: AuthUser): Promise<RuleActor> {
    const row = await this.prisma.user.findUnique({ where: { id: user.userId }, select: { displayName: true } });
    return { userId: user.userId, displayName: row?.displayName ?? user.userId, isManager: isTenantAdmin(user) };
  }

  /** tasks 集合批量写守卫：读出本批涉及条目的当前值，逐条校验 */
  private async guardTaskBatch(
    tx: Tx,
    user: AuthUser,
    where: ItemWhere,
    upserts: { key: string; data: unknown }[],
    deletes: { key: string }[],
  ): Promise<void> {
    const keys = [...upserts.map((u) => u.key), ...deletes.map((d) => d.key)];
    const base = where('');
    const rows = await tx.workspaceItem.findMany({
      where: { tenantId: base.tenantId, collection: base.collection, ownerKey: base.ownerKey, itemKey: { in: keys } },
      select: { itemKey: true, data: true },
    });
    const before = new Map(rows.map((r) => [r.itemKey, r.data as RuleTask]));
    const ctx: TaskWriteContext = { actor: { userId: user.userId, displayName: '', isManager: isTenantAdmin(user) } };

    // 非管理新建「创建人非本人」的重复任务实例：需核对同组已有任务的创建人
    const needsGroups = !ctx.actor.isManager && upserts.some((u) => {
      const d = u.data as RuleTask | null;
      return !before.has(u.key) && d && typeof d === 'object' && d.recurrenceGroupId && d.createdBy !== user.userId;
    });
    if (needsGroups) {
      const all = await this.loadRows(tx, base.tenantId, TASKS_COLLECTION);
      const groups = new Map<string, string>();
      for (const r of all) {
        const t = r.data as RuleTask;
        if (t && typeof t === 'object' && t.recurrenceGroupId && t.createdBy) groups.set(t.recurrenceGroupId, t.createdBy);
      }
      ctx.recurrenceGroupCreators = groups;
    }

    for (const u of upserts) {
      const err = checkTaskUpsert(u.key, before.get(u.key) ?? null, u.data, ctx);
      if (err) throw new ApiException(40301, `${err}（任务 ${u.key}）`, HttpStatus.FORBIDDEN, { key: u.key });
    }
    for (const d of deletes) {
      const err = checkTaskDelete(d.key, before.get(d.key) ?? null, ctx);
      if (err) throw new ApiException(40301, `${err}（任务 ${d.key}）`, HttpStatus.FORBIDDEN, { key: d.key });
    }
  }

  private async loadRows(tx: Tx, tenantId: string, collection: string): Promise<LoadedRow[]> {
    return tx.workspaceItem.findMany({
      where: { tenantId, collection, ownerKey: '' },
      select: { itemKey: true, data: true, version: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** 按版本写一条（存在则 version 匹配才覆盖，否则新建）；冲突 40901 */
  private async writeItem(tx: Tx, where: ItemWhere, row: LoadedRow | undefined, data: unknown, userId: string): Promise<void> {
    const json = data as Prisma.InputJsonValue;
    const key = (data as { id?: string }).id ?? '';
    if (row) {
      const { count } = await tx.workspaceItem.updateMany({
        where: { ...where(row.itemKey), version: row.version },
        data: { data: json, version: { increment: 1 }, updatedBy: userId },
      });
      if (count === 0) throw ApiException.optimisticLock();
    } else {
      await tx.workspaceItem.create({ data: { ...where(key), data: json, version: 1, createdBy: userId, updatedBy: userId } });
    }
  }

  private async deleteItem(tx: Tx, where: ItemWhere, row: LoadedRow): Promise<void> {
    const { count } = await tx.workspaceItem.deleteMany({ where: { ...where(row.itemKey), version: row.version } });
    if (count === 0) throw ApiException.optimisticLock();
  }

  /** 顺序表：新建的放最前、删除的移除；无顺序表时按现有库内顺序生成 */
  private async rewriteOrder(
    tx: Tx,
    where: ItemWhere,
    orderRow: LoadedRow | undefined,
    rows: LoadedRow[],
    prepend: string[],
    deletes: string[],
    userId: string,
  ): Promise<void> {
    const removed = new Set(deletes);
    const current = Array.isArray(orderRow?.data)
      ? (orderRow!.data as string[])
      : rows.filter((r) => r.itemKey !== ORDER_KEY && r.itemKey !== VALUE_KEY).map((r) => r.itemKey);
    const next = [...prepend, ...current.filter((id) => !removed.has(id) && !prepend.includes(id))];
    const json = next as unknown as Prisma.InputJsonValue;
    if (orderRow) {
      const { count } = await tx.workspaceItem.updateMany({
        where: { ...where(ORDER_KEY), version: orderRow.version },
        data: { data: json, version: { increment: 1 }, updatedBy: userId },
      });
      if (count === 0) throw ApiException.optimisticLock();
    } else {
      await tx.workspaceItem.create({ data: { ...where(ORDER_KEY), data: json, version: 1, createdBy: userId, updatedBy: userId } });
    }
  }

  /** SOP 沉淀：同一来源任务只保留最新一份，新文档置顶（兼容整值 / 按条目两种存储形态） */
  private async archiveSop(tx: Tx, tenantId: string, doc: SopLibraryDocLite, userId: string): Promise<void> {
    const sopWhere: ItemWhere = (itemKey) => ({ tenantId, collection: SOPS_COLLECTION, ownerKey: '', itemKey });
    const rows = await this.loadRows(tx, tenantId, SOPS_COLLECTION);
    const valueRow = rows.find((r) => r.itemKey === VALUE_KEY);
    if (valueRow) {
      const list = Array.isArray(valueRow.data) ? (valueRow.data as SopLibraryDocLite[]) : [];
      const next = [doc, ...list.filter((d) => d?.sourceTaskId !== doc.sourceTaskId)];
      const { count } = await tx.workspaceItem.updateMany({
        where: { ...sopWhere(VALUE_KEY), version: valueRow.version },
        data: { data: next as unknown as Prisma.InputJsonValue, version: { increment: 1 }, updatedBy: userId },
      });
      if (count === 0) throw ApiException.optimisticLock();
      return;
    }
    const stale = rows.filter(
      (r) => r.itemKey !== ORDER_KEY && (r.data as SopLibraryDocLite | null)?.sourceTaskId === doc.sourceTaskId,
    );
    for (const r of stale) await this.deleteItem(tx, sopWhere, r);
    await this.writeItem(tx, sopWhere, undefined, doc, userId);
    await this.rewriteOrder(tx, sopWhere, rows.find((r) => r.itemKey === ORDER_KEY), rows, [doc.id], stale.map((r) => r.itemKey), userId);
  }

  private scopeOr404(collection: string): WorkspaceCollectionScope {
    const scope = collectionScope(collection);
    if (!scope) throw ApiException.notFound('工作台集合不存在');
    return scope;
  }

  private assertWritable(scope: WorkspaceCollectionScope, user: AuthUser): void {
    if (scope === 'tenant' && !canWriteShared(user)) {
      throw ApiException.forbidden('只读角色不能修改团队共享的工作台数据');
    }
  }

  /** 批次形状：非空、总数上限、同一键在批内只出现一次 */
  private assertBatchShape(upsertKeys: string[], deleteKeys: string[]): void {
    const all = [...upsertKeys, ...deleteKeys];
    if (all.length === 0) throw ApiException.badRequest('批次为空');
    if (all.length > MAX_BATCH_OPS) throw ApiException.badRequest(`单批最多 ${MAX_BATCH_OPS} 个条目操作`);
    if (new Set(all).size !== all.length) throw ApiException.badRequest('同一条目在一个批次内只能出现一次');
  }
}

function roleOf(key: string): DirectoryEntry['role'] {
  if (key === TENANT_ROLE_KEYS.OWNER || key === TENANT_ROLE_KEYS.ADMIN) return 'manager';
  if (key === TENANT_ROLE_KEYS.VIEWER) return 'viewer';
  return 'member';
}

/** 条目行 → 按顺序表排列的对象数组（与前端 decodeEntries 一致：顺序表优先，缺失条目按库内顺序追加） */
function orderedItems<T>(rows: LoadedRow[]): T[] {
  const byKey = new Map(rows.map((r) => [r.itemKey, r.data]));
  const order = Array.isArray(byKey.get(ORDER_KEY)) ? (byKey.get(ORDER_KEY) as string[]) : [];
  const seen = new Set<string>([ORDER_KEY, VALUE_KEY]);
  const out: T[] = [];
  for (const id of order) {
    if (byKey.has(id) && !seen.has(id)) {
      out.push(byKey.get(id) as T);
      seen.add(id);
    }
  }
  for (const r of rows) {
    if (!seen.has(r.itemKey)) {
      out.push(r.data as T);
      seen.add(r.itemKey);
    }
  }
  return out;
}

function toApiError(err: unknown): unknown {
  if (!(err instanceof ReviewRuleError)) return err;
  switch (err.kind) {
    case 'not_found':
      return ApiException.notFound(err.message);
    case 'forbidden':
      return ApiException.forbidden(err.message);
    case 'invalid_input':
      return ApiException.badRequest(err.message);
    default:
      return new ApiException(CONFLICT_CODES.ILLEGAL_TRANSITION, err.message, HttpStatus.CONFLICT, { allowed_transitions: [] });
  }
}
