/**
 * 链路 4/4：任务生命周期写链（§3.3 状态机 T1/T4/T9 全链路）
 *   建项目(setup) → 建任务(todo) → PATCH in_progress(T1) → complete(T4) → reopen(T9)
 *
 * 每次迁移都带 version（§3.1 乐观锁），version 从「响应 → 回读列表」两级兜底取得，
 * 与前端「写后重取」的交互一致。期望状态码：POST 201、PATCH/POST 动作 200/201。
 * 运行：k6 run qa-load/k6/04-task-flow.js -e BASE_URL=http://localhost:3000/api/v1
 */
import { check, sleep } from 'k6';
import { bootstrapAccount, createProject, createTask, listTasks, items, api, data, THRESHOLDS, VUS, DURATION } from './lib.js';

export const options = {
  vus: VUS,
  duration: DURATION,
  thresholds: THRESHOLDS,
  tags: { chain: 'task-flow' },
};

export function setup() {
  const acct = bootstrapAccount();
  if (!acct.token) throw new Error('setup 失败：未能取得访问令牌');
  const project = createProject(acct.token, '压测项目-' + Date.now().toString(36));
  if (project.status !== 201 || !project.id) throw new Error('setup 建项目失败：' + project.status);
  return { token: acct.token, projectId: project.id };
}

/** 按标题回读任务的 {id, version}（响应用不上时兜底） */
function findTask(token, projectId, title) {
  const listed = listTasks(token, projectId, title);
  const hit = items(listed).filter(function (t) {
    return t && t.title === title;
  })[0];
  return hit ? { id: hit.id, version: hit.version } : null;
}

export default function (ctx) {
  const title = '压测任务-' + __VU + '-' + __ITER + '-' + Date.now();

  // ① 建任务 → todo
  const created = createTask(ctx.token, ctx.projectId, title);
  check(created, { '建任务 201': (r) => r.status === 201 });
  if (created.status !== 201) return;

  let task = data(created);
  if (!task || !task.id || task.version === undefined) task = findTask(ctx.token, ctx.projectId, title);
  if (!task || !task.id) {
    check(null, { '取到新任务 id/version': () => false });
    return;
  }

  // ② T1 todo → in_progress
  const start = api('PATCH', '/tasks/' + task.id, {
    token: ctx.token,
    body: { version: task.version, status: 'in_progress' },
    tags: { op: 'task.transition' },
  });
  check(start, { 'T1 → in_progress 200': (r) => r.status === 200 });

  let after = data(start);
  if (!after || after.version === undefined) after = findTask(ctx.token, ctx.projectId, title);
  if (!after || after.version === undefined) return;

  // ③ T4 in_progress → done（★D3：必须落 actual_hours）
  const done = api('POST', '/tasks/' + task.id + '/complete', {
    token: ctx.token,
    body: { version: after.version, actualHours: 1, summary: '压测完成' },
    tags: { op: 'task.complete' },
  });
  check(done, { 'T4 → done 201/200': (r) => r.status === 200 || r.status === 201 });

  let doneTask = data(done);
  if (!doneTask || doneTask.version === undefined) doneTask = findTask(ctx.token, ctx.projectId, title);
  if (!doneTask || doneTask.version === undefined) return;

  // ④ T9 done → todo（重开，reason ≥ 4 字符）
  const reopen = api('POST', '/tasks/' + task.id + '/reopen', {
    token: ctx.token,
    body: { version: doneTask.version, reason: '压测重开：验证 T9 迁移' },
    tags: { op: 'task.reopen' },
  });
  check(reopen, { 'T9 → todo 201/200': (r) => r.status === 200 || r.status === 201 });

  sleep(0.3);
}
