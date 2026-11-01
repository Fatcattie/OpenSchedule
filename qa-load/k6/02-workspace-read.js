/**
 * 链路 2/4：工作台读链（最高频，SPA 首屏）
 *   GET /workspace/tasks（租户共享集合，条目含乐观锁 version）
 *   GET /workspace/sops
 *   GET /workspace/directory（成员目录）
 *
 * setup 会为租户播种 50 条任务文档，保证读链路读的是**有数据**的集合（空集合不具代表性）。
 * 运行：k6 run qa-load/k6/02-workspace-read.js -e BASE_URL=http://localhost:3000/api/v1
 */
import { check, sleep } from 'k6';
import { bootstrapAccount, applyWorkspaceBatch, listWorkspace, items, api, THRESHOLDS, VUS, DURATION, seedTaskDocs } from './lib.js';

export const options = {
  vus: VUS,
  duration: DURATION,
  thresholds: THRESHOLDS,
  tags: { chain: 'workspace-read' },
};

export function setup() {
  const acct = bootstrapAccount();
  if (!acct.token) throw new Error('setup 失败：未能取得访问令牌（检查 BASE_URL 与限流）');
  const seed = applyWorkspaceBatch(acct.token, 'tasks', { upserts: seedTaskDocs(50, 'load-read'), deletes: [] });
  if (seed.status !== 200) throw new Error('setup 播种失败：PUT /workspace/tasks -> ' + seed.status);
  return { token: acct.token };
}

export default function (ctx) {
  const tasks = listWorkspace(ctx.token, 'tasks');
  check(tasks, { 'GET /workspace/tasks 200': (r) => r.status === 200 });
  check(null, { 'tasks 非空（读的是有数据面）': () => items(tasks).length > 0 });

  const sops = listWorkspace(ctx.token, 'sops');
  check(sops, { 'GET /workspace/sops 200': (r) => r.status === 200 });

  const dir = api('GET', '/workspace/directory', { token: ctx.token, tags: { op: 'workspace.directory' } });
  check(dir, { 'GET /workspace/directory 200': (r) => r.status === 200 });

  sleep(0.3);
}
