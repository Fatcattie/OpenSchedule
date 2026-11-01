'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const schemaPath = path.join(ROOT, 'services', 'api', 'prisma', 'schema.prisma');
const prismaPath = path.join(ROOT, 'services', 'api', 'src', 'common', 'prisma', 'prisma.service.ts');
const moduleDir = path.join(ROOT, 'services', 'api', 'src', 'modules', 'proposals');

function read(filePath) {
  assert.ok(fs.existsSync(filePath), `契约文件不存在: ${path.relative(ROOT, filePath)}`);
  return fs.readFileSync(filePath, 'utf8');
}

function run() {
  const schema = read(schemaPath);
  const prisma = read(prismaPath);
  const files = fs.existsSync(moduleDir) ? fs.readdirSync(moduleDir).map((name) => path.join(moduleDir, name)) : [];
  const moduleSource = files.filter((filePath) => fs.statSync(filePath).isFile()).map(read).join('\n');

  // FR-SEC-04：模型、tenant_id 数据约束和运行时 allowlist 必须三者同时存在。
  assert.match(schema, /model\s+AiProposalTask\s*\{/, '新模型必须存在');
  const model = schema.match(/model\s+AiProposalTask\s*\{([\s\S]*?)\n\}/m)?.[1] ?? '';
  assert.match(model, /tenantId\s+\S+.*@map\("tenant_id"\)/, '新模型必须有不可空 tenant_id');
  assert.match(model, /@@map\("ai_proposal_tasks"\)/, '新模型必须绑定稳定表名');
  assert.match(prisma, /['"]AiProposalTask['"]/, '新模型必须加入 TENANT_SCOPED_MODELS allowlist');
  assert.match(prisma, /findUnique|findMany|update|delete|upsert/, '租户扩展必须覆盖读取、更新和删除操作');

  assert.ok(moduleSource, '新模型必须有独立模块边界');
  assert.match(moduleSource, /TenantContext|tenantContext|tenantId/, '新模型 service/repository 必须从认证租户上下文取得作用域');
  assert.match(moduleSource, /ai-proposal-tasks|AiProposalTask/, '新模型模块必须暴露与契约一致的资源名');
  assert.doesNotMatch(moduleSource, /body\.tenantId|dto\.tenantId|request\.tenantId/, '调用方不得通过 request body 覆盖认证 tenantId');
  assert.match(moduleSource, /403|TENANT_SCOPE_REQUIRED|TENANT/, '缺失或越权租户上下文必须走拒绝路径');

  console.log('tenant-allowlist: FR-SEC-04 contract assertions passed');
}

run();
