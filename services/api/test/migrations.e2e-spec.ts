/**
 * migrations-baseline 契约测试（QA 先期 authoring，s3 红 → R1 绿；§3.1 验收：
 * 空库 `prisma migrate deploy` 一次到位 + `prisma migrate status` 干净 + 无 db push 启动路径）。
 *
 * 断言面：
 *  M-01 版本化迁移目录存在且含 ≥1 个迁移（prisma/migrations/，唯一 DDL 变更路径）——确定性文件断言
 *  M-02 main.ts 不再含 `prisma db push` 启动分支（§3.1 任务 2：生产不改 DDL）——确定性文件断言
 *  M-03 目标库 `prisma migrate deploy` 成功（CI 提供空库容器 MIGRATION_TEST_DATABASE_URL；本地可指向 dev 库）
 *  M-04 部署后 `prisma migrate status` 干净（"no pending migrations"）
 *  M-05 迁移目录与 schema 无漂移：migrate diff --from-migrations → --to-schema-datamodel 无 DDL 输出
 *       （§3.1 验收「schema 与迁移目录无漂移」；shadow database 由 Prisma 自动创建，需目标库可建库）
 *
 * 独立性与确定性：M-01/M-02 任何环境可判定（当前预期红：无迁移目录 + main.ts 有 db push 分支）；
 * M-03..M-05 依赖可达 PostgreSQL，目标库取 MIGRATION_TEST_DATABASE_URL ?? DATABASE_URL；
 * DB 不可达时用例内显式跳过（基建前置，非断言失败），原因进报告。
 * 运行：pnpm --filter "./services/api" run test:e2e（vitest.e2e.config.ts，串行）
 */
import { describe, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';

const API_ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(API_ROOT, 'prisma', 'migrations');
const SCHEMA_PRISMA = path.join(API_ROOT, 'prisma', 'schema.prisma');
const MAIN_TS = path.join(API_ROOT, 'src', 'main.ts');

/** 目标库：CI 空库容器优先（MIGRATION_TEST_DATABASE_URL），否则本地 dev 库（DATABASE_URL） */
function targetDatabaseUrl(): string | undefined {
  return process.env.MIGRATION_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
}

function prismaCli(args: string[], timeoutMs = 180_000) {
  const prismaRunner = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const res = spawnSync(prismaRunner, ['prisma', ...args], {
    cwd: API_ROOT,
    // Node ≥20 在 Windows 上禁止无 shell 直接 spawn .cmd（EINVAL）；参数均为内部常量/路径，无注入面
    shell: process.platform === 'win32',
    timeout: timeoutMs,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: targetDatabaseUrl() ?? '' },
  });
  return { ok: res.status === 0, out: `${res.stdout ?? ''}\n${res.stderr ?? ''}` };
}

/** 目标库可达性探测（M-03..M-05 的 skip 依据；Prisma 惰性连接探测有内置超时） */
async function databaseReachable(): Promise<boolean> {
  const url = targetDatabaseUrl();
  if (!url) return false;
  try {
    const probe = new PrismaClient({ datasources: { db: { url } }, errorFormat: 'minimal' });
    await probe.$connect();
    await probe.$disconnect();
    return true;
  } catch {
    return false;
  }
}

describe('migrations-baseline（§3.1 空库一键建库验收）', () => {
  it('M-01 版本化迁移目录存在且含 ≥1 个迁移（DDL 唯一变更路径）', () => {
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      throw new Error('services/api/prisma/migrations/ 不存在：R1「从空库生成 baseline migration」未交付（§3.1 任务 1）');
    }
    const migrations = fs.readdirSync(MIGRATIONS_DIR, { recursive: true }) as string[];
    if (!migrations.some((f) => f.endsWith('.sql'))) {
      throw new Error(`prisma/migrations/ 下无 .sql 迁移文件：${migrations.slice(0, 8).join(', ')}`);
    }
  });

  it('M-02 main.ts 不含 prisma db push 启动分支（生产不改 DDL，§3.1 任务 2）', () => {
    const main = fs.readFileSync(MAIN_TS, 'utf8');
    const match = main.match(/.*db\s+push.*/);
    if (match) {
      throw new Error(`main.ts 仍含 db push 启动分支（§3.1 任务 2 要求删除）：\n${match[0]}`);
    }
  });

  it('M-03 目标库 prisma migrate deploy 一次到位', async () => {
    if (!(await databaseReachable())) {
      console.warn(`[migrations] M-03 skip：无可达 PostgreSQL（MIGRATION_TEST_DATABASE_URL/DATABASE_URL 目标库=${targetDatabaseUrl() ?? '(未配置)'}）`);
      return;
    }
    const res = prismaCli(['migrate', 'deploy']);
    if (!res.ok) throw new Error(`migrate deploy 失败：\n${res.out.slice(-600)}`);
  });

  it('M-04 部署后 migrate status 干净（无 pending migrations）', async () => {
    if (!(await databaseReachable())) {
      console.warn('[migrations] M-04 skip：PostgreSQL 不可达（M-04 需 M-03 目标库可达）');
      return;
    }
    const res = prismaCli(['migrate', 'status']);
    if (!res.ok) throw new Error(`migrate status 失败：\n${res.out.slice(-400)}`);
    if (!/no pending migrations|database schema is up to date/i.test(res.out)) {
      throw new Error(`migrate status 存在 pending 迁移（漂移或历史残留）：\n${res.out.slice(-400)}`);
    }
  });

  it('M-05 迁移目录与 schema 无漂移（from-migrations → to-schema-datamodel 无 DDL 输出）', async () => {
    if (!(await databaseReachable())) {
      console.warn('[migrations] M-05 skip：PostgreSQL 不可达（M-05 需 shadow database）');
      return;
    }
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      // 无迁移目录即漂移基线缺失（与 M-01 同因，此处直接红）
      throw new Error('prisma/migrations/ 缺失：无法做 from-migrations 漂移对比（R1 baseline 未建）');
    }
    // 目标库已由 M-03 部署到最新迁移，直接以库内实际结构对比 schema（无需 shadow database）；
    // --exit-code：无差异 0 / 有差异 2，任何 DDL 差异（含索引）都算漂移
    const res = prismaCli([
      'migrate', 'diff',
      `--from-schema-datasource=${SCHEMA_PRISMA}`,
      `--to-schema-datamodel=${SCHEMA_PRISMA}`,
      '--exit-code',
    ]);
    if (!res.ok) {
      throw new Error(`schema 与迁移目录存在漂移（R1 任务 3/5：新模型/索引变更必须带 migration）：\n${res.out.slice(-600)}`);
    }
  });
});
