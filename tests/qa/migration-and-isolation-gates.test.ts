'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const migrationTest = path.join(ROOT, 'services', 'api', 'test', 'migrations.e2e-spec.ts');
const tenantTest = path.join(ROOT, 'services', 'api', 'test', 'tenant-isolation.e2e-spec.ts');
const mainPath = path.join(ROOT, 'services', 'api', 'src', 'main.ts');

function read(filePath) {
  assert.ok(fs.existsSync(filePath), `QA 套件不存在: ${path.relative(ROOT, filePath)}`);
  return fs.readFileSync(filePath, 'utf8');
}

function run() {
  const migrations = read(migrationTest);
  const tenant = read(tenantTest);

  // FR-QA-02：migration baseline 必须验证目录、deploy、status 和 schema drift，不能只验证命令能启动。
  for (const marker of ['M-01', 'M-02', 'M-03', 'M-04', 'M-05', 'migrate deploy', 'migrate status', 'migrate diff']) {
    assert.match(migrations, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `migrations-baseline 缺少断言: ${marker}`);
  }
  assert.doesNotMatch(read(mainPath), /prisma\s+db\s+push/, '应用启动不得把 db push 当作通过路径');

  // FR-QA-03：tenant-isolation 必须包含新模型的跨租户负向探针，而不仅是旧模型 happy path。
  for (const marker of ['T-01', 'T-02', 'T-03', 'T-04', 'T-05', 'ai_proposal_tasks', 'tenantContext']) {
    assert.match(tenant, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `tenant-isolation 缺少断言: ${marker}`);
  }
  assert.match(tenant, /not\.toContain\(projectB\)|toBeNull\(\)/, 'tenant-isolation 必须断言跨租户资源不可见');
  assert.match(tenant, /toBe\(tenantA\)|tenant_id.*tenantA/i, 'tenant-isolation 必须断言写入 tenant_id 来自上下文');

  console.log('migration-and-isolation-gates: FR-QA-02/03 contract assertions passed');
}

run();
