'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const rootPackagePath = path.join(ROOT, 'package.json');
const workflowPath = path.join(ROOT, '.github', 'workflows', 'ci.yml');
const auditScriptPath = path.join(ROOT, 'scripts', 'audit-deployable.mjs');

function read(filePath) {
  assert.ok(fs.existsSync(filePath), `QA 门禁文件不存在: ${path.relative(ROOT, filePath)}`);
  return fs.readFileSync(filePath, 'utf8');
}

function run() {
  const packageJson = JSON.parse(read(rootPackagePath));
  const workflow = read(workflowPath);
  const auditScript = read(auditScriptPath);
  const scripts = packageJson.scripts ?? {};

  // FR-QA-01：标准入口必须是真实 pnpm 命令，不能以 passWithNoTests 或占位脚本冒充绿色。
  assert.match(String(scripts.lint), /pnpm\s+--filter.*typecheck|pnpm\s+lint/, '根 lint 脚本必须执行真实类型/代码检查');
  assert.match(String(scripts.test), /pnpm\s+--filter.*test|pnpm\s+test/, '根 test 脚本必须执行真实测试套件');

  // FR-QA-04：CI job 必须阻断合并；四类证据必须在同一 workflow 中可追溯。
  // 标记与流水线真实调用保持一致（API/Web 覆盖率门禁、真实库 e2e 承载 tenant-isolation）。
  for (const marker of [
    'jobs:',
    'lint:',
    'test:',
    'migration:',
    'pnpm lint',
    'pnpm --filter "./services/api" run test:cov',
    'pnpm --filter "./apps/web" run test:cov',
    'pnpm --filter "./services/api" run test:e2e',
    'prisma migrate deploy',
  ]) {
    assert.match(workflow, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `CI 缺少门禁: ${marker}`);
  }
  assert.doesNotMatch(workflow, /continue-on-error\s*:\s*true/, '安全与质量门禁不得允许失败');
  assert.doesNotMatch(workflow, /if:\s*\$\$\(.*failure\(\)/, '门禁不得在失败后以条件表达式继续通过');
  assert.match(workflow, /migrate\s+status/, 'CI 必须检查迁移状态无 pending');
  assert.match(workflow, /migrate\s+diff/, 'CI 必须检查 schema/migration drift');

  // 依赖审计门槛必须为 high，且按可交付范围（services/api · apps/web · packages/*）收敛。
  assert.match(workflow, /node scripts\/audit-deployable\.mjs --audit-level high/, 'CI 依赖审计必须走可交付范围脚本且门槛 high');
  assert.doesNotMatch(workflow, /--audit-level critical/, '依赖审计门槛不得停留在 critical');
  for (const scope of ['services/api', 'apps/web', 'packages/']) {
    assert.ok(auditScript.includes(scope), `审计脚本必须纳入可交付范围: ${scope}`);
  }
  assert.match(auditScript, /apps\/mobile/, '审计脚本必须显式声明 apps/mobile 为范围外并记录接受风险');

  // 主流程冒烟必须作为可执行入口存在（本地/发布前手动门禁，栈未进 CI）。
  assert.match(String(scripts.smoke), /qa-e2e\/smoke\.mjs/, '根 smoke 脚本必须驱动 qa-e2e/smoke.mjs');
  assert.ok(fs.existsSync(path.join(ROOT, 'qa-e2e', 'smoke.mjs')), '主流程冒烟脚本必须存在');

  console.log('ci-gate: FR-QA-01/04 contract assertions passed');
}

run();
