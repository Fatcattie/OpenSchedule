'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'services', 'api', 'src');

function read(relPath) {
  const p = path.join(SRC, relPath);
  assert.ok(fs.existsSync(p), `源码文件不存在: ${relPath}`);
  return fs.readFileSync(p, 'utf8');
}

function run() {
  // FR-SEC-05：§3.3 审计完备性——写路径必须落 audit_logs（重点：proposals/automation/api-keys/webhooks/calendar）。
  // proposals.apply 的审计必须与业务写同事务（INV-6 原子性）。
  const proposals = read('modules/proposals/proposals.service.ts');
  assert.match(proposals, /ai_proposal\.create/, 'proposals.createDecompose 必须审计 ai_proposal.create');
  assert.match(proposals, /ai_proposal\.reject/, 'proposals.reject 必须审计 ai_proposal.reject');
  assert.match(proposals, /ai_proposal\.apply[\s\S]{0,800}?tx,?\s*\)/, 'proposals.apply 审计必须在事务内（传 tx）');

  const automation = read('modules/automation/automation.service.ts');
  for (const action of ['automation.rule.create', 'automation.rule.update', 'automation.rule.delete', 'automation.rule.toggle']) {
    assert.match(automation, new RegExp(`action: '${action}'`), `automation 必须审计 ${action}`);
  }

  const apiKeys = read('modules/api-keys/api-keys.service.ts');
  assert.match(apiKeys, /action: 'api_key\.create'/, 'api-keys.create 必须审计');
  assert.match(apiKeys, /action: 'api_key\.revoke'/, 'api-keys.revoke 必须审计');

  const webhooks = read('modules/webhooks/webhooks.service.ts');
  for (const action of ['webhook.create', 'webhook.update', 'webhook.remove', 'webhook.toggle']) {
    assert.match(webhooks, new RegExp(`'${action}'`), `webhooks 必须审计 ${action}`);
  }

  const calendar = read('modules/calendar/calendar.service.ts');
  assert.match(calendar, /'calendar\.account\.bind'/, 'calendar.bindAccount 必须审计');
  assert.match(calendar, /'calendar\.account\.unbind'/, 'calendar.unbindAccount 必须审计');

  // 审计面不得泄露敏感值：webhooks/calendar 的 after 不含 secret/token 明文或密文
  assert.doesNotMatch(webhooks, /after: [^{]*secret/i, 'webhook 审计不得写 secret');
  assert.doesNotMatch(calendar, /after: [^{]*accessToken/i, 'calendar 审计不得写 accessToken 明文');

  console.log('audit-coverage: FR-SEC-05 contract assertions passed');
}

run();