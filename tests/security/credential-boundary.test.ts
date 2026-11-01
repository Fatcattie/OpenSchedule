'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const schemaPath = path.join(ROOT, 'services', 'api', 'prisma', 'schema.prisma');

function read(relPath) {
  const p = path.join(ROOT, relPath);
  assert.ok(fs.existsSync(p), `契约文件不存在: ${relPath}`);
  return fs.readFileSync(p, 'utf8');
}

function modelBlock(schema, modelName) {
  const match = schema.match(new RegExp(`model\\s+${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
  assert.ok(match, `schema.prisma 必须声明 ${modelName} 模型`);
  return match[1];
}

function run() {
  const schema = read('services/api/prisma/schema.prisma');

  // FR-SEC-01（列内字段加密方案）：敏感凭据列必须已带密钥版本列（密钥轮换支撑），
  // 而不是用名为 secret/accessToken 的明文字段把安全责任留给调用方。
  const webhook = modelBlock(schema, 'Webhook');
  assert.match(webhook, /secret\s+String\s+@db\.VarChar\(512\)/, 'Webhook 必须有 secret 列（密文列）');
  assert.match(webhook, /secretKeyVersion\s+Int\s+@default\(1\)\s+@map\("secret_key_version"\)/, 'Webhook 必须有 secret_key_version（密钥轮换）');
  assert.match(webhook, /AES-256|ENCRYPTION_KEY|密文/, 'Webhook.secret 注释必须声明密文/ENCRYPTION_KEY 契约');

  const calendar = modelBlock(schema, 'CalendarAccount');
  assert.match(calendar, /accessToken\s+String\s+@map\("access_token"\)/, 'CalendarAccount 必须有 accessToken 列');
  assert.match(calendar, /tokenKeyVersion\s+Int\s+@default\(1\)\s+@map\("token_key_version"\)/, 'CalendarAccount 必须有 token_key_version（密钥轮换）');

  // 加密边界：common/security/credential-cipher.ts 提供 encrypt/decrypt，AES-256-GCM，不打印明文
  const cipher = read('services/api/src/common/security/credential-cipher.ts');
  assert.match(cipher, /aes-256-gcm/i, '凭据加密必须用 AES-256-GCM');
  assert.match(cipher, /ENCRYPTION_KEY/, '密钥必须来自 ENCRYPTION_KEY');
  assert.match(cipher, /encrypt\s*\(/, '必须提供 encrypt 边界');
  assert.match(cipher, /decrypt\s*\(/, '必须提供 decrypt 边界');
  assert.doesNotMatch(cipher, /console\.(log|error|warn)[^\n]*plaintext|console\.(log|error|warn)[^\n]*secret/i, '加密边界不得打印敏感值');

  // 写路径必须经过 cipher（明文不落库）：webhooks 创建/校验、calendar 绑定/读取
  const webhooksSvc = read('services/api/src/modules/webhooks/webhooks.service.ts');
  assert.match(webhooksSvc, /cipher\.encrypt\(/, 'webhooks 必须加密 secret 后落库');
  assert.match(webhooksSvc, /cipher\.decrypt\(/, 'webhooks 取用时必须解密');
  assert.doesNotMatch(webhooksSvc, /signingSecret: secret(?!Plain)/, 'webhooks 一次性 secret 必须用明文变量，非密文直接回显');

  const calendarSvc = read('services/api/src/modules/calendar/calendar.service.ts');
  assert.match(calendarSvc, /cipher\.encrypt\(/, 'calendar 必须加密 token 后落库');
  assert.match(calendarSvc, /cipher\.decrypt\(/, 'calendar 同步前必须解密回明文');

  console.log('credential-boundary: FR-SEC-01 (in-column field encryption) contract assertions passed');
}

run();