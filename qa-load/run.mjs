#!/usr/bin/env node
// ============================================================
// OpenSchedule 压测编排（R12「k6 四链路」）
//
// --check  静态核验（无需 k6 / 无需服务）：文件齐备 + 语法 + 阈值/预期状态码契约 + 落盘报告
// 默认     真跑：逐条链路 k6 run --summary-export，聚合阈值结论并落盘证据
//
// 用法：
//   node qa-load/run.mjs --check
//   node qa-load/run.mjs --base-url https://staging.example.com/api/v1 --vus 20 --duration 2m
//   node qa-load/run.mjs --chain 02 --vus 50 --duration 3m
//   node qa-load/run.mjs --email load@example.com --password '***'   # 复用已有租户，避免造租户
//
// 产物：qa-load/evidence/load-<UTC 时间戳>.{json,md}（摘要可直接粘进 production-progress）
// ============================================================
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d = null) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const CHAINS = [
  { id: '01', file: 'qa-load/k6/01-auth.js', name: '鉴权链（注册/登录）', expect: ['load_throttled'] },
  { id: '02', file: 'qa-load/k6/02-workspace-read.js', name: '工作台读链', expect: [] },
  { id: '03', file: 'qa-load/k6/03-workspace-write.js', name: '工作台写链（乐观锁）', expect: ['load_version_conflict'] },
  { id: '04', file: 'qa-load/k6/04-task-flow.js', name: '任务生命周期写链', expect: [] },
];
// 契约标记：每条链路都是「vus/duration + thresholds + tags.chain」齐备
const REQUIRED_MARKERS = ['export const options', 'vus:', 'duration:', 'thresholds:', 'tags: { chain:', 'check('];

const OPTS = {
  check: has('--check'),
  baseUrl: val('--base-url', 'http://localhost:3000/api/v1'),
  vus: val('--vus', '10'),
  duration: val('--duration', '30s'),
  chain: val('--chain', 'all'),
  email: val('--email', null),
  password: val('--password', null),
};

const results = [];
function record(id, title, status, detail) {
  results.push({ id, title, status, detail: String(detail ?? '').slice(0, 3000) });
  const tag = { ok: 'PASS', fail: 'FAIL', skip: 'SKIP', warn: 'WARN' }[status] ?? status;
  console.log(`[${tag}] ${id} — ${title}`);
  if (status !== 'ok' && detail) console.log(`        ${String(detail).split('\n')[0].slice(0, 240)}`);
}

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function staticChecks() {
  const env = read('qa-load/k6/lib.js');
  let ok = true;
  // 0) 公共库语法（注释里出现 */ 会把块注释提前闭合，必须由核验拦住）
  const libSyntax = spawnSync(process.execPath, ['--check', path.join(ROOT, 'qa-load/k6/lib.js')], { encoding: 'utf8' });
  if (libSyntax.status !== 0) {
    record('lib.syntax', '公共库语法通过', 'fail', (libSyntax.stderr || '').split('\n').slice(0, 4).join(' '));
    ok = false;
  } else record('lib.syntax', '公共库语法通过', 'ok', 'qa-load/k6/lib.js');
  // 1) 公共库：三档阈值 + 三个自定义指标
  for (const marker of ['http_req_failed', 'p(95)<800', 'p(99)<2000', 'load_throttled', 'load_version_conflict', 'load_business_latency']) {
    if (!env.includes(marker)) {
      record('lib.thresholds', '公共库阈值/指标齐备', 'fail', `lib.js 缺少 ${marker}`);
      ok = false;
    }
  }
  if (ok) record('lib.thresholds', '公共库阈值/指标齐备', 'ok', 'p95<800ms · p99<2s · failed<1% + 3 个自定义指标');
  // 2) 不硬编码真实地址：默认地址只允许 localhost，其余走 __ENV.BASE_URL
  const hardcoded = env.match(/https?:\/\/(?!localhost)[^\s'"]+/g);
  if (hardcoded) {
    record('lib.credentials', '未硬编码真实地址', 'fail', `lib.js 出现非 localhost 地址: ${hardcoded.join(', ')}`);
    ok = false;
  } else record('lib.credentials', '未硬编码真实地址', 'ok', '默认 http://localhost，可用 BASE_URL 覆盖');
  if (/PASSWORD\s*=\s*__ENV\.LOAD_PASSWORD/.test(env)) {
    record('lib.credentials.password', '口令走 __ENV（可覆盖）', 'ok', 'LOAD_PASSWORD 可覆盖压测占位口令');
  } else {
    record('lib.credentials.password', '口令走 __ENV（可覆盖）', 'fail', 'lib.js 未从 __ENV.LOAD_PASSWORD 取口令');
    ok = false;
  }
  // 3) 四条链路：存在 + 语法 + 契约标记
  const selected = CHAINS.filter((c) => OPTS.chain === 'all' || c.id === OPTS.chain);
  if (selected.length === 0) {
    record('chains.select', '链路选择有效', 'fail', `--chain ${OPTS.chain} 不匹配 01..04`);
    return false;
  }
  for (const c of selected) {
    const abs = path.join(ROOT, c.file);
    if (!fs.existsSync(abs)) {
      record(`chain.${c.id}`, c.name, 'fail', `缺少 ${c.file}`);
      ok = false;
      continue;
    }
    const src = fs.readFileSync(abs, 'utf8');
    const missing = REQUIRED_MARKERS.filter((m) => !src.includes(m));
    if (missing.length) {
      record(`chain.${c.id}`, c.name, 'fail', `缺少契约标记: ${missing.join(', ')}`);
      ok = false;
      continue;
    }
    const syntax = spawnSync(process.execPath, ['--check', abs], { encoding: 'utf8' });
    if (syntax.status !== 0) {
      record(`chain.${c.id}`, c.name, 'fail', `语法错误: ${(syntax.stderr || '').split('\n')[0]}`);
      ok = false;
      continue;
    }
    record(`chain.${c.id}`, c.name, 'ok', `${c.file} 语法通过 · 阈值/标签齐备`);
  }
  // 4) 反内卷：不得出现 Node-only API（k6/goja 无 Node 运行时）
  const nodeOnly = [];
  for (const c of CHAINS) {
    const src = fs.readFileSync(path.join(ROOT, c.file), 'utf8');
    for (const bad of ["require('node:", "from 'node:", 'process.env', 'fs.readFileSync']) {
      if (src.includes(bad)) nodeOnly.push(`${c.id}:${bad}`);
    }
  }
  if (nodeOnly.length) {
    record('chains.runtime', 'k6 运行时纯净（无 Node API）', 'fail', `出现 Node-only API: ${nodeOnly.join(', ')}（k6 用 __ENV）`);
    ok = false;
  } else record('chains.runtime', 'k6 运行时纯净（无 Node API）', 'ok', '仅使用 k6/http、k6/metrics、__ENV');
  return ok;
}

function writeReport(verdict, extra) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(ROOT, 'qa-load', 'evidence');
  fs.mkdirSync(dir, { recursive: true });
  const payload = Object.assign(
    {
      generatedAt: new Date().toISOString(),
      mode: OPTS.check ? 'check' : 'run',
      verdict,
      baseUrl: OPTS.baseUrl,
      vus: OPTS.vus,
      duration: OPTS.duration,
      chain: OPTS.chain,
      steps: results,
    },
    extra || {},
  );
  fs.writeFileSync(path.join(dir, `load-${ts}.json`), JSON.stringify(payload, null, 2), 'utf8');
  const md = [
    `# 压测报告（${payload.mode}）`,
    '',
    `- 时间：${payload.generatedAt}`,
    `- 结论：**${verdict}**`,
    `- 目标：${OPTS.baseUrl} · VUS=${OPTS.vus} · duration=${OPTS.duration} · chain=${OPTS.chain}`,
    '',
    '| 步骤 | 说明 | 结果 |',
    '|---|---|---|',
    ...results.map((r) => `| ${r.id} | ${r.title} | ${r.status === 'ok' ? '✅' : r.status === 'fail' ? '❌' : r.status.toUpperCase()} |`),
    '',
  ];
  if (extra && extra.summary) {
    md.push('## k6 阈值结论', '', '```', JSON.stringify(extra.summary, null, 2), '```', '');
  }
  fs.writeFileSync(path.join(dir, `load-${ts}.md`), md.join('\n'), 'utf8');
  console.log(`\n报告：qa-load/evidence/load-${ts}.{json,md}`);
}

function main() {
  console.log(`压测计划：chain=${OPTS.chain} · VUS=${OPTS.vus} · duration=${OPTS.duration} · ${OPTS.baseUrl}`);
  const staticOk = staticChecks();

  if (OPTS.check) {
    const verdict = staticOk ? 'CHECK_OK' : 'FAIL';
    writeReport(verdict);
    console.log(`\n静态核验：${verdict}`);
    process.exit(staticOk ? 0 : 1);
  }

  if (!staticOk) {
    record('abort', '静态核验失败，压测中止', 'fail', '先修复 FAIL 项');
    writeReport('FAIL');
    process.exit(1);
  }

  const k6 = spawnSync('k6', ['version'], { encoding: 'utf8' });
  if (k6.status !== 0) {
    record('k6', 'k6 可执行文件可用', 'fail', '未找到 k6（https://grafana.com/docs/k6/latest/set-up/install-k6/）；本机无 k6 时用 --check 走静态核验');
    writeReport('FAIL');
    process.exit(1);
  }
  record('k6', 'k6 可执行文件可用', 'ok', (k6.stdout || '').split('\n')[0]);

  const selected = CHAINS.filter((c) => OPTS.chain === 'all' || c.id === OPTS.chain);
  const env = { ...process.env, BASE_URL: OPTS.baseUrl, VUS: OPTS.vus, DURATION: OPTS.duration };
  if (OPTS.email) env.LOAD_EMAIL = OPTS.email;
  if (OPTS.password) env.LOAD_PASSWORD = OPTS.password;

  const summary = {};
  let allOk = true;
  for (const c of selected) {
    const out = path.join(ROOT, 'qa-load', 'evidence', `k6-${c.id}.json`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    console.log(`\n▶ k6 run ${c.file}`);
    const r = spawnSync('k6', ['run', '--summary-export', out, c.file], { cwd: ROOT, env, encoding: 'utf8' });
    const ok = r.status === 0;
    record(`k6.${c.id}`, c.name, ok ? 'ok' : 'fail', `exit=${r.status}\n${(r.stdout || '').split('\n').slice(-25).join('\n')}\n${r.stderr || ''}`);
    if (fs.existsSync(out)) {
      try {
        summary[c.id] = JSON.parse(fs.readFileSync(out, 'utf8'));
      } catch (e) {
        summary[c.id] = { parseError: String(e) };
      }
    }
    allOk = allOk && ok;
  }
  const verdict = allOk ? 'PASS' : 'FAIL';
  writeReport(verdict, { summary });
  console.log(`\n压测结论：${verdict}`);
  process.exit(allOk ? 0 : 1);
}

main();
