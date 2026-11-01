/**
 * 链路 3/4：工作台写链（apply 批量写 + 乐观锁冲突面）
 *   PUT /workspace/tasks  { upserts:[{key,data,baseVersion}], deletes:[{key,baseVersion}] }
 *
 * 语义：upsert baseVersion=null 为新建；携带旧 version 为「读-改-写」，并发下必然出现 40901。
 *      40901 是**设计行为**（前端据此刷新重试），据此声明 409 为预期状态并计入 load_version_conflict。
 * 运行：k6 run qa-load/k6/03-workspace-write.js -e BASE_URL=http://localhost:3000/api/v1
 */
import { check, sleep } from 'k6';
import { bootstrapAccount, applyWorkspaceBatch, listWorkspace, items, data, THRESHOLDS, VUS, DURATION, conflictRate, businessLatency } from './lib.js';

export const options = {
  vus: VUS,
  duration: DURATION,
  thresholds: Object.assign({}, THRESHOLDS, { load_version_conflict: ['rate<1'] }),
  tags: { chain: 'workspace-write' },
};

const EXPECTED = [200, 409];

export function setup() {
  const acct = bootstrapAccount();
  if (!acct.token) throw new Error('setup 失败：未能取得访问令牌');
  const seed = applyWorkspaceBatch(acct.token, 'tasks', {
    upserts: [{ key: 'load-write-contended', data: { id: 'load-write-contended', title: '并发争用条目', status: 'todo' } }],
    deletes: [],
  });
  if (seed.status !== 200) throw new Error('setup 播种失败：' + seed.status);
  return { token: acct.token };
}

export default function (ctx) {
  const mine = 'load-write-' + __VU + '-' + __ITER;

  // ① 新建（baseVersion=null）
  const create = applyWorkspaceBatch(
    ctx.token,
    'tasks',
    { upserts: [{ key: mine, data: { id: mine, title: '压测写入 ' + mine, status: 'todo', priority: 'medium' }, baseVersion: null }], deletes: [] },
    EXPECTED,
  );
  check(create, { '新建条目 200': (r) => r.status === 200 });
  conflictRate.add(create.status === 409);
  if (create.status === 200) businessLatency.add(create.timings.duration);

  // ② 读-改-写：读回真实 version 后回写（并发 VU 争用同一条目 → 冲突面）
  const listed = listWorkspace(ctx.token, 'tasks');
  const entries = items(listed);
  const contended = entries.filter(function (it) {
    return it && it.key === 'load-write-contended';
  })[0];
  if (contended) {
    const update = applyWorkspaceBatch(
      ctx.token,
      'tasks',
      { upserts: [{ key: 'load-write-contended', data: { id: 'load-write-contended', title: '并发争用条目', status: 'todo', touchedBy: mine }, baseVersion: contended.version }], deletes: [] },
      EXPECTED,
    );
    check(update, { '改条目 200 或 409（乐观锁）': (r) => r.status === 200 || r.status === 409 });
    conflictRate.add(update.status === 409);
  }

  // ③ 删除自己刚建的条目（deletes.baseVersion 必填：优先取 create 返回值，否则从列表读回）
  const created = data(create);
  const first = created && created.items && created.items[0] ? created.items[0] : null;
  const mineEntry = entries.filter(function (it) {
    return it && it.key === mine;
  })[0];
  const version = (first && first.key === mine && first.version) || (mineEntry && mineEntry.version) || null;
  if (version === null) {
    check(null, { '取到新建条目的 version（供 delete 乐观锁）': () => false });
  } else {
    const del = applyWorkspaceBatch(ctx.token, 'tasks', { upserts: [], deletes: [{ key: mine, baseVersion: version }] }, EXPECTED);
    check(del, { '删除条目 200 或 409': (r) => r.status === 200 || r.status === 409 });
  }

  sleep(0.3);
}
