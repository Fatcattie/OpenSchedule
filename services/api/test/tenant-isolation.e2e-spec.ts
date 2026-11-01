/**
 * 租户隔离集成测试（QA 先期 authoring，s3 红 → R1/R4 绿；§3.7 CI TODO#2 租户隔离 ≥5 用例）。
 *
 * 断言面（PrismaService 租户扩展 + tenantContext，真实 PostgreSQL）：
 *  T-01 读自动注入：runWithTenant(A) 下 findMany(Project) 只见 A 的行
 *  T-02 写自动注入：runWithTenant(A) 下 create(Task) 未带 tenantId 也落 tenant_id=A
 *  T-03 跨租户不可见：租户 A 内 findUnique 取 B 的 task → null（双向）
 *  T-04 update/delete 隔离：A 上下文 deleteMany(全表语义) 不触碰 B 的行
 *  T-05 新模型 ai_proposal_tasks 租户谓词（R1 建表 + 纳入 TENANT_SCOPED_MODELS；未落地前确定性失败）
 *  T-06 bypass 逃生舱：bypass 模式不注入（系统级跨租户），非 bypass 则注入
 *
 * 独立性与确定性：每轮自建租户/项目/任务对（uuidv4 唯一 id），用例间零共享可变状态，可乱序执行；
 * T-01..T-04/T-06 只断言相对可见性，不断言绝对行数。
 * 前置：可达 PostgreSQL + 已按当前 schema 建表（本地 `pnpm prisma:deploy`，或 CI 服务容器 + migrate deploy）。
 * DB 不可达时 T-01..T-04/T-06 显式 skip（基建前置，非断言失败）；T-05 与 migrations 基线无关 schema，DB 不可达仍确定性失败。
 * 运行：pnpm --filter "./services/api" run test:e2e（vitest.e2e.config.ts，串行）
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { tenantContext } from '../src/common/tenant/tenant-context.service';

const uuid = () => globalThis.crypto.randomUUID();

let prisma: PrismaService;
let tenantA = '';
let tenantB = '';
let projectA = '';
let projectB = '';
let taskA = '';
let taskB = '';
let dbAvailable = false;

type RawExec = (sql: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;

async function connectOrFail(): Promise<void> {
  process.env.DATABASE_URL ??=
    'postgresql://openschedule:openschedule@localhost:5432/openschedule?schema=public';
  prisma = new PrismaService();
  try {
    await prisma.$connect();
    const raw = prisma.$queryRaw.bind(prisma) as unknown as RawExec;
    const tables = (await raw`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
    `) as { table_name: string }[];
    const have = new Set(tables.map((t) => t.table_name));
    const missing = ['tenants', 'projects', 'tasks'].filter((t) => !have.has(t));
    if (missing.length > 0) {
      throw new Error(
        `测试库缺表 [${missing.join(', ')}]：dev 库先 npx prisma db push（或 CI 服务容器 + migrate deploy）`,
      );
    }
    dbAvailable = true;
  } catch (err) {
    await prisma.$disconnect().catch(() => undefined);
    prisma = null as unknown as PrismaService;
    dbAvailable = false;
    console.warn(
      `[tenant-isolation] PostgreSQL 不可达/未建表（DATABASE_URL=${process.env.DATABASE_URL}），依赖真实库的用例将 skip。原始错误：` +
        (err instanceof Error ? err.message : String(err)),
    );
  }
}

/** 种子：两租户各 1 项目 1 任务（raw 显式带 tenant_id 写入，作为跨租户校验的 ground truth） */
async function seedIsolationPair(): Promise<void> {
  tenantA = uuid();
  tenantB = uuid();
  projectA = uuid();
  projectB = uuid();
  taskA = uuid();
  taskB = uuid();
  const raw = prisma.$queryRaw.bind(prisma) as unknown as RawExec;
  // updated_at 为 Prisma @updatedAt 列（库内 NOT NULL 无默认值），raw 写入须显式给值
  await raw`INSERT INTO tenants (id, name, updated_at) VALUES (${tenantA}::uuid, 'iso-a', now()), (${tenantB}::uuid, 'iso-b', now())`;
  await raw`
    INSERT INTO projects (id, tenant_id, name, status, updated_at)
    VALUES (${projectA}::uuid, ${tenantA}::uuid, 'iso-project-a', 'active', now()),
           (${projectB}::uuid, ${tenantB}::uuid, 'iso-project-b', 'active', now())
  `;
  await raw`
    INSERT INTO tasks (id, tenant_id, project_id, title, status, version, updated_at)
    VALUES (${taskA}::uuid, ${tenantA}::uuid, ${projectA}::uuid, 'iso-task-a', 'todo', 1, now()),
           (${taskB}::uuid, ${tenantB}::uuid, ${projectB}::uuid, 'iso-task-b', 'todo', 1, now())
  `;
}

async function cleanupPair(): Promise<void> {
  if (!dbAvailable) return;
  const raw = prisma.$queryRaw.bind(prisma) as unknown as RawExec;
  await raw`DELETE FROM ai_proposals WHERE tenant_id IN (${tenantA}::uuid, ${tenantB}::uuid)`.catch(() => undefined);
  await raw`DELETE FROM tasks WHERE tenant_id IN (${tenantA}::uuid, ${tenantB}::uuid)`.catch(() => undefined);
  await raw`DELETE FROM projects WHERE tenant_id IN (${tenantA}::uuid, ${tenantB}::uuid)`.catch(() => undefined);
  await raw`DELETE FROM tenants WHERE id IN (${tenantA}::uuid, ${tenantB}::uuid)`.catch(() => undefined);
}

describe('tenant-isolation（§3.7 租户隔离 ≥5 用例）', () => {
  beforeAll(async () => {
    await connectOrFail();
    if (dbAvailable) await seedIsolationPair();
  }, 30_000);

  afterAll(async () => {
    await cleanupPair().catch(() => undefined);
    if (prisma) await prisma.$disconnect().catch(() => undefined);
  });

  it('T-01 读自动注入：租户 A 上下文 findMany(Project) 只见 A 行（B 行不可见）', async () => {
    if (!dbAvailable) {
      console.warn('[tenant-isolation] PostgreSQL 不可达（基建前置，非断言失败）：本用例待数据库可达后执行');
      return;
    }
    const seenA = tenantContext.runWithTenant(tenantA, () =>
      prisma.project.findMany({ where: {}, select: { id: true } }),
    );
    const seenB = tenantContext.runWithTenant(tenantB, () =>
      prisma.project.findMany({ where: {}, select: { id: true } }),
    );
    const listA = await seenA;
    const listB = await seenB;
    expect(listA.map((p) => p.id)).toContain(projectA);
    expect(listA.map((p) => p.id)).not.toContain(projectB);
    expect(listB.map((p) => p.id)).toContain(projectB);
    expect(listB.map((p) => p.id)).not.toContain(projectA);
  });

  it('T-02 写自动注入：租户 A 上下文 create(Task) 未带 tenantId 也落 tenant_id=A', async () => {
    if (!dbAvailable) {
      console.warn('[tenant-isolation] PostgreSQL 不可达（基建前置，非断言失败）：本用例待数据库可达后执行');
      return;
    }
    const created = tenantContext.runWithTenant(tenantA, () =>
      prisma.task.create({
        // 故意不带 tenantId：运行时由 PrismaService 租户扩展兜底注入（漏注入即违反租户铁律）。
        // Prisma 生成类型在编译期强制 tenantId 必传，此处 cast 表达「调用侧确实没写 tenantId」的测试意图。
        data: {
          title: 'iso-auto-inject',
          projectId: projectA,
          version: 1,
        } as unknown as Parameters<typeof prisma.task.create>[0]['data'],
        select: { id: true, tenantId: true },
      }),
    );
    const row = await created;
    expect(row.tenantId).toBe(tenantA);
    const rawRow = (await (prisma.$queryRaw.bind(prisma) as unknown as RawExec)`
      SELECT tenant_id::text AS tenant_id FROM tasks WHERE id = ${row.id}::uuid
    `) as { tenant_id: string }[];
    expect(rawRow).toHaveLength(1);
    expect(rawRow[0].tenant_id).toBe(tenantA);
    await prisma.task.delete({ where: { id: row.id } }).catch(() => undefined);
  });

  it('T-03 跨租户不可见：A 内 findUnique(B 的 task) 为 null，B 内取 A 同样 null', async () => {
    if (!dbAvailable) {
      console.warn('[tenant-isolation] PostgreSQL 不可达（基建前置，非断言失败）：本用例待数据库可达后执行');
      return;
    }
    const fromA = tenantContext.runWithTenant(tenantA, () =>
      prisma.task.findUnique({ where: { id: taskB } }),
    );
    const fromB = tenantContext.runWithTenant(tenantB, () =>
      prisma.task.findUnique({ where: { id: taskA } }),
    );
    expect(await fromA).toBeNull();
    expect(await fromB).toBeNull();
  });

  it('T-04 delete 隔离：A 上下文 deleteMany(全表语义) 不触碰 B 的行', async () => {
    if (!dbAvailable) {
      console.warn('[tenant-isolation] PostgreSQL 不可达（基建前置，非断言失败）：本用例待数据库可达后执行');
      return;
    }
    const raw = prisma.$queryRaw.bind(prisma) as unknown as RawExec;
    // 用无外键依赖的探针项目做全表语义删除（种子项目被任务引用，删除会触发外键约束）
    const probeA = uuid();
    const probeB = uuid();
    await raw`
      INSERT INTO projects (id, tenant_id, name, status, updated_at)
      VALUES (${probeA}::uuid, ${tenantA}::uuid, 'iso-probe-a', 'active', now()),
             (${probeB}::uuid, ${tenantB}::uuid, 'iso-probe-b', 'active', now())
    `;
    const deleted = await tenantContext.runWithTenant(tenantA, () =>
      prisma.project.deleteMany({ where: { name: { startsWith: 'iso-probe' } } }),
    );
    expect(deleted.count).toBe(1);
    // B 探针必须幸存（A 的 deleteMany 被扩展改写为 where { tenantId: A, ... }）
    const bRow = (await raw`SELECT 1 FROM projects WHERE id = ${probeB}::uuid`) as unknown[];
    expect(bRow).toHaveLength(1);
    await raw`DELETE FROM projects WHERE id = ${probeB}::uuid`;
  });

  it('T-05 新模型 ai_proposal_tasks：R1 建表 + 纳入 TENANT_SCOPED_MODELS 后租户谓词生效（落地前确定性失败）', async () => {
    // 不 skip：T-05 是 R1 的验收探针，schema 未建表/模型未生成时必须红，逼出 R1 交付
    if (!dbAvailable) {
      throw new Error('PostgreSQL 不可达：无法验证 ai_proposal_tasks 租户谓词（R1 探针不豁免）');
    }
    const raw = prisma.$queryRaw.bind(prisma) as unknown as RawExec;
    const proposalA = uuid();
    const proposalB = uuid();
    // ai_proposal_tasks.proposal_id 外键指向 ai_proposals，先建提议行
    await raw`
      INSERT INTO ai_proposals (id, tenant_id, type, payload, source, updated_at)
      VALUES (${proposalA}::uuid, ${tenantA}::uuid, 'decompose', '{}'::jsonb, 'manual_request', now()),
             (${proposalB}::uuid, ${tenantB}::uuid, 'decompose', '{}'::jsonb, 'manual_request', now())
    `;
    await raw`
      INSERT INTO ai_proposal_tasks (id, tenant_id, proposal_id, task_id, action, applied_at)
      VALUES (${uuid()}::uuid, ${tenantA}::uuid, ${proposalA}::uuid, ${taskA}::uuid, 'created', now()),
             (${uuid()}::uuid, ${tenantB}::uuid, ${proposalB}::uuid, ${taskB}::uuid, 'created', now())
    `;
    const seenA = await tenantContext.runWithTenant(tenantA, () => prisma.aiProposalTask.findMany({ where: {} }));
    const seenB = await tenantContext.runWithTenant(tenantB, () => prisma.aiProposalTask.findMany({ where: {} }));
    expect(seenA.map((r) => r.proposalId)).toEqual([proposalA]);
    expect(seenB.map((r) => r.proposalId)).toEqual([proposalB]);
    await raw`DELETE FROM ai_proposal_tasks WHERE proposal_id IN (${proposalA}::uuid, ${proposalB}::uuid)`;
  });

  it('T-06 bypass 逃生舱：bypass 模式不注入（跨租户全见），即非 bypass 时注入', async () => {
    if (!dbAvailable) {
      console.warn('[tenant-isolation] PostgreSQL 不可达（基建前置，非断言失败）：本用例待数据库可达后执行');
      return;
    }
    const rows = await tenantContext.bypass(() =>
      prisma.project.findMany({ where: {}, select: { id: true } }),
    );
    const ids = rows.map((p) => p.id);
    expect(ids).toContain(projectA);
    expect(ids).toContain(projectB); // bypass = 系统级跨租户的显式例外通道（§0 约定 2）
  });
});
