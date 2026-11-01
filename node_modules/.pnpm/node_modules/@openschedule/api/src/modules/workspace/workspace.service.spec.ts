/**
 * WorkspaceService（D-07 一期）：集合白名单、租户/属主隔离、viewer 只读、条目级乐观锁与整批回滚。
 * 内存版 Prisma 假实现（$transaction 失败时恢复快照，模拟事务回滚）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceService } from './workspace.service';
import { canWriteShared, collectionScope, jsonByteLength, MAX_ITEM_BYTES } from './workspace-collections';
import type { AuthUser } from '../../common/auth/auth-user.interface';

interface Row {
  id: string;
  tenantId: string;
  collection: string;
  ownerKey: string;
  itemKey: string;
  data: unknown;
  version: number;
  createdAt: Date;
}

type Where = Partial<Record<'tenantId' | 'collection' | 'ownerKey' | 'itemKey' | 'version', unknown>>;

function createFakePrisma() {
  let rows: Row[] = [];
  let seq = 0;
  const match = (r: Row, w: Where) =>
    (Object.keys(w) as (keyof Where)[]).every((k) => {
      const cond = w[k];
      if (cond && typeof cond === 'object' && 'in' in (cond as object)) return (cond as { in: unknown[] }).in.includes(r[k]);
      return r[k] === cond;
    });
  const workspaceItem = {
    findMany: vi.fn(async ({ where }: { where: Where }) =>
      rows
        .filter((r) => match(r, where))
        .map((r) => ({ itemKey: r.itemKey, data: structuredClone(r.data), version: r.version })),
    ),
    findFirst: vi.fn(async ({ where }: { where: Where }) => rows.find((r) => match(r, where)) ?? null),
    create: vi.fn(async ({ data }: { data: Omit<Row, 'id' | 'createdAt'> }) => {
      const row = { ...data, id: `id-${++seq}`, createdAt: new Date() } as Row;
      rows.push(row);
      return row;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Where; data: { data: unknown } }) => {
      const hit = rows.filter((r) => match(r, where));
      hit.forEach((r) => {
        r.data = data.data;
        r.version += 1;
      });
      return { count: hit.length };
    }),
    deleteMany: vi.fn(async ({ where }: { where: Where }) => {
      const before = rows.length;
      rows = rows.filter((r) => !match(r, where));
      return { count: before - rows.length };
    }),
  };
  const prisma = {
    workspaceItem,
    user: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({ displayName: `name-${where.id}` })) },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const snapshot = rows.map((r) => ({ ...r }));
      try {
        return await fn({ workspaceItem });
      } catch (err) {
        rows = snapshot;
        throw err;
      }
    }),
  };
  return { prisma, rows: () => rows };
}

const member = (userId = 'u-1', tenantId = 't-1'): AuthUser => ({
  userId,
  tenantId,
  roles: [{ key: 'tenant.member', scope: 'tenant', scopeResourceId: null }],
});
const admin = (userId = 'u-admin', tenantId = 't-1'): AuthUser => ({
  userId,
  tenantId,
  roles: [{ key: 'tenant.admin', scope: 'tenant', scopeResourceId: null }],
});
const viewer: AuthUser ={ userId: 'u-v', tenantId: 't-1', roles: [{ key: 'tenant.viewer', scope: 'tenant', scopeResourceId: null }] };

describe('workspace-collections', () => {
  it('白名单：tasks 共享、reminders 私有、未知集合 null（含原型链键）', () => {
    expect(collectionScope('tasks')).toBe('tenant');
    expect(collectionScope('reminders')).toBe('user');
    expect(collectionScope('unknown')).toBeNull();
    expect(collectionScope('constructor')).toBeNull();
  });

  it('共享写权限：member/admin/owner 可写，纯 viewer 不可写', () => {
    expect(canWriteShared(member())).toBe(true);
    expect(canWriteShared(viewer)).toBe(false);
  });

  it('体积按 UTF-8 字节计', () => {
    expect(jsonByteLength('中')).toBe(5); // "中" 带引号：1 + 3 + 1
  });
});

describe('WorkspaceService', () => {
  let fake: ReturnType<typeof createFakePrisma>;
  let audit: { record: ReturnType<typeof vi.fn> };
  let svc: WorkspaceService;

  beforeEach(() => {
    fake = createFakePrisma();
    audit = { record: vi.fn(async () => undefined) };
    svc = new WorkspaceService(fake.prisma as never, audit as never);
  });

  it('新建后可读回，版本从 1 起；整批一条审计且只记键名', async () => {
    const res = await svc.applyBatch(member(), 'experience', { upserts: [{ key: 'task-1', data: { id: 'task-1', title: 'A' } }] });
    expect(res.data.items).toEqual([{ key: 'task-1', version: 1 }]);
    const list = await svc.list(member('u-2'), 'experience');
    expect(list.data.items).toEqual([{ key: 'task-1', data: { id: 'task-1', title: 'A' }, version: 1 }]);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record.mock.calls[0][0].after).toEqual({ scope: 'tenant', upserted: ['task-1'], deleted: [] });
  });

  it('按 baseVersion 覆盖：匹配则 +1，不匹配 40901', async () => {
    await svc.applyBatch(member(), 'experience', { upserts: [{ key: 'k', data: 1 }] });
    const ok = await svc.applyBatch(member(), 'experience', { upserts: [{ key: 'k', data: 2, baseVersion: 1 }] });
    expect(ok.data.items[0].version).toBe(2);
    await expect(svc.applyBatch(member(), 'experience', { upserts: [{ key: 'k', data: 3, baseVersion: 1 }] })).rejects.toMatchObject({
      response: { code: 40901 },
    });
  });

  it('新建已存在的键 → 40901', async () => {
    await svc.applyBatch(member(), 'experience', { upserts: [{ key: 'k', data: 1 }] });
    await expect(svc.applyBatch(member('u-2'), 'experience', { upserts: [{ key: 'k', data: 1 }] })).rejects.toMatchObject({
      response: { code: 40901 },
    });
  });

  it('批内任一冲突 → 整批回滚（前面的写入不落库）', async () => {
    await svc.applyBatch(member(), 'experience', { upserts: [{ key: 'k', data: 1 }] });
    await expect(
      svc.applyBatch(member(), 'experience', {
        upserts: [
          { key: 'new', data: 'x' },
          { key: 'k', data: 2, baseVersion: 9 },
        ],
      }),
    ).rejects.toMatchObject({ response: { code: 40901 } });
    expect(fake.rows().map((r) => r.itemKey)).toEqual(['k']);
  });

  it('删除：版本匹配删除；已不存在视为成功；版本不匹配 40901', async () => {
    await svc.applyBatch(member(), 'experience', { upserts: [{ key: 'a', data: 1 }, { key: 'b', data: 1 }] });
    const res = await svc.applyBatch(member(), 'experience', { deletes: [{ key: 'a', baseVersion: 1 }, { key: 'gone', baseVersion: 1 }] });
    expect(res.data.deleted).toEqual(['a', 'gone']);
    await expect(svc.applyBatch(member(), 'experience', { deletes: [{ key: 'b', baseVersion: 5 }] })).rejects.toMatchObject({
      response: { code: 40901 },
    });
  });

  it('私有集合按属主隔离：他人读不到', async () => {
    await svc.applyBatch(member('u-1'), 'reminders', { upserts: [{ key: 'r1', data: { content: 'x' } }] });
    expect((await svc.list(member('u-1'), 'reminders')).data.items).toHaveLength(1);
    expect((await svc.list(member('u-2'), 'reminders')).data.items).toHaveLength(0);
  });

  it('租户隔离：其他租户读不到共享集合', async () => {
    await svc.applyBatch(member('u-1', 't-1'), 'experience', { upserts: [{ key: 'k', data: 1 }] });
    expect((await svc.list(member('u-9', 't-2'), 'experience')).data.items).toHaveLength(0);
  });

  it('viewer：共享集合写 40301，私有集合可写', async () => {
    await expect(svc.applyBatch(viewer, 'experience', { upserts: [{ key: 'k', data: 1 }] })).rejects.toMatchObject({
      response: { code: 40301 },
    });
    await expect(svc.applyBatch(viewer, 'os_mood_v1', { upserts: [{ key: '__value__', data: [] }] })).resolves.toBeDefined();
  });

  it('未知集合 → 40401', async () => {
    await expect(svc.list(member(), 'secrets')).rejects.toMatchObject({ response: { code: 40401 } });
  });

  it('批次校验：空批 / 批内重复键 / 超体积 → 40001', async () => {
    await expect(svc.applyBatch(member(), 'experience', {})).rejects.toMatchObject({ response: { code: 40001 } });
    await expect(
      svc.applyBatch(member(), 'experience', { upserts: [{ key: 'k', data: 1 }], deletes: [{ key: 'k', baseVersion: 1 }] }),
    ).rejects.toMatchObject({ response: { code: 40001 } });
    const big = 'x'.repeat(MAX_ITEM_BYTES);
    await expect(svc.applyBatch(member(), 'experience', { upserts: [{ key: 'k', data: big }] })).rejects.toMatchObject({
      response: { code: 40001 },
    });
  });
});

describe('WorkspaceService · 工作台任务（D-07 二期：写入守卫 + 审核命令）', () => {
  let fake: ReturnType<typeof createFakePrisma>;
  let audit: { record: ReturnType<typeof vi.fn> };
  let svc: WorkspaceService;

  const task = (over: Record<string, unknown> = {}) => ({
    id: 't-1',
    kind: 'task',
    title: '任务',
    status: 'todo',
    createdBy: 'u-1',
    assigneeId: null,
    approvalStatus: 'none',
    approvalType: null,
    proposalStatus: 'none',
    auditLogs: [],
    executionLogs: [],
    comments: [],
    ...over,
  });
  const read = async (key: string) =>
    (await svc.list(admin(), 'tasks')).data.items.find((i) => i.key === key) as { data: Record<string, unknown>; version: number } | undefined;

  beforeEach(() => {
    fake = createFakePrisma();
    audit = { record: vi.fn(async () => undefined) };
    svc = new WorkspaceService(fake.prisma as never, audit as never);
  });

  it('成员提交待审 → 允许；成员把自己的待审写成 approved → 40301', async () => {
    await svc.applyBatch(member('u-1'), 'tasks', { upserts: [{ key: 't-1', data: task() }] });
    await svc.applyBatch(member('u-1'), 'tasks', {
      upserts: [{ key: 't-1', data: task({ approvalStatus: 'pending', approvalType: 'completion', completion: { completedAt: '2026-10-18 10:00' } }), baseVersion: 1 }],
    });
    await expect(
      svc.applyBatch(member('u-1'), 'tasks', {
        upserts: [{ key: 't-1', data: task({ approvalStatus: 'approved', status: 'done' }), baseVersion: 2 }],
      }),
    ).rejects.toMatchObject({ response: { code: 40301 } });
  });

  it('成员伪造创建人 / 篡改审核留痕 / 直接删他人任务 → 40301；管理员批量写也不能改留痕', async () => {
    await expect(
      svc.applyBatch(member('u-1'), 'tasks', { upserts: [{ key: 't-1', data: task({ createdBy: 'u-boss' }) }] }),
    ).rejects.toMatchObject({ response: { code: 40301 } });
    await svc.applyBatch(member('u-2'), 'tasks', { upserts: [{ key: 't-1', data: task({ createdBy: 'u-2' }) }] });
    await expect(svc.applyBatch(member('u-1'), 'tasks', { deletes: [{ key: 't-1', baseVersion: 1 }] })).rejects.toMatchObject({
      response: { code: 40301 },
    });
    const forged = [{ id: 'a', taskId: 't-1', action: 'approve', opinion: 'agree', reason: '', operatorId: 'u-admin', operatorName: 'x', createdAt: '' }];
    await expect(
      svc.applyBatch(admin(), 'tasks', { upserts: [{ key: 't-1', data: task({ createdBy: 'u-2', auditLogs: forged }), baseVersion: 1 }] }),
    ).rejects.toMatchObject({ response: { code: 40301 } });
  });

  it('tasks 集合禁止整值写入（绕过逐条守卫）', async () => {
    await expect(svc.applyBatch(admin(), 'tasks', { upserts: [{ key: '__value__', data: [] }] })).rejects.toMatchObject({
      response: { code: 40301 },
    });
  });

  it('审核命令：管理通过完成提报 → 任务完成 + 服务端留痕 + SOP 沉淀；成员无权审核', async () => {
    await svc.applyBatch(member('u-1'), 'tasks', {
      upserts: [
        { key: '__order__', data: ['t-1'] },
        {
          key: 't-1',
          data: task({
            sop: { steps: [{ id: 's1', title: '步骤一', children: [] }], source: 'manual', updatedAt: '' },
            approvalStatus: 'pending',
            approvalType: 'completion',
            completion: { completedAt: '2026-10-18 10:00', summary: '总结' },
          }),
        },
      ],
    });
    await expect(svc.reviewTask(member('u-2'), 't-1', { action: 'approve', opinion: 'agree' })).rejects.toMatchObject({
      response: { code: 40301 },
    });
    const res = await svc.reviewTask(admin(), 't-1', { action: 'approve', opinion: 'agree', reason: '好' });
    expect(res.data).toMatchObject({ approvalStatus: 'approved', sopArchived: true });
    const t = (await read('t-1'))!.data;
    expect(t.status).toBe('done');
    expect(t.completedAt).toBe('2026-10-18T02:00:00.000Z');
    expect((t.auditLogs as { operatorId: string; operatorName: string }[])[0]).toMatchObject({ operatorId: 'u-admin', operatorName: 'name-u-admin' });
    const sops = (await svc.list(admin(), 'sops')).data.items;
    expect(sops.find((i) => i.key === '__order__')?.data).toHaveLength(1);
    expect(audit.record).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'workspace.task.approve', resourceId: 't-1' }), expect.anything());
  });

  it('审核命令：提报人撤回自己的完成提报 → 回到执行中；非提报成员撤回 → 40301；无待审 → 40902', async () => {
    await svc.applyBatch(member('u-1'), 'tasks', {
      upserts: [{ key: 't-1', data: task({ status: 'in_progress', approvalStatus: 'pending', approvalType: 'completion', completion: { completedAt: '2026-10-18 10:00' } }) }],
    });
    await expect(svc.reviewTask(member('u-2'), 't-1', { action: 'withdraw', opinion: 'other', reason: '撤' })).rejects.toMatchObject({
      response: { code: 40301 },
    });
    await svc.reviewTask(member('u-1'), 't-1', { action: 'withdraw', opinion: 'other', reason: '再改改' });
    const t = (await read('t-1'))!.data;
    expect(t).toMatchObject({ approvalStatus: 'none', status: 'in_progress', completion: null });
    await expect(svc.reviewTask(admin(), 't-1', { action: 'approve', opinion: 'agree' })).rejects.toMatchObject({
      response: { code: 40902 },
    });
  });

  it('审核命令：删除申请通过 → 连同子孙删除、顺序表同步、父级 SOP 移除同名步骤', async () => {
    const parent = task({ id: 'p', title: '父', sop: { steps: [{ id: 'a', title: '子', children: [] }, { id: 'b', title: '留', children: [] }], source: 'manual', updatedAt: '' } });
    const child = task({ id: 'c', parentId: 'p', title: '子', approvalStatus: 'pending', pendingDelete: true });
    const grandchild = task({ id: 'g', parentId: 'c', title: '孙' });
    await svc.applyBatch(admin(), 'tasks', {
      upserts: [
        { key: '__order__', data: ['p', 'c', 'g'] },
        { key: 'p', data: { ...parent, createdBy: 'u-admin' } },
        { key: 'c', data: { ...child, createdBy: 'u-admin' } },
        { key: 'g', data: { ...grandchild, createdBy: 'u-admin' } },
      ],
    });
    await svc.reviewTask(admin(), 'c', { action: 'approve', opinion: 'agree' });
    const items = (await svc.list(admin(), 'tasks')).data.items;
    expect(items.map((i) => i.key).sort()).toEqual(['__order__', 'p']);
    expect(items.find((i) => i.key === '__order__')?.data).toEqual(['p']);
    expect(((await read('p'))!.data.sop as { steps: { title: string }[] }).steps.map((s) => s.title)).toEqual(['留']);
  });
});
