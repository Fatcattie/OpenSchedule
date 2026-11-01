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
  // FR-SEC-03：限流必须全局接入（登录爆破防线），且 42901 走统一 ApiException
  const commonModule = read('common/common.module.ts');
  assert.match(commonModule, /RateLimitGuard/, 'RateLimitGuard 必须注册为全局 APP_GUARD');
  assert.match(commonModule, /useClass: RateLimitGuard/, '限流守卫必须真实挂 APP_GUARD（非仅 import）');

  const guard = read('common/rate-limit/rate-limit.guard.ts');
  assert.match(guard, /rateLimited\(\)/, '超限必须抛 42901（ApiException.rateLimited）');
  assert.match(guard, /x-forwarded-for/i, '限流 key 必须取真实客户端 IP（X-Forwarded-For）');

  const authController = read('modules/auth/auth.controller.ts');
  assert.match(authController, /RateLimit\(\{ limit: 5, windowMs: 60_000, keyBy: 'ip' \}\)/, '登录/注册/刷新必须 5 次/分钟/IP 紧阈值');
  const rateLimitCount = (authController.match(/@RateLimit\(/g) ?? []).length;
  assert.ok(rateLimitCount >= 3, 'register/login/refresh 三个爆破面必须全部限流');

  // FR-SEC-06：安全响应头中间件必须装配
  const middleware = read('common/middleware/security-headers.middleware.ts');
  assert.match(middleware, /X-Content-Type-Options/, '必须设置 X-Content-Type-Options');
  assert.match(middleware, /X-Frame-Options/, '必须设置 X-Frame-Options');
  assert.match(commonModule, /SecurityHeadersMiddleware/, '安全头中间件必须装配进中间件链');

  // FR-SEC-07：出站 SSRF 防护（webhook URL + MCP 网关超时）
  const urlGuard = read('common/security/url-guard.ts');
  assert.match(urlGuard, /169\.254|元数据/, 'SSRF 防护必须覆盖 169.254.0.0/16 元数据地址');
  assert.match(urlGuard, /dns\.lookup|all: true/, 'SSRF 必须 DNS 解析后校验（防 rebinding）');
  const webhooksSvc = read('modules/webhooks/webhooks.service.ts');
  assert.match(webhooksSvc, /assertSafeUrl\(input\.url\)/, 'webhook 创建/更新必须过 SSRF 校验');
  const imAdapters = read('modules/integrations/adapters/im-adapters.ts');
  assert.match(imAdapters, /AbortController/, 'MCP 网关出站请求必须带超时（AbortController）');

  // FR-SEC-08：AI 回调必须 HMAC 验签（恒定时间 + 时间窗），不得残留明文 Bearer 比较
  const sig = read('common/auth/ai-callback-signature.ts');
  assert.match(sig, /timingSafeEqual/, 'AI 回调验签必须恒定时间比较');
  assert.match(sig, /toleranceSec|时间窗/, 'AI 回调必须有时间窗防重放');
  const proposalsController = read('modules/proposals/proposals.controller.ts');
  assert.match(proposalsController, /verifyAiSignature/, 'AI 回调入口必须调用验签');
  assert.doesNotMatch(proposalsController, /token !== expected/, 'AI 回调不得残留非恒定时间 Bearer 明文比较');

  // FR-SEC-09：凭据列内加密（AES-256-GCM）必须覆盖 webhook secret 与 calendar token
  const cipher = read('common/security/credential-cipher.ts');
  assert.match(cipher, /aes-256-gcm/i, '凭据加密必须 AES-256-GCM（带完整性）');

  console.log('security-gates: FR-SEC-03/06/07/08/09 contract assertions passed');
}

run();
