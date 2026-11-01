#!/usr/bin/env node
// ============================================================
// OpenSchedule staging 首次部署演练编排（R10-2 / §4.1 #1 #3 #4 取证）
//
// 目的：把「R10-1 编写的生产编排」在一个真实 Docker 主机上**跑一遍**，一次性产出
//       迁移可跑（§4.1 #1）、集成/冒烟可跑（§4.1 #3）、备份+隔离库恢复演练成功（§4.1 #4）
//       三类可粘贴进 `docs/ddd/production-progress.md` 的证据。
//
// 用法（目标机，仓库根目录）：
//   node deploy/drill/run.mjs --dry-run                      # 只做静态前置检查并打印计划（本机可跑）
//   node deploy/drill/run.mjs                                # 真跑（需 Docker + deploy/.env.production）
//   node deploy/drill/run.mjs --base-url http://localhost --skip-rollback
//   node deploy/drill/run.mjs --build                        # 目标机未接 GHCR 时本地构建生产镜像
//
// 退出码：0 = 全部关键步骤通过；1 = 有步骤失败（报告仍会写出，便于贴进进度文档）。
// 报告：deploy/drill/evidence/drill-<UTC 时间戳>.{json,md}
// ============================================================

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d = null) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const OPTIONS = {
  dryRun: has('--dry-run'),
  build: has('--build'),
  skipRollback: has('--skip-rollback'),
  allowEmptySecrets: has('--allow-empty-secrets'),
  envFile: val('--env-file', 'deploy/.env.production'),
  baseUrl: val('--base-url', null),
  rollbackTag: val('--rollback-tag', null),
};

const COMPOSE = ['compose', `--env-file`, OPTIONS.envFile, '-f', 'deploy/docker-compose.prod.yml'];
const FILES = {
  compose: 'deploy/docker-compose.prod.yml',
  caddy: 'deploy/caddy/Caddyfile',
  alertmanager: 'deploy/observability/alertmanager.yml',
  nginx: 'deploy/web/nginx.conf',
  backup: 'deploy/postgres/backup.sh',
  restore: 'deploy/postgres/restore.sh',
  verify: 'deploy/postgres/verify-restore.sh',
  envTemplate: 'deploy/.env.production.example',
};
// 生产栈关键变量（须在 env 文件中非空；与 compose 的 ${VAR:?} 对齐）
const REQUIRED_VARS = [
  'REGISTRY', 'IMAGE_TAG', 'DOMAIN', 'ACME_EMAIL', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB',
  'MINIO_ROOT_USER', 'MINIO_ROOT_PASSWORD', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY',
  'AI_SERVICE_TOKEN', 'GRAFANA_ADMIN_PASSWORD',
];

const results = [];
const record = (id, title, status, detail, seconds = null) => {
  results.push({ id, title, status, detail: String(detail ?? '').slice(0, 4000), seconds });
  const tag = { ok: 'PASS', fail: 'FAIL', skip: 'SKIP', warn: 'WARN', info: 'INFO' }[status] ?? status;
  console.log(`[${tag}] ${id} — ${title}${seconds != null ? ` (${seconds.toFixed(1)}s)` : ''}`);
  if (status !== 'ok' && detail) console.log(`        ${String(detail).split('\n')[0].slice(0, 240)}`);
};

function run(cmd, cmdArgs, { cwd = ROOT, allowFail = false } = {}) {
  const started = Date.now();
  const res = spawnSync(cmd, cmdArgs, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: false });
  const seconds = (Date.now() - started) / 1000;
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim();
  const ok = res.status === 0;
  if (!ok && !allowFail) {
    // 由调用方决定是否 record fail
  }
  return { ok, status: res.status, out, seconds };
}

function readEnvFile(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return { exists: false, vars: {} };
  const vars = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) vars[m[1]] = m[2].trim();
  }
  return { exists: true, vars };
}

// ───────────────────────── 计划（dry-run 亦打印） ─────────────────────────
function printPlan() {
  console.log('\n演练计划（staging 首次部署）:');
  const plan = [
    '1  preflight  静态前置：文件齐备 / 变量齐备 / docker 可用',
    '2  config     docker compose config --quiet（编排语法与插值）',
    '3  images     pull 或 --build 三个生产镜像（api/web:prod/ai）',
    '4  migrate    --profile tools run --rm migrate（prisma migrate deploy + status）',
    '5  up         up -d --remove-orphans',
    '6  ps         全部服务 healthy',
    '7  smoke      /health 200 + 首页 200 + /metrics 403（公网拒绝）',
    '8  backup     容器内执行 deploy/postgres/backup.sh 产出 dump',
    '9  restore    隔离库 restore.sh + verify-restore.sh，记录 RTO（§4.1 #4）',
    '10 rollback   用旧 IMAGE_TAG 滚动一次再切回（回滚预案演练）',
    '11 report     写出 deploy/drill/evidence/drill-<ts>.{json,md}',
  ];
  plan.forEach((l) => console.log('   ' + l));
  console.log('');
}

// ───────────────────────── 各步骤 ─────────────────────────
function stepPreflight() {
  const missingFiles = Object.entries(FILES)
    .filter(([, rel]) => !fs.existsSync(path.join(ROOT, rel)))
    .map(([k, rel]) => `${k}=${rel}`);
  if (missingFiles.length) {
    record('preflight.files', '前置文件齐备', 'fail', `缺少: ${missingFiles.join(', ')}`);
    return false;
  }
  record('preflight.files', '前置文件齐备', 'ok', Object.values(FILES).join(', '));

  const env = readEnvFile(OPTIONS.envFile);
  if (!env.exists) {
    const msg = `未找到 ${OPTIONS.envFile}（请 cp deploy/.env.production.example ${OPTIONS.envFile} 并填值）`;
    if (OPTIONS.dryRun) record('preflight.env', '环境变量齐备', 'warn', msg);
    else {
      record('preflight.env', '环境变量齐备', 'fail', msg);
      return false;
    }
  } else {
    const empty = REQUIRED_VARS.filter((v) => !env.vars[v]);
    if (empty.length && !OPTIONS.allowEmptySecrets) {
      record('preflight.env', '环境变量齐备', 'fail', `空值: ${empty.join(', ')}`);
      return false;
    }
    record(
      'preflight.env',
      '环境变量齐备',
      empty.length ? 'warn' : 'ok',
      empty.length ? `空值（--allow-empty-secrets 放行）: ${empty.join(', ')}` : `${REQUIRED_VARS.length} 项必填变量非空`,
    );
  }

  const docker = run('docker', ['--version'], { allowFail: true });
  if (!docker.ok) {
    const msg = '未检测到 docker（本机无 Docker 时用 --dry-run 仅做静态检查）';
    if (OPTIONS.dryRun) record('preflight.docker', 'Docker 可用', 'warn', msg);
    else {
      record('preflight.docker', 'Docker 可用', 'fail', msg);
      return false;
    }
  } else {
    const dc = run('docker', ['compose', 'version'], { allowFail: true });
    record('preflight.docker', 'Docker 可用', dc.ok ? 'ok' : 'fail', `${docker.out.split('\n')[0]} / ${dc.out.split('\n')[0]}`);
    if (!dc.ok) return false;
  }
  return true;
}

const steps = [
  {
    id: 'config',
    title: '编排语法与变量插值（compose config）',
    critical: true,
    cmd: () => run('docker', [...COMPOSE, 'config', '--quiet']),
  },
  {
    id: 'images',
    title: '获取三个生产镜像（pull / --build）',
    critical: true,
    cmd: () =>
      OPTIONS.build
        ? run('docker', [...COMPOSE, 'build', 'api', 'web', 'ai'])
        : run('docker', [...COMPOSE, 'pull', 'api', 'web', 'ai']),
  },
  {
    id: 'migrate',
    title: '迁移 job（prisma migrate deploy + status）',
    critical: true,
    cmd: () => run('docker', [...COMPOSE, '--profile', 'tools', 'run', '--rm', 'migrate']),
  },
  {
    id: 'up',
    title: '拉起生产栈（up -d --remove-orphans）',
    critical: true,
    cmd: () => run('docker', [...COMPOSE, 'up', '-d', '--remove-orphans']),
  },
  {
    id: 'ps',
    title: '全部服务 healthy',
    critical: true,
    cmd: () => {
      const r = run('docker', [...COMPOSE, 'ps', '--format', 'json']);
      if (!r.ok) return r;
      const unhealthy = r.out
        .split(/\r?\n/)
        .filter(Boolean)
        .map((l) => JSON.parse(l))
        .filter((s) => !/healthy|running/i.test(`${s.Health ?? ''} ${s.State ?? ''}`));
      return { ok: unhealthy.length === 0, status: unhealthy.length ? 1 : 0, out: r.out, seconds: r.seconds, unhealthy: unhealthy.map((s) => s.Service) };
    },
  },
];

function stepSmoke(baseUrl) {
  // 用 node 自带 fetch 探活（避免依赖 curl）
  const checks = [
    { path: '/health', expect: [200], name: '健康检查 200' },
    { path: '/', expect: [200], name: '前端首页 200' },
    { path: '/metrics', expect: [403], name: '公网 /metrics 403（仅内网抓取）' },
  ];
  const details = [];
  let ok = true;
  const started = Date.now();
  for (const c of checks) {
    const url = `${baseUrl.replace(/\/$/, '')}${c.path}`;
    try {
      // 用 node 自带 fetch 探活（不依赖 curl）；spawnSync 保持步骤同步语义，便于顺序记录证据
      const probe = run(process.execPath, [
        '-e',
        `fetch(${JSON.stringify(url)},{redirect:'manual'}).then(r=>{console.log(r.status);process.exit(${JSON.stringify(c.expect)}.includes(r.status)?0:1)}).catch(e=>{console.error('ERR',e.message);process.exit(2)})`,
      ]);
      const status = Number((probe.out || '').split('\n').pop());
      const pass = c.expect.includes(status);
      ok = ok && pass;
      details.push(`${c.name}: ${pass ? 'OK' : `实际 ${probe.ok ? status : probe.out.slice(0, 80)}`}`);
    } catch (err) {
      ok = false;
      details.push(`${c.name}: 异常 ${err.message}`);
    }
  }
  return { ok, details, seconds: (Date.now() - started) / 1000 };
}

const runBackup = () => {
  const cp = run('docker', [...COMPOSE, 'cp', FILES.backup, 'postgres:/tmp/os-backup.sh']);
  if (!cp.ok) return { ...cp, out: `cp backup.sh 失败: ${cp.out}` };
  const sh = run('docker', [
    ...COMPOSE, 'exec', '-T', 'postgres', 'sh', '-c',
    'DATABASE_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5432/$POSTGRES_DB?schema=public" bash /tmp/os-backup.sh /tmp/drill.dump && ls -l /tmp/drill.dump',
  ]);
  return sh;
};

const runRestoreDrill = () => {
  const started = Date.now();
  const cp = run('docker', [...COMPOSE, 'cp', FILES.restore, 'postgres:/tmp/os-restore.sh']);
  const cp2 = run('docker', [...COMPOSE, 'cp', FILES.verify, 'postgres:/tmp/os-verify.sh']);
  if (!cp.ok || !cp2.ok) return { ok: false, out: `cp 脚本失败: ${cp.out} ${cp2.out}`, seconds: (Date.now() - started) / 1000 };
  const exec = run('docker', [
    ...COMPOSE, 'exec', '-T', 'postgres', 'sh', '-c',
    [
      'set -e',
      'ADMIN="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5432/postgres"',
      'TARGET="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5432/os_drill?schema=public"',
      'psql "$ADMIN" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS os_drill;" -c "CREATE DATABASE os_drill;"',
      'bash /tmp/os-restore.sh /tmp/drill.dump "$TARGET"',
      'export DATABASE_URL="$TARGET"',
      'bash /tmp/os-verify.sh',
      'echo DRILL_OK',
    ].join(' && '),
  ]);
  const seconds = (Date.now() - started) / 1000;
  return { ok: exec.ok && /DRILL_OK/.test(exec.out), out: exec.out, seconds };
};

const runRollback = (tag) => {
  if (!tag) return { ok: false, out: '未提供 --rollback-tag（或用 --skip-rollback 跳过）' };
  const env = { ...process.env, IMAGE_TAG: tag };
  const started = Date.now();
  const up = spawnSync('docker', [...COMPOSE, 'up', '-d', '--remove-orphans', 'api', 'web', 'ai'], {
    cwd: ROOT, encoding: 'utf8', env,
  });
  return { ok: up.status === 0, out: `${up.stdout ?? ''}${up.stderr ?? ''}`.trim(), seconds: (Date.now() - started) / 1000 };
};

// ───────────────────────── 报告 ─────────────────────────
function writeReport() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(ROOT, 'deploy', 'drill', 'evidence');
  fs.mkdirSync(dir, { recursive: true });
  const criticalFailed = results.filter((r) => r.status === 'fail');
  const payload = {
    generatedAt: new Date().toISOString(),
    mode: OPTIONS.dryRun ? 'dry-run' : 'run',
    envFile: OPTIONS.envFile,
    baseUrl: OPTIONS.baseUrl,
    options: OPTIONS,
    verdict: criticalFailed.length === 0 ? (OPTIONS.dryRun ? 'DRY_RUN_OK' : 'PASS') : 'FAIL',
    steps: results,
  };
  const jsonPath = path.join(dir, `drill-${ts}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf8');

  const md = [
    `# staging 部署演练报告（${payload.mode}）`,
    '',
    `- 时间：${payload.generatedAt}`,
    `- 结论：**${payload.verdict}**`,
    `- env 文件：\`${OPTIONS.envFile}\`${OPTIONS.baseUrl ? ` · 探活地址：${OPTIONS.baseUrl}` : ''}`,
    '',
    '| 步骤 | 说明 | 结果 | 耗时(s) |',
    '|---|---|---|---|',
    ...results.map((r) => `| ${r.id} | ${r.title} | ${r.status === 'ok' ? '✅' : r.status === 'fail' ? '❌' : r.status.toUpperCase()} | ${r.seconds != null ? r.seconds.toFixed(1) : '—'} |`),
    '',
    '## 明细',
    '',
    ...results.flatMap((r) => [`### ${r.id} — ${r.title} (${r.status})`, '', '```', r.detail || '(无输出)', '```', '']),
    '## 粘贴进 production-progress 的证据模板',
    '',
    '```',
    ...results
      .filter((r) => ['migrate', 'ps', 'smoke', 'restore', 'rollback'].some((k) => r.id.startsWith(k)))
      .map((r) => `${new Date().toISOString().slice(0, 10)} | ${r.id} | ${r.status}${r.seconds != null ? `（${r.seconds.toFixed(1)}s）` : ''}`),
    '```',
  ].join('\n');
  const mdPath = path.join(dir, `drill-${ts}.md`);
  fs.writeFileSync(mdPath, md, 'utf8');
  console.log(`\n报告已写出：\n  ${path.relative(ROOT, jsonPath)}\n  ${path.relative(ROOT, mdPath)}`);
  return payload;
}

// ───────────────────────── 主流程 ─────────────────────────
async function main() {
  printPlan();
  const preflightOk = stepPreflight();

  if (OPTIONS.dryRun) {
    // dry-run：静态检查通过即视为 OK（Docker 缺失仅 WARN）
    const staticFail = results.some((r) => r.status === 'fail');
    record('dry-run', '静态前置检查（不执行 Docker 步骤）', staticFail ? 'fail' : 'ok', '计划已打印；真跑请在 Docker 主机去掉 --dry-run', null);
    const payload = writeReport();
    process.exit(payload.verdict === 'FAIL' ? 1 : 0);
  }

  if (!preflightOk) {
    record('abort', '前置检查失败，演练中止', 'fail', '修复 preflight 失败项后重跑', null);
    writeReport();
    process.exit(1);
  }

  for (const step of steps) {
    const r = step.cmd();
    record(step.id, step.title, r.ok ? 'ok' : 'fail', r.out, r.seconds);
    if (!r.ok && step.critical) {
      record('abort', `关键步骤 ${step.id} 失败，演练中止`, 'fail', '修复后重跑；报告已保留失败明细', null);
      writeReport();
      process.exit(1);
    }
  }

  const base = OPTIONS.baseUrl ?? `https://${readEnvFile(OPTIONS.envFile).vars.DOMAIN ?? 'localhost'}`;
  const smoke = stepSmoke(base);
  record('smoke', '公网冒烟（/health + 首页 + /metrics 403）', smoke.ok ? 'ok' : 'fail', smoke.details.join('\n'), smoke.seconds);

  const backup = runBackup();
  record('backup', '备份（容器内 backup.sh → dump）', backup.ok ? 'ok' : 'fail', backup.out, backup.seconds);

  const restore = runRestoreDrill();
  record('restore', '隔离库恢复演练 + 一致性校验（§4.1 #4）', restore.ok ? 'ok' : 'fail', restore.out, restore.seconds);

  if (OPTIONS.skipRollback) {
    record('rollback', '回滚预案演练', 'skip', '按 --skip-rollback 跳过');
  } else {
    const rb = runRollback(OPTIONS.rollbackTag);
    record('rollback', '回滚预案演练（旧 IMAGE_TAG 滚动）', rb.ok ? 'ok' : 'fail', rb.out, rb.seconds);
  }

  const payload = writeReport();
  console.log(`\n演练结论：${payload.verdict}`);
  process.exit(payload.verdict === 'PASS' ? 0 : 1);
}

main().catch((err) => {
  record('fatal', '演练脚本异常', 'fail', err?.stack ?? String(err));
  try {
    writeReport();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
