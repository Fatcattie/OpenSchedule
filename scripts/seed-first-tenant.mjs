#!/usr/bin/env node
// ============================================================
// 首个租户初始化脚本（R12「种子/初始化数据脚本（首个租户创建）」）
//
// 设计原则：**只走公开 API，不直连数据库**——这样种子数据天然满足租户隔离、
//           审计、密码策略、限流等全部应用不变量，也不会因 schema 漂移而失效。
// 幂等性：重复执行不报错也不重复造数据：
//           - 注册 409（API 对重复注册返回 409 + code 40001）→ 转为登录复用；
//           - 成员 409 → 记为复用；
//           - 演示项目按名称回查后再建；演示工作台条目用固定 key（upsert）。
//
// 用法：
//   node scripts/seed-first-tenant.mjs --tenant "示例公司" --admin admin@example.com --password 'Str0ng!Pass'
//   node scripts/seed-first-tenant.mjs --members 3 --demo        # 建 3 个成员 + 演示数据
//   node scripts/seed-first-tenant.mjs --selftest                # 本地假 API 自检（无需服务/数据库）
//
// 环境变量：SEED_BASE_URL（默认 http://localhost:3000/api/v1）、SEED_TENANT_NAME、
//           SEED_ADMIN_EMAIL、SEED_ADMIN_PASSWORD、SEED_MEMBER_COUNT、SEED_DEMO_DATA=1
// ============================================================
import http from 'node:http';
import process from 'node:process';

const DEMO_PROJECT_NAME = '[示例] 新人上手项目';
const DEMO_TASK_KEYS = ['seed-demo-1', 'seed-demo-2', 'seed-demo-3'];

export const DEFAULTS = {
  baseUrl: process.env.SEED_BASE_URL || 'http://localhost:3000/api/v1',
  tenantName: process.env.SEED_TENANT_NAME || '示例租户',
  adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@example.com',
  adminPassword: process.env.SEED_ADMIN_PASSWORD || '',
  memberCount: Number(process.env.SEED_MEMBER_COUNT || 0),
  memberPassword: process.env.SEED_MEMBER_PASSWORD || '',
  demo: process.env.SEED_DEMO_DATA === '1',
};

const noop = () => {};

/** 核心流程（可注入 fetch，便于自检时指向本地假 API） */
export async function runSeed(opts, io = {}) {
  const log = io.log || noop;
  const fetchImpl = io.fetch || globalThis.fetch;
  const base = String(opts.baseUrl).replace(/\/+$/, '');
  const steps = [];
  const push = (step, status, detail) => {
    steps.push({ step, status, detail: detail === undefined ? '' : String(detail).slice(0, 500) });
    log(`[${status === 'ok' ? 'PASS' : 'FAIL'}] ${step}${detail ? ' — ' + detail : ''}`);
  };

  const req = async (method, path, { token, body } = {}) => {
    const res = await fetchImpl(base + path, {
      method,
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: `Bearer ${token}` } : {}),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, json, data: json && json.data !== undefined ? json.data : null };
  };

  // ① 健康检查（/health 在全局前缀之外）
  const healthUrl = base.replace(/\/api\/v\d+$/, '') + '/health';
  try {
    const res = await fetchImpl(healthUrl, { method: 'GET' });
    push('health', res.ok ? 'ok' : 'fail', `${healthUrl} → ${res.status}`);
    if (!res.ok) return { verdict: 'FAIL', reason: '健康检查未通过', steps };
  } catch (err) {
    push('health', 'fail', `${healthUrl} → ${err.message}`);
    return { verdict: 'FAIL', reason: 'API 不可达', steps };
  }

  // ② 注册租户（重复则登录复用）
  const reg = await req('POST', '/auth/register', {
    body: { email: opts.adminEmail, password: opts.adminPassword, displayName: '租户管理员', tenantName: opts.tenantName },
  });
  let token = reg.data && reg.data.accessToken;
  let registered = reg.status === 201;
  let login = reg.status === 409 ? await req('POST', '/auth/login', { body: { email: opts.adminEmail, password: opts.adminPassword } }) : null;
  if (!registered && login) token = login.data && login.data.accessToken;
  if (!token) {
    push('auth', 'fail', `注册 ${reg.status} / 登录 ${login ? login.status : '-'}（响应：${JSON.stringify(reg.json).slice(0, 200)}）`);
    return { verdict: 'FAIL', reason: '未能取得租户管理员令牌（检查口令策略/限流）', steps };
  }
  push('auth', 'ok', registered ? `已注册租户「${opts.tenantName}」` : `租户已存在，登录复用`);
  const adminId = (reg.data && reg.data.user && reg.data.user.id) || (login && login.data && login.data.user && login.data.user.id) || null;
  const tenantId = (reg.data && reg.data.tenant && reg.data.tenant.id) || null;

  // ③ 成员（可选）：代建 + 复用
  const members = { requested: opts.memberCount || 0, created: 0, reused: 0, ids: [] };
  for (let i = 0; i < (opts.memberCount || 0); i++) {
    const email = opts.adminEmail.replace('@', `+member${i + 1}@`);
    const res = await req('POST', '/auth/members', {
      token,
      body: { email, password: opts.memberPassword || opts.adminPassword, displayName: `示例成员 ${i + 1}`, role: 'member' },
    });
    if (res.status === 201) {
      members.created++;
      members.ids.push(res.data && res.data.id);
    } else if (res.status === 409) {
      members.reused++;
    } else {
      push('members', 'fail', `成员 ${email} 创建失败：${res.status} ${JSON.stringify(res.json).slice(0, 160)}`);
      return { verdict: 'FAIL', reason: '成员创建失败', steps };
    }
  }
  if (members.requested > 0) push('members', 'ok', `新建 ${members.created} / 复用 ${members.reused}（共请求 ${members.requested}）`);

  // ④ 演示数据（可选）：项目按名称回查，工作台条目按固定 key upsert
  const demo = { projectId: null, projectCreated: false, seededEntries: 0 };
  if (opts.demo) {
    const search = await req('GET', `/projects?page=1&pageSize=20&search=${encodeURIComponent(DEMO_PROJECT_NAME)}`, { token });
    const found = (search.data || []).filter((p) => p && p.name === DEMO_PROJECT_NAME)[0];
    if (found) {
      demo.projectId = found.id;
    } else {
      const created = await req('POST', '/projects', { token, body: { name: DEMO_PROJECT_NAME, description: '由 seed-first-tenant.mjs 生成的演示项目' } });
      if (created.status !== 201) {
        push('demo', 'fail', `演示项目创建失败：${created.status}`);
        return { verdict: 'FAIL', reason: '演示项目创建失败', steps };
      }
      demo.projectId = created.data && created.data.id;
      demo.projectCreated = true;
    }
    const upserts = DEMO_TASK_KEYS.map((key, i) => ({
      key,
      data: { id: key, title: `示例任务 ${i + 1}`, status: 'todo', priority: i === 0 ? 'high' : 'medium', createdAt: new Date().toISOString() },
      baseVersion: null,
    }));
    const batch = await req('PUT', '/workspace/tasks', { token, body: { upserts, deletes: [] } });
    if (batch.status !== 200) {
      push('demo', 'fail', `工作台演示条目写入失败：${batch.status} ${JSON.stringify(batch.json).slice(0, 160)}`);
      return { verdict: 'FAIL', reason: '工作台演示条目写入失败', steps };
    }
    demo.seededEntries = upserts.length;
    push('demo', 'ok', `项目 ${demo.projectCreated ? '新建' : '复用'}（${demo.projectId}）+ 工作台条目 ${demo.seededEntries} 条（固定 key，幂等）`);
  }

  push('summary', 'ok', '初始化完成');
  return {
    verdict: 'OK',
    baseUrl: base,
    tenant: { name: opts.tenantName, id: tenantId, created: registered, reused: !registered },
    admin: { email: opts.adminEmail, id: adminId, registered, loggedIn: !!login },
    members,
    demo,
    steps,
  };
}

// ───────────────────────── CLI ─────────────────────────
function parseArgs(argv) {
  const has = (f) => argv.includes(f);
  const val = (f, d) => {
    const i = argv.indexOf(f);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
  };
  return {
    selftest: has('--selftest'),
    baseUrl: val('--base-url', DEFAULTS.baseUrl),
    tenantName: val('--tenant', DEFAULTS.tenantName),
    adminEmail: val('--admin', DEFAULTS.adminEmail),
    adminPassword: val('--password', DEFAULTS.adminPassword),
    memberCount: Number(val('--members', String(DEFAULTS.memberCount))),
    memberPassword: val('--member-password', DEFAULTS.memberPassword),
    demo: has('--demo') || DEFAULTS.demo,
  };
}

/** 自检用假 API：实现脚本依赖的最小端点 + 幂等语义，用于验证脚本逻辑（不替代真实服务） */
async function selftest() {
  const state = { tenants: new Set(), members: new Set(), projects: [] };
  const json = (res, status, payload) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://localhost');
      const body = raw ? JSON.parse(raw) : {};
      if (url.pathname === '/health') return json(res, 200, { status: 'ok' });
      if (url.pathname === '/api/v1/auth/register') {
        if (state.tenants.has(body.email)) return json(res, 409, { code: 40001, message: '重复注册' });
        state.tenants.add(body.email);
        return json(res, 201, { data: { accessToken: 'tok-' + body.email, user: { id: 'u-' + body.email }, tenant: { id: 't-' + body.email } } });
      }
      if (url.pathname === '/api/v1/auth/login') return json(res, 201, { data: { accessToken: 'tok-' + body.email, user: { id: 'u-' + body.email } } });
      if (url.pathname === '/api/v1/auth/members') {
        if (state.members.has(body.email)) return json(res, 409, { code: 40001, message: '重复注册' });
        state.members.add(body.email);
        return json(res, 201, { data: { id: 'm-' + body.email } });
      }
      if (url.pathname === '/api/v1/projects' && req.method === 'GET') return json(res, 200, { data: state.projects });
      if (url.pathname === '/api/v1/projects' && req.method === 'POST') {
        const p = { id: 'p1', name: body.name };
        state.projects.push(p);
        return json(res, 201, { data: p });
      }
      if (url.pathname === '/api/v1/workspace/tasks' && req.method === 'PUT') return json(res, 200, { data: { items: (body.upserts || []).map((u) => ({ key: u.key, version: 1 })), deleted: [] } });
      return json(res, 404, { code: 40401 });
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const opts = {
    baseUrl: `http://127.0.0.1:${port}/api/v1`,
    tenantName: '自检租户',
    adminEmail: 'selftest@example.com',
    adminPassword: 'SelfTest!234',
    memberCount: 2,
    memberPassword: 'SelfTest!234',
    demo: true,
  };
  const report = { steps: [], assertions: [] };
  const assert = (name, cond, detail) => {
    report.assertions.push({ name, ok: !!cond, detail });
    console.log(`[${cond ? 'PASS' : 'FAIL'}] 自检断言：${name}${detail ? ' — ' + detail : ''}`);
  };
  try {
    const first = await runSeed(opts);
    report.steps.push({ run: 1, ...first });
    assert('首跑：注册新租户', first.verdict === 'OK' && first.tenant.created === true);
    assert('首跑：成员新建 2 个', first.members.created === 2 && first.members.reused === 0);
    assert('首跑：演示项目新建', first.demo.projectCreated === true);
    const second = await runSeed(opts);
    report.steps.push({ run: 2, ...second });
    assert('二跑：幂等复用（未重复注册）', second.verdict === 'OK' && second.tenant.created === false && second.tenant.reused === true);
    assert('二跑：成员全部复用', second.members.created === 0 && second.members.reused === 2);
    assert('二跑：演示项目复用（未重复建）', second.demo.projectCreated === false && second.demo.projectId === 'p1');
    assert('假 API 仅收到 1 个项目创建', state.projects.length === 1, `projects=${state.projects.length}`);
    const allOk = report.assertions.every((a) => a.ok);
    report.verdict = allOk ? 'SELFTEST_OK' : 'FAIL';
    console.log(`\n自检结论：${report.verdict}`);
    return allOk ? 0 : 1;
  } finally {
    server.close();
  }
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain || process.argv.includes('--selftest')) {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.selftest) {
    process.exit(await selftest());
  }
  if (!opts.adminPassword) {
    console.error('缺少管理员口令：请用 --password 或 SEED_ADMIN_PASSWORD 提供（脚本不设默认口令）');
    process.exit(2);
  }
  const report = await runSeed(opts, { log: (...a) => console.log(...a) });
  console.log('\n' + JSON.stringify(report, null, 2));
  process.exit(report.verdict === 'OK' ? 0 : 1);
}
