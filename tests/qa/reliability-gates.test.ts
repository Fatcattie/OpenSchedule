'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const API_SRC = path.join(ROOT, 'services', 'api', 'src');

function read(relPath) {
  const p = path.join(API_SRC, relPath);
  assert.ok(fs.existsSync(p), `可靠性骨架文件不存在: ${relPath}`);
  return fs.readFileSync(p, 'utf8');
}

function readRoot(relPath) {
  const p = path.join(ROOT, relPath);
  assert.ok(fs.existsSync(p), `仓库文件不存在: ${relPath}`);
  return fs.readFileSync(p, 'utf8');
}

function run() {
  // FR-R3-01：Outbox 已注册为 provider（@Global，全模块可注入）并接入 BullMQ worker
  const commonModule = read('common/common.module.ts');
  assert.match(commonModule, /OutboxService,/, 'OutboxService 必须注册为 provider');
  assert.match(commonModule, /OutboxDispatcher,/, 'OutboxDispatcher 必须注册为 provider（随 app bootstrap 启动）');
  assert.match(commonModule, /exports:.*OutboxService/, 'OutboxService 必须 export（业务模块事务内发布依赖注入）');

  // FR-R3-02：OutboxDispatcher 必须启动 BullMQ worker（否则 repeatable job 只有生产者没有消费者）
  const dispatcher = read('common/outbox/outbox.dispatcher.ts');
  assert.match(dispatcher, /startWorker\(\s*'outbox'/, 'OutboxDispatcher 必须 startWorker("outbox")');
  assert.match(dispatcher, /setInterval/, 'Outbox 必须保留 DB 兜底扫描（§2.5 可靠性：Redis 宕机事件不丢）');

  // FR-R3-03：关键事件必须改由 Outbox 事务内发布（tasks 模块为检查点；旧 post-commit emit 不得残留）
  const tasksService = read('modules/tasks/tasks.service.ts');
  assert.match(tasksService, /this\.outbox\.publish\(/, 'tasks 模块关键事件必须经 outbox.publish 落库');
  assert.match(tasksService, /publish\([^;]*tx\)/, 'outbox.publish 必须支持事务客户端（§3.4 事务性 Outbox）');
  assert.doesNotMatch(tasksService, /eventBus\?\.emit\(TASK_EVENTS\.STATUS_CHANGED/, 'post-commit task.status_changed emit 必须移除（改走 Outbox，防订阅者收到两次）');
  assert.doesNotMatch(tasksService, /eventBus\?\.emit\(TASK_EVENTS\.COMPLETED/, 'post-commit task.completed emit 必须移除（改走 Outbox）');
  assert.doesNotMatch(tasksService, /eventBus\?\.emit\(TASK_EVENTS\.CREATED/, 'post-commit task.created emit 必须移除（改走 Outbox）');
  assert.doesNotMatch(tasksService, /eventBus\?\.emit\(TASK_EVENTS\.ASSIGNED/, 'post-commit task.assigned emit 必须移除（改走 Outbox）');

  // FR-R3-04：notification.failed 必须有 @OnEvent 订阅者（§2.5 订阅表：BC-07 重试闭环）
  const failedListener = read('modules/notifications/notification-failed.listener.ts');
  assert.match(failedListener, /@OnEvent\(NOTIFICATION_EVENTS\.FAILED\)/, 'notification.failed 必须注册 @OnEvent 监听');
  const notificationsModule = read('modules/notifications/notifications.module.ts');
  assert.match(notificationsModule, /NotificationFailedListener/, 'NotificationFailedListener 必须挂入 NotificationsModule');

  // FR-R3-05：BullMQ repeatable 接线保留 DB 兜底（reminders / notifications-retry 双保险，工程决策 4）
  for (const [file, marker] of [
    ['modules/reminders/reminders.worker.ts', /startWorker\(\s*'reminders'/],
    ['modules/notifications/notifications-retry.worker.ts', /startWorker\(\s*'notifications'/],
  ]) {
    const code = read(file);
    assert.match(code, marker, `${file} 必须接 BullMQ startWorker（§3.4 后台任务队列化）`);
    assert.match(code, /setInterval/, `${file} 必须保留 setInterval DB 兜底扫描`);
  }

  // FR-R3-06：阻塞>72h 升级扫描器存在并接入 Outbox/通知链路
  const escalationWorker = read('modules/tasks/task-escalation.worker.ts');
  assert.match(escalationWorker, /isBlockedEscalationDue/, '阻塞升级 worker 必须复用纯函数判定（task-escalation.policy）');
  assert.match(escalationWorker, /startWorker\(\s*'tasks'/, '阻塞升级 worker 必须接 BullMQ');
  const tasksModule = read('modules/tasks/tasks.module.ts');
  assert.match(tasksModule, /TaskEscalationWorker/, 'TaskEscalationWorker 必须挂入 TasksModule');

  // FR-R3-07：ai.proposal.expired 过期扫描器（§2.5 订阅表：到期自动 expired 并通知提议人，INV-7）
  const expiryWorker = read('modules/proposals/proposals-expiry.worker.ts');
  assert.match(expiryWorker, /AI_PROPOSAL_EVENTS\.EXPIRED/, '过期扫描器必须发布 ai.proposal.expired（domain-events 契约）');
  const proposalsModule = read('modules/proposals/proposals.module.ts');
  assert.match(proposalsModule, /ProposalsExpiryWorker/, 'ProposalsExpiryWorker 必须挂入 ProposalsModule');

  // FR-R3-08：健康检查分层（§3.4.4：liveness 轻 / readiness 探 DB+Redis+队列）
  const healthController = read('common/health/health.controller.ts');
  assert.match(healthController, /@Get\('ready'\)/, '必须新增 /health/ready 端点（readiness 探针）');
  assert.match(healthController, /redis/, 'readiness 必须探 Redis');
  const main = readRoot('services/api/src/main.ts');
  assert.match(main, /exclude:\s*\[[^\]]*health\/ready[^\]]*\]/, 'main.ts 必须把 health/ready 排除出 /api/v1 前缀');

  // FR-R3-09：Task schema 增加 blocked_at / block_escalated_at（阻塞升级时间戳 + 去重标记）
  const schema = readRoot('services/api/prisma/schema.prisma');
  assert.match(schema, /blockedAt\s+DateTime\?\s+@map\("blocked_at"\)/, 'Task 必须新增 blocked_at 字段');
  assert.match(schema, /blockEscalatedAt\s+DateTime\?\s+@map\("block_escalated_at"\)/, 'Task 必须新增 block_escalated_at 字段（防重复升级）');
  const migrationDir = path.join(ROOT, 'services', 'api', 'prisma', 'migrations');
  const migration = fs.readdirSync(migrationDir).find((d) => d.startsWith('2026') && /blocked_escalation|task_blocked/i.test(d));
  assert.ok(migration, '必须存在 Task blocked_escalation 的正式 migration 目录');
  const migrationSql = readRoot(path.join('services', 'api', 'prisma', 'migrations', migration, 'migration.sql'));
  assert.match(migrationSql, /ALTER TABLE "tasks" ADD COLUMN "blocked_at"/, 'migration 必须包含 blocked_at DDL');
  assert.match(migrationSql, /ALTER TABLE "tasks" ADD COLUMN "block_escalated_at"/, 'migration 必须包含 block_escalated_at DDL');

  console.log('reliability-gates: FR-R3-01..09 contract assertions passed');
}

run();
