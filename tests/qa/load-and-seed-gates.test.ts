'use strict';

/**
 * R12 上线冲刺（离线可验证部分）门禁：压测四链路 + 首个租户种子 + 灰度/回滚预案。
 *
 * 设计取向：R12 的「k6 压测数字」与「发布演练」都需要真实环境，本门禁只锁**可离线复现**的契约：
 *  1. k6 四链路脚本齐备、语法通过、阈值齐备、k6 运行时纯净（无 Node API）、无硬编码真实地址；
 *  2. `qa-load/run.mjs --check` 自身可跑通（静态核验 = 真实执行的证据，非文本断言）；
 *  3. 种子脚本**只走公开 API**（无 Prisma/pg 直连）、幂等（重复注册 409 → 转登录）、
 *     且 `--selftest` 通过（假 API 两跑：首跑新建 / 二跑全复用）；
 *  4. 灰度与回滚预案文档具备可执行要素（决策树、冻结期、迁移兼容性、8 条告警名、回滚命令）。
 *
 * 运行：node --experimental-strip-types tests/qa/load-and-seed-gates.test.ts
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const exists = (...p) => fs.existsSync(path.join(ROOT, ...p));

function run() {
  // ═══════════ 1. k6 四链路 ═══════════
  const chains = [
    ['qa-load', 'k6', '01-auth.js'],
    ['qa-load', 'k6', '02-workspace-read.js'],
    ['qa-load', 'k6', '03-workspace-write.js'],
    ['qa-load', 'k6', '04-task-flow.js'],
  ];
  for (const c of chains) {
    assert.ok(exists(...c), `缺少压测链路脚本：${c.join('/')}`);
    const abs = path.join(ROOT, ...c);
    const syntax = spawnSync(process.execPath, ['--check', abs], { encoding: 'utf8' });
    assert.equal(syntax.status, 0, `${c.join('/')} 语法错误：${(syntax.stderr || '').split('\n')[0]}`);
    const src = fs.readFileSync(abs, 'utf8');
    for (const marker of ['export const options', 'vus:', 'duration:', 'thresholds:', 'tags: { chain:', 'check(']) {
      assert.ok(src.includes(marker), `${c.join('/')} 缺少 k6 契约标记：${marker}`);
    }
    // k6/goja 无 Node 运行时：链路脚本里出现 Node API 会在目标机直接崩
    for (const banned of ["require('node:", "from 'node:", 'process.env', 'fs.readFileSync']) {
      assert.ok(!src.includes(banned), `${c.join('/')} 使用了 k6 不支持的 Node API：${banned}（应使用 __ENV）`);
    }
  }

  // 公共库：阈值 + 自定义指标 + 无 Node API + 无硬编码真实地址
  const lib = read('qa-load', 'k6', 'lib.js');
  const libSyntax = spawnSync(process.execPath, ['--check', path.join(ROOT, 'qa-load', 'k6', 'lib.js')], { encoding: 'utf8' });
  assert.equal(libSyntax.status, 0, `qa-load/k6/lib.js 语法错误：${(libSyntax.stderr || '').split('\n')[0]}`);
  for (const marker of ["http_req_failed: ['rate<0.01']", "p(95)<800", "p(99)<2000", 'load_throttled', 'load_version_conflict', 'load_business_latency', '__ENV.BASE_URL', '__ENV.LOAD_PASSWORD']) {
    assert.ok(lib.includes(marker), `lib.js 缺少压测契约：${marker}`);
  }
  assert.equal(lib.match(/https?:\/\/(?!localhost)[^\s'"]+/g), null, 'lib.js 不得硬编码非 localhost 地址（走 __ENV.BASE_URL）');
  assert.ok(lib.includes('http.expectedStatuses'), 'lib.js 须用 expectedStatuses 把 429/409 排除出 http_req_failed');

  // 预期状态码使用：01 需把 429 视为预期，03 需把 409 视为预期
  assert.match(read('qa-load', 'k6', '01-auth.js'), /const EXPECTED = \[201, 429\]/, '鉴权链须把 429（限流）声明为预期状态');
  assert.match(read('qa-load', 'k6', '03-workspace-write.js'), /const EXPECTED = \[200, 409\]/, '工作台写链须把 409（乐观锁冲突）声明为预期状态');

  // ═══════════ 2. 压测编排器 ═══════════
  const runner = read('qa-load', 'run.mjs');
  for (const marker of ['--check', '--base-url', '--vus', '--duration', '--chain', '--summary-export', 'CHECK_OK', "verdict = allOk ? 'PASS' : 'FAIL'"]) {
    assert.ok(runner.includes(marker), `压测编排器缺少：${marker}`);
  }
  assert.ok(runner.includes('node:'), '压测编排器是 Node 脚本（与 k6 链路脚本区分）');
  const check = spawnSync(process.execPath, [path.join(ROOT, 'qa-load', 'run.mjs'), '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(check.status, 0, `qa-load/run.mjs --check 失败：${(check.stdout || '') + (check.stderr || '')}`);
  assert.ok(`${check.stdout}`.includes('CHECK_OK'), '压测静态核验须以 CHECK_OK 结束');
  assert.equal(`${check.stdout}`.match(/\[FAIL\]/g), null, '压测静态核验不得出现 FAIL');

  // README：限流口径（429 属设计行为）+ 容量结论口径
  const loadReadme = read('qa-load', 'k6', 'README.md');
  for (const k of ['429', '设计行为', '乐观锁', '限流与容量口径', '阈值']) {
    assert.ok(loadReadme.includes(k), `压测 README 缺少口径说明：${k}`);
  }

  // ═══════════ 3. 首个租户种子脚本 ═══════════
  const seed = read('scripts', 'seed-first-tenant.mjs');
  assert.ok(!/@prisma\/client|new PrismaClient|from 'pg'|require\('pg'\)/.test(seed), '种子脚本不得直连数据库（必须走公开 API，以继承隔离/审计/密码策略不变量）');
  assert.ok(seed.includes('/auth/register') && seed.includes('/auth/members') && seed.includes('/auth/login'), '种子脚本须通过鉴权 API 建租户/成员');
  assert.match(seed, /reg\.status === 409/, '种子脚本须把 409（重复注册）转为登录，保证幂等');
  assert.ok(seed.includes('--selftest'), '种子脚本须提供 --selftest（本地假 API 自检）');
  assert.match(seed, /verdict: 'OK'/, '种子脚本须输出结构化 verdict');
  const selftest = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'seed-first-tenant.mjs'), '--selftest'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(selftest.status, 0, `种子脚本自检失败：${(selftest.stdout || '') + (selftest.stderr || '')}`);
  assert.ok(`${selftest.stdout}`.includes('SELFTEST_OK'), '种子脚本自检须以 SELFTEST_OK 结束');
  assert.ok(!`${selftest.stdout}`.includes('[FAIL]'), '种子脚本自检不得出现 FAIL');
  assert.match(`${selftest.stdout}`, /幂等复用/, '种子脚本自检须覆盖「二跑幂等复用」');

  // ═══════════ 4. 灰度与回滚预案 ═══════════
  const plan = read('docs', 'ops', 'release-plan.md');
  for (const k of ['§4.1', 'expand', 'contract', '冻结期', '回滚决策树', 'IMAGE_TAG=', 'docker compose', 'runbook.md', 'staging-drill.md', 'qa-load/evidence', 'seed-first-tenant.mjs']) {
    assert.ok(plan.includes(k), `发布预案缺少要素：${k}`);
  }
  // 8 条告警名须与 deploy/observability/alerts.yml 对齐（回滚触发条件不能凭记忆写）
  const alerts = read('deploy', 'observability', 'alerts.yml');
  const alertNames = [...alerts.matchAll(/- alert: (\w+)/g)].map((m) => m[1]);
  assert.equal(alertNames.length, 10, `告警规则应为 10 条，实际 ${alertNames.length}`);
  for (const name of alertNames) {
    assert.ok(plan.includes(name), `发布预案的回滚触发条件缺少告警：${name}`);
  }

  // ═══════════ 5. 根脚本与产物忽略 ═══════════
  const pkg = JSON.parse(read('package.json'));
  for (const s of ['load', 'load:check', 'seed:tenant', 'drill', 'drill:dry']) {
    assert.ok(pkg.scripts[s], `根 package.json 缺少脚本：${s}`);
  }
  assert.match(read('.gitignore'), /^qa-load\/evidence\/$/m, '压测证据属运行产物，须 gitignore');

  // ═══════════ 6. Go/No-Go 核对表 ═══════════
  const gng = read('docs', 'ops', 'go-no-go.md');
  for (const k of ['§4.1', 'Go', 'No-Go', 'Sentry', 'runbook.md', 'release-plan.md', 'qa-load/evidence', 'ZAP']) {
    assert.ok(gng.includes(k), `Go/No-Go 核对表缺少要素：${k}`);
  }
  assert.equal((gng.match(/^\| \d+ \|/gm) || []).length, 8, 'Go/No-Go 表须逐条覆盖 §4.1 的 8 项阻断条件');
  assert.ok(releasePlanIncludesGoNoGo(), 'release-plan.md 前置检查表须引用 go-no-go.md（不得再指向不存在的 R0 清单）');

  console.log('load-and-seed-gates: 压测四链路 / 种子幂等 / 灰度回滚预案 / Go-No-Go 核对表 契约断言通过');
}

function releasePlanIncludesGoNoGo() {
  return read('docs', 'ops', 'release-plan.md').includes('docs/ops/go-no-go.md');
}

run();
