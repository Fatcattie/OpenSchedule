'use strict';

/**
 * R11 AI 服务加固契约门禁（静态断言；不启动 Python 进程）。
 *
 * R11 验收项 → 断言映射：
 *  1. run 持久化：`run_store.py` 的 Redis 键布局/TTL/帧上限/孤儿清扫 + auto 降级告警 + redis fail-fast
 *  2. 重启后可恢复：`decompose.py` 活流程落盘 + 无内存态时从存储重放 + 未终帧补 `AI_RUN_INTERRUPTED`
 *  3. 回调签名：`callback_signing.py` 与主服务 `ai-callback-signature.ts` 契约逐字对齐（HMAC-SHA256 + 头名）
 *  4. 回调幂等：`Idempotency-Key: ai-run:<run_id>` + 主服务全局幂等拦截器
 *  5. 回调死信：重试退避/永久 4xx 停止 → `dead_letter.py`（可查询/可重放/可告警，且**无本地文件后端**）
 *  6. 死信可告警：AI `/metrics`（自写 exposition）+ Prometheus 抓取 ai:8300 + 2 条告警规则 + runbook 处置
 *  7. 配置落地：AI 侧/根/生产 env 模板 + dev(ai→redis) / prod(redis fail-fast) compose 装配
 *  8. 测试面：run_store / dead_letter / callback_delivery / router_recovery / metrics 五组用例存在
 *
 * 运行：node --experimental-strip-types tests/qa/ai-hardening-gates.test.ts
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const exists = (...p) => fs.existsSync(path.join(ROOT, ...p));

function run() {
  // ═══════════ 1. run 持久化（run_store.py） ═══════════
  const runStore = read('services', 'ai', 'app', 'services', 'run_store.py');
  for (const marker of [
    'KEY_PREFIX = "osai:run:"',
    'RUNS_INDEX = "osai:runs"',
    'RUN_INTERRUPTED = "AI_RUN_INTERRUPTED"',
    'ltrim(frames_key, -self._max_frames, -1)',
    'pipe.expire(self._meta_key(run_id), self._ttl)',
    'async def recover_orphans',
    'ai_run_store_degraded',
    'ai_run_store_recovered',
    'AI_RUN_STORE=redis 但 Redis 不可用',
  ]) {
    assert.ok(runStore.includes(marker), `run_store.py 缺少 R11 契约：${marker}`);
  }
  // 三种模式显式可选 + auto 之外不得静默降级
  assert.match(runStore, /mode not in \("auto", "redis", "memory"\)/, 'AI_RUN_STORE 非法值必须显式拒绝');

  // ═══════════ 2. 重启后可恢复（router 重放路径） ═══════════
  const router = read('services', 'ai', 'app', 'routers', 'decompose.py');
  for (const marker of [
    'await store.create(run_id, proposal_id=x_proposal_id)',
    'await state.store.append_frame(state.run_id, frame)',
    'async def _sse_replay',
    'record.has_terminal_frame',
    'AI_RUN_NOT_FOUND',
    '/dead-letters',
    '/dead-letters/{entry_id}/replay',
  ]) {
    assert.ok(router.includes(marker), `decompose.py 缺少 R11 契约：${marker}`);
  }
  assert.match(router, /await store\.set_status\(record\.run_id, STATUS_INTERRUPTED/, '无内存态重放必须把 run 标为 interrupted（客户端确定性收流）');

  // ═══════════ 3. HMAC 签名双端逐字对齐 ═══════════
  const signing = read('services', 'ai', 'app', 'services', 'callback_signing.py');
  const verifier = read('services', 'api', 'src', 'common', 'auth', 'ai-callback-signature.ts');
  assert.ok(signing.includes('ALGORITHM = "sha256"'), 'AI 侧签名算法须为 HMAC-SHA256');
  assert.ok(signing.includes('f"{timestamp}."'), 'AI 侧签名字符串须为 `${timestamp}.${rawBody}`');
  assert.ok(signing.includes('X-AI-Timestamp') && signing.includes('X-AI-Signature'), 'AI 侧须发 X-AI-Timestamp / X-AI-Signature');
  assert.ok(signing.includes('serialize_body') && signing.includes('separators=(",", ":")'), 'AI 侧须签实际发出的 raw bytes（序列化单一来源）');
  assert.ok(verifier.includes("update(`${timestamp}.${body}`"), '主服务验签字符串须与 AI 侧一致');
  assert.ok(verifier.includes('timingSafeEqualHex') && verifier.includes('toleranceSec'), '主服务须恒定时间比较 + 时间窗（防重放）');

  // ═══════════ 4. 回调幂等 + 退避重试 ═══════════
  const delivery = read('services', 'ai', 'app', 'services', 'callback_delivery.py');
  assert.ok(delivery.includes('f"ai-run:{run_id}"'), '回调必须携带 Idempotency-Key: ai-run:<run_id>（主服务 24h 去重）');
  assert.ok(delivery.includes('RETRYABLE_CLIENT_STATUS = (408, 409, 425, 429)'), '永久 4xx 与可重试 4xx 必须区分（否则验签失败会被无意义重试）');
  assert.ok(delivery.includes('MAX_BACKOFF_SECONDS = 8.0') && delivery.includes('2.0 ** max(0, attempt - 1)'), '退避须有界（指数 + 上限）');
  const idempotency = read('services', 'api', 'src', 'common', 'interceptors', 'idempotency.interceptor.ts');
  assert.ok(idempotency.includes("req.headers['idempotency-key']") && idempotency.includes('IDEMPOTENCY_TTL_MS = 24'), '主服务须有全局 24h 幂等拦截器（回调重放安全的前提）');

  // ═══════════ 5. 死信（可查询/可重放/无文件后端） ═══════════
  const dlq = read('services', 'ai', 'app', 'services', 'dead_letter.py');
  for (const marker of [
    'DLQ_IDS_KEY = "osai:dlq:ids"',
    'DLQ_ENTRY_PREFIX = "osai:dlq:"',
    'ai_callback_dead_letter',
    'ai_dead_letter_degraded',
    'async def mark_replayed',
  ]) {
    assert.ok(dlq.includes(marker), `dead_letter.py 缺少 R11 契约：${marker}`);
  }
  assert.ok(!/from pathlib import|import pathlib|open\(/.test(dlq + delivery), '设计要求：死信不得使用仅本地文件的后端');
  assert.ok(delivery.includes('await dead_letter.record_dead_letter('), '投递失败必须落死信（不得只打日志）');

  // ═══════════ 6. 死信可告警（指标 + 抓取 + 规则 + runbook） ═══════════
  const metrics = read('services', 'ai', 'app', 'services', 'metrics.py');
  for (const marker of [
    'openschedule_ai_up',
    'openschedule_ai_dead_letters_recorded_total',
    'openschedule_ai_dead_letters',
    'openschedule_ai_run_store_mode',
  ]) {
    assert.ok(metrics.includes(marker), `AI 指标缺少：${marker}`);
  }
  const mainPy = read('services', 'ai', 'app', 'main.py');
  assert.ok(mainPy.includes('@app.get("/metrics"'), 'AI 须暴露 /metrics（Prometheus 抓取）');
  assert.ok(mainPy.includes('await init_run_store()') && mainPy.includes('await init_dead_letter_store()'), 'lifespan 须装配 run/死信存储');
  assert.ok(mainPy.includes('await run_store.close()') && mainPy.includes('await dead_letter_store.close()'), 'lifespan 退出须释放连接');

  const prometheus = read('deploy', 'observability', 'prometheus.yml');
  assert.ok(/job_name:\s*openschedule-ai/.test(prometheus), 'Prometheus 须抓取 AI 服务');
  assert.ok(/targets:\s*\['ai:8300'\]/.test(prometheus), 'Prometheus 须抓取 ai:8300');
  const alerts = read('deploy', 'observability', 'alerts.yml');
  assert.match(alerts, /alert:\s*AiCallbackDeadLetters[\s\S]*?increase\(openschedule_ai_dead_letters_recorded_total\[15m\]\)\s*>\s*0/, '死信告警须基于 AI 死信计数');
  assert.match(alerts, /alert:\s*AiRunStoreDegraded[\s\S]*?openschedule_ai_run_store_mode\{mode="memory"\}/, '存储退化告警须基于 AI 存储形态指标');
  for (const name of ['AiCallbackDeadLetters', 'AiRunStoreDegraded']) {
    assert.ok(read('docs', 'ops', 'runbook.md').includes(name), `runbook 须有处置步骤：${name}`);
  }

  // ═══════════ 7. 配置落地（env 模板 + compose） ═══════════
  for (const [file, markers] of [
    [['services', 'ai', '.env.example'], ['AI_RUN_STORE=', 'AI_STATE_REDIS_URL=', 'AI_STATE_TTL_SECONDS=', 'AI_STATE_MAX_FRAMES=', 'AI_DLQ_MAX_ENTRIES=', 'AI_CALLBACK_MAX_ATTEMPTS=']],
    [['.env.example'], ['AI_RUN_STORE=', 'AI_STATE_REDIS_URL=', 'AI_DLQ_MAX_ENTRIES=']],
    [['deploy', '.env.production.example'], ['AI_RUN_STORE=redis', 'AI_STATE_REDIS_URL=redis://redis:6379/3']],
  ]) {
    const raw = read(...file);
    for (const marker of markers) assert.ok(raw.includes(marker), `${file.join('/')} 缺少 R11 变量：${marker}`);
  }
  const devCompose = read('deploy', 'docker-compose.yml');
  assert.match(devCompose, /AI_RUN_STORE:\s*\$\{AI_RUN_STORE:-auto\}/, 'dev compose 须透传 AI_RUN_STORE（默认 auto）');
  assert.match(devCompose, /AI_STATE_REDIS_URL:\s*redis:\/\/redis:6379\/3/, 'dev compose 须把 AI 状态库指向 redis db3');
  const prodCompose = read('deploy', 'docker-compose.prod.yml');
  assert.match(prodCompose, /AI_RUN_STORE:\s*redis/, 'prod compose 须强制 AI_RUN_STORE=redis（fail-fast）');
  assert.match(prodCompose, /AI_STATE_REDIS_URL:\s*redis:\/\/redis:6379\/3/, 'prod compose 须指向 redis db3');
  const configPy = read('services', 'ai', 'app', 'config.py');
  for (const field of ['ai_run_store', 'ai_state_redis_url', 'ai_state_ttl_seconds', 'ai_state_max_frames', 'ai_dlq_max_entries', 'ai_callback_max_attempts']) {
    assert.ok(configPy.includes(field), `config.py 缺少 R11 配置项：${field}`);
  }

  // ═══════════ 8. 测试面与文档 ═══════════
  for (const spec of ['test_run_store.py', 'test_dead_letter.py', 'test_callback_delivery.py', 'test_router_recovery.py', 'test_metrics.py', 'fake_redis.py']) {
    assert.ok(exists('services', 'ai', 'tests', spec), `缺少 R11 用例：${spec}`);
  }
  const readme = read('services', 'ai', 'readme.md');
  for (const k of ['R11', 'AI_RUN_STORE', 'dead-letters', '/metrics']) {
    assert.ok(readme.includes(k), `services/ai/readme.md 缺少 R11 说明：${k}`);
  }

  console.log('ai-hardening-gates: R11 run 持久化/重启重放/HMAC/幂等/死信/告警/配置 契约断言通过');
}

run();
