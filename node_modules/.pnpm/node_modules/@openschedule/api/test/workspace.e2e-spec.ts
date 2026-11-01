/**
 * 工作台存储集成测试（D-07 一期，真实 PostgreSQL）：
 *  W-01 新建 / 读回 / JSONB 往返（对象键被 JSONB 重排后内容不变）
 *  W-02 唯一约束 (tenant, collection, owner, key) + 并发新建同键 → 40901
 *  W-03 baseVersion 乐观锁：过期版本 → 40901，且整批回滚（同批新建条目不落库）
 *  W-04 租户隔离 + 私有集合属主隔离（经 PrismaService 租户扩展与显式谓词双保险）
 *  W-05 审计与业务同事务：整批一条 workspace.batch 审计
 * DB 不可达时用例内显式跳过（基建前置，非断言失败）。
 * 运行：pnpm --filter "./services/api" run test:e2e
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AuditService } from '../src/common/audit/audit.service';
import { WorkspaceService } from '../src/modules/workspace/workspace.service';
import type { AuthUser } from '../src/common/auth/auth-user.interface';

const uuid = () => globalThis.crypto.randomUUID();
type RawExec = (sql: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;

let prisma: PrismaService;
let svc: WorkspaceService;
let dbAvailable = false;
const tenantA = uuid();
const tenantB = uuid();
const userA1 = uuid();
const userA2 = uuid();
const userB = uuid();

const member = (userId: string, tenantId: string): AuthUser => ({
  userId,
  tenantId,
  roles: [{ key: 'tenant.member', scope: 'tenant', scopeResourceId: null }],
});

function skipIfNoDb(): boolean {
  if (!dbAvailable) console.warn('[workspace] PostgreSQL 不可达（基建前置，非断言失败）：本用例待数据库可达后执行');
  return !dbAvailable;
}

describe('workspace（D-07 一期，真实 PostgreSQL）', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL ??= 'postgresql://openschedule:openschedule@localhost:5432/openschedule?schema=public';
    prisma = new PrismaService();
    try {
      await prisma.$connect();
      const raw = prisma.$queryRaw.bind(prisma) as unknown as RawExec;
      await raw`INSERT INTO tenants (id, name, updated_at) VALUES (${tenantA}::uuid, 'ws-a', now()), (${tenantB}::uuid, 'ws-b', now())`;
      await raw`
        INSERT INTO users (id, email, display_name, updated_at)
        VALUES (${userA1}::uuid, ${`${userA1}@ws.test`}, 'A1', now()),
               (${userA2}::uuid, ${`${userA2}@ws.test`}, 'A2', now()),
               (${userB}::uuid, ${`${userB}@ws.test`}, 'B', now())
      `;
      dbAvailable = true;
    } catch (err) {
      console.warn('[workspace] PostgreSQL 不可达/未建表，依赖真实库的用例将 skip：' + (err instanceof Error ? err.message : String(err)));
    }
    svc = new WorkspaceService(prisma, new AuditService(prisma));
  }, 60_000);

  afterAll(async () => {
    if (dbAvailable) {
      const raw = prisma.$queryRaw.bind(prisma) as unknown as RawExec;
      await raw`DELETE FROM workspace_items WHERE tenant_id IN (${tenantA}::uuid, ${tenantB}::uuid)`.catch(() => undefined);
      await raw`DELETE FROM audit_logs WHERE tenant_id IN (${tenantA}::uuid, ${tenantB}::uuid)`.catch(() => undefined);
      await raw`DELETE FROM users WHERE id IN (${userA1}::uuid, ${userA2}::uuid, ${userB}::uuid)`.catch(() => undefined);
      await raw`DELETE FROM tenants WHERE id IN (${tenantA}::uuid, ${tenantB}::uuid)`.catch(() => undefined);
    }
    await prisma.$disconnect().catch(() => undefined);
  });

  it('W-01 新建并读回，JSONB 往返内容不变', async () => {
    if (skipIfNoDb()) return;
    const data = { id: 'task-1', title: '中文标题', nested: { z: 1, a: [1, 2] }, images: ['data:image/png;base64,AAAA'] };
    const res = await svc.applyBatch(member(userA1, tenantA), 'experience', { upserts: [{ key: 'task-1', data }] });
    expect(res.data.items).toEqual([{ key: 'task-1', version: 1 }]);
    const list = await svc.list(member(userA2, tenantA), 'experience');
    expect(list.data.items).toEqual([{ key: 'task-1', data, version: 1 }]);
  });

  it('W-02 同键重复新建 → 40901（唯一约束兜底）', async () => {
    if (skipIfNoDb()) return;
    await expect(
      svc.applyBatch(member(userA2, tenantA), 'experience', { upserts: [{ key: 'task-1', data: { id: 'task-1' } }] }),
    ).rejects.toMatchObject({ response: { code: 40901 } });
  });

  it('W-03 过期 baseVersion → 40901，同批新建条目随事务回滚', async () => {
    if (skipIfNoDb()) return;
    await svc.applyBatch(member(userA1, tenantA), 'experience', { upserts: [{ key: 'task-1', data: { v: 2 }, baseVersion: 1 }] });
    await expect(
      svc.applyBatch(member(userA2, tenantA), 'experience', {
        upserts: [
          { key: 'task-new', data: { v: 1 } },
          { key: 'task-1', data: { v: 'stale' }, baseVersion: 1 },
        ],
      }),
    ).rejects.toMatchObject({ response: { code: 40901 } });
    const keys = (await svc.list(member(userA1, tenantA), 'experience')).data.items.map((i) => i.key);
    expect(keys).toEqual(['task-1']);
  });

  it('W-04 租户隔离 + 私有集合属主隔离', async () => {
    if (skipIfNoDb()) return;
    expect((await svc.list(member(userB, tenantB), 'experience')).data.items).toHaveLength(0);
    await svc.applyBatch(member(userA1, tenantA), 'reminders', { upserts: [{ key: 'r-1', data: { id: 'r-1', content: 'x' } }] });
    expect((await svc.list(member(userA1, tenantA), 'reminders')).data.items).toHaveLength(1);
    expect((await svc.list(member(userA2, tenantA), 'reminders')).data.items).toHaveLength(0);
  });

  it('W-05 审计与写入同事务：每批一条 workspace.batch', async () => {
    if (skipIfNoDb()) return;
    const raw = prisma.$queryRaw.bind(prisma) as unknown as RawExec;
    const rows = (await raw`
      SELECT action, resource_id FROM audit_logs WHERE tenant_id = ${tenantA}::uuid AND action = 'workspace.batch'
    `) as { action: string; resource_id: string }[];
    // W-01 / W-03 第一批 / W-04 成功写入 3 批；失败批次（W-02、W-03 第二批）随事务回滚不留审计
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.resource_id).sort()).toEqual(['experience', 'experience', 'reminders']);
  });

  // ───────────── D-07 二期：任务写入守卫 + 审核命令 + 通讯录 ─────────────

  const admin = (userId: string, tenantId: string): AuthUser => ({
    userId,
    tenantId,
    roles: [{ key: 'tenant.admin', scope: 'tenant', scopeResourceId: null }],
  });
  const baseTask = (over: Record<string, unknown>) => ({
    kind: 'task',
    status: 'in_progress',
    assigneeId: null,
    approvalStatus: 'none',
    approvalType: null,
    proposalStatus: 'none',
    auditLogs: [],
    executionLogs: [],
    comments: [],
    ...over,
  });

  it('W-06 成员不能经批量写把自己的完成提报写成通过（40301，且不落库）', async () => {
    if (skipIfNoDb()) return;
    const task = baseTask({
      id: 'p2-1',
      title: '二期任务',
      createdBy: userA1,
      assigneeId: userA1,
      approvalStatus: 'pending',
      approvalType: 'completion',
      completion: { completedAt: '2026-10-18 09:00', summary: '完成总结' },
    });
    await svc.applyBatch(member(userA1, tenantA), 'tasks', { upserts: [{ key: '__order__', data: ['p2-1'] }, { key: 'p2-1', data: task }] });
    await expect(
      svc.applyBatch(member(userA1, tenantA), 'tasks', {
        upserts: [{ key: 'p2-1', data: { ...task, approvalStatus: 'approved', status: 'done' }, baseVersion: 1 }],
      }),
    ).rejects.toMatchObject({ response: { code: 40301 } });
    const stored = (await svc.list(member(userA1, tenantA), 'tasks')).data.items.find((i) => i.key === 'p2-1');
    expect(stored).toMatchObject({ version: 1, data: { approvalStatus: 'pending', status: 'in_progress' } });
  });

  it('W-07 审核命令：管理通过 → 任务完成、服务端留痕（操作人显示名取库）、SOP 沉淀、命令审计', async () => {
    if (skipIfNoDb()) return;
    await expect(svc.reviewTask(member(userA2, tenantA), 'p2-1', { action: 'approve', opinion: 'agree' })).rejects.toMatchObject({
      response: { code: 40301 },
    });
    const res = await svc.reviewTask(admin(userA2, tenantA), 'p2-1', { action: 'approve', opinion: 'agree', reason: '通过' });
    expect(res.data).toMatchObject({ approvalStatus: 'approved', sopArchived: true });
    const task = (await svc.list(member(userA1, tenantA), 'tasks')).data.items.find((i) => i.key === 'p2-1')!;
    expect(task.version).toBe(2);
    expect(task.data).toMatchObject({ status: 'done', completedAt: '2026-10-18T01:00:00.000Z', approvalStatus: 'approved' });
    expect((task.data as { auditLogs: unknown[] }).auditLogs).toEqual([
      expect.objectContaining({ action: 'approve', operatorId: userA2, operatorName: 'A2', reason: '通过' }),
    ]);
    const sops = (await svc.list(member(userA1, tenantA), 'sops')).data.items;
    expect(sops.find((i) => i.key !== '__order__')?.data).toMatchObject({ sourceTaskId: 'p2-1', summary: '完成总结' });
    const raw = prisma.$queryRaw.bind(prisma) as unknown as RawExec;
    const audits = (await raw`
      SELECT action FROM audit_logs WHERE tenant_id = ${tenantA}::uuid AND action = 'workspace.task.approve' AND resource_id = 'p2-1'
    `) as unknown[];
    expect(audits).toHaveLength(1);
  });

  it('W-08 通讯录：本租户有租户级角色的启用用户，管理排前，跨租户不可见', async () => {
    if (skipIfNoDb()) return;
    const raw = prisma.$queryRaw.bind(prisma) as unknown as RawExec;
    const adminRole = uuid();
    const memberRole = uuid();
    await raw`
      INSERT INTO roles (id, tenant_id, key, name, scope, permissions)
      VALUES (${adminRole}::uuid, ${tenantA}::uuid, 'tenant.admin', '管理员', 'tenant', '[]'::jsonb),
             (${memberRole}::uuid, ${tenantA}::uuid, 'tenant.member', '成员', 'tenant', '[]'::jsonb)
    `;
    await raw`
      INSERT INTO user_roles (id, tenant_id, user_id, role_id)
      VALUES (${uuid()}::uuid, ${tenantA}::uuid, ${userA1}::uuid, ${memberRole}::uuid),
             (${uuid()}::uuid, ${tenantA}::uuid, ${userA2}::uuid, ${adminRole}::uuid)
    `;
    try {
      const dir = (await svc.directory(member(userA1, tenantA))).data.items;
      expect(dir.map((d) => [d.id, d.role])).toEqual([
        [userA2, 'manager'],
        [userA1, 'member'],
      ]);
      expect((await svc.directory(member(userB, tenantB))).data.items).toEqual([]);
    } finally {
      await raw`DELETE FROM user_roles WHERE tenant_id = ${tenantA}::uuid`;
      await raw`DELETE FROM roles WHERE id IN (${adminRole}::uuid, ${memberRole}::uuid)`;
    }
  });
});
