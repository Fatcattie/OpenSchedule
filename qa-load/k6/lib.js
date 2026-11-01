/**
 * 压测公共库（R12「k6 四链路」共用）
 *
 * 运行环境：k6（goja JS 运行时）——**无 Node API**，只可用 k6/http、k6/metrics 与 __ENV。
 * 契约来源：services/api/src/openapi/{auth,workspace}.yaml 与 modules/tasks 的 create-task / complete-task DTO。
 */
import http from 'k6/http';
import { Rate, Trend } from 'k6/metrics';

export const BASE = (__ENV.BASE_URL || 'http://localhost:3000/api/v1').replace(/\/+$/, '');
export const PASSWORD = __ENV.LOAD_PASSWORD || 'LoadTest!234';
export const VUS = Number(__ENV.VUS || 10);
export const DURATION = __ENV.DURATION || '30s';
export const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** 三条写/读链路共用阈值：首屏可用性口径 p95<800ms、p99<2s、错误率<1% */
export const THRESHOLDS = {
  http_req_failed: ['rate<0.01'],
  http_req_duration: ['p(95)<800', 'p(99)<2000'],
  checks: ['rate>0.99'],
};

/** 429（限流）：设计行为，单机压测必现；只上报不阻断 */
export const throttledRate = new Rate('load_throttled');
/** 40901（乐观锁冲突）：并发写预期结果之一；只上报不阻断 */
export const conflictRate = new Rate('load_version_conflict');
/** 仅统计成功响应（2xx）的业务延迟，避免把 429 的极快返回混进 p95 */
export const businessLatency = new Trend('load_business_latency', true);

export function api(method, path, opts) {
  const o = opts || {};
  const headers = Object.assign({}, JSON_HEADERS);
  if (o.token) headers.Authorization = 'Bearer ' + o.token;
  const params = {
    headers: headers,
    tags: o.tags || {},
    timeout: '15s',
  };
  // 声明「预期状态码」：k6 只把非预期状态记为 http_req_failed（用于 429/409 属预期的链路）
  if (o.expected && o.expected.length) params.responseCallback = http.expectedStatuses.apply(null, o.expected);
  return http.request(method, BASE + path, o.body === undefined ? null : JSON.stringify(o.body), params);
}

export function body(res) {
  try {
    return res.json();
  } catch (e) {
    return null;
  }
}

export function data(res) {
  const b = body(res);
  return b && b.data !== undefined ? b.data : null;
}

/** 兼容两种列表信封：data 为数组（projects/:id/tasks）或 data.items（workspace 集合） */
export function items(res) {
  const d = data(res);
  if (!d) return [];
  if (Array.isArray(d)) return d;
  return d.items || [];
}

/** 注册新租户（返回管理员令牌） */
export function registerAccount(prefix) {
  const nonce = (prefix || 'load') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  const email = nonce + '@load.test';
  const res = api('POST', '/auth/register', {
    body: { email: email, password: PASSWORD, displayName: '压测管理员', tenantName: '压测租户-' + nonce },
    tags: { op: 'auth.register' },
  });
  const d = data(res);
  return {
    email: email,
    password: PASSWORD,
    token: d && d.accessToken,
    userId: d && d.user && d.user.id,
    tenantId: d && d.tenant && d.tenant.id,
    status: res.status,
    res: res,
  };
}

export function loginAccount(email, password) {
  const res = api('POST', '/auth/login', {
    body: { email: email, password: password },
    tags: { op: 'auth.login' },
  });
  const d = data(res);
  return { token: d && d.accessToken, userId: d && d.user && d.user.id, status: res.status, res: res };
}

/** setup 用：优先复用 LOAD_EMAIL/LOAD_PASSWORD（避免每次压测造租户），否则注册一个新租户 */
export function bootstrapAccount() {
  if (__ENV.LOAD_EMAIL && __ENV.LOAD_PASSWORD) {
    const r = loginAccount(__ENV.LOAD_EMAIL, __ENV.LOAD_PASSWORD);
    return { email: __ENV.LOAD_EMAIL, password: __ENV.LOAD_PASSWORD, token: r.token, userId: r.userId, status: r.status, reused: true };
  }
  const r = registerAccount('load');
  return { email: r.email, password: r.password, token: r.token, userId: r.userId, status: r.status, reused: false };
}

export function createProject(token, name) {
  const res = api('POST', '/projects', { token: token, body: { name: name }, tags: { op: 'project.create' } });
  const d = data(res);
  return { id: d && d.id, status: res.status, res: res };
}

export function createTask(token, projectId, title) {
  return api('POST', '/projects/' + projectId + '/tasks', {
    token: token,
    body: { title: title },
    tags: { op: 'task.create' },
  });
}

export function listTasks(token, projectId, search) {
  const q = '?view=flat&page=1&pageSize=100' + (search ? '&search=' + encodeURIComponent(search) : '');
  return api('GET', '/projects/' + projectId + '/tasks' + q, { token: token, tags: { op: 'task.list' } });
}

/** 工作台集合批量写（D-07 / §3.5.4 apply 原子性：upserts + deletes 一次提交） */
export function applyWorkspaceBatch(token, collection, payload, expected) {
  return api('PUT', '/workspace/' + collection, {
    token: token,
    body: payload,
    tags: { op: 'workspace.apply' },
    expected: expected,
  });
}

export function listWorkspace(token, collection) {
  return api('GET', '/workspace/' + collection, { token: token, tags: { op: 'workspace.list' } });
}

/** 生成 N 条工作台任务文档（种子，用于读/写链路都有真实数据面） */
export function seedTaskDocs(n, prefix) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      key: prefix + '-' + i,
      data: {
        id: prefix + '-' + i,
        title: '压测种子任务 ' + i,
        status: 'todo',
        priority: 'medium',
        createdAt: new Date().toISOString(),
      },
    });
  }
  return out;
}
