'use strict';

/**
 * R5 门禁：通知与提醒实发（§3.2 三通道真实发送 / §3.4 退避重试 / D-04 / D-11 / D-12）。
 * 运行：node --experimental-strip-types tests/qa/notification-gates.test.ts
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const API_SRC = path.join(ROOT, 'services', 'api', 'src');

function read(relPath) {
  const p = path.join(API_SRC, relPath);
  assert.ok(fs.existsSync(p), `R5 文件不存在: ${relPath}`);
  return fs.readFileSync(p, 'utf8');
}

function readRoot(relPath) {
  const p = path.join(ROOT, relPath);
  assert.ok(fs.existsSync(p), `仓库文件不存在: ${relPath}`);
  return fs.readFileSync(p, 'utf8');
}

function run() {
  // FR-R5-01：EmailAdapter 实装（D-04：SMTP 中继抽象，nodemailer 真实出站；禁止 NOT_IMPLEMENTED 残留）
  const emailAdapter = read('modules/notifications/adapters/email.adapter.ts');
  assert.doesNotMatch(emailAdapter, /NOT_IMPLEMENTED/, 'EmailAdapter 不得残留 NOT_IMPLEMENTED 占位');
  assert.match(emailAdapter, /from 'nodemailer'/, 'EmailAdapter 必须经 nodemailer 建立 SMTP 通道');
  assert.match(emailAdapter, /EMAIL_RECIPIENT_MISSING/, '缺收件邮箱必须显式失败（EMAIL_RECIPIENT_MISSING）');
  assert.match(emailAdapter, /EMAIL_ADAPTER_NOT_CONFIGURED/, 'SMTP 未配置必须显式失败（EMAIL_ADAPTER_NOT_CONFIGURED）');
  const emailMessage = read('modules/notifications/adapters/email-message.ts');
  assert.match(emailMessage, /parseSmtpConfig/, 'SMTP 配置解析必须是可单测纯函数');
  assert.match(emailMessage, /SMTP_HOST/, 'SMTP_CONFIG 必须由 SMTP_HOST 判定是否已配置');
  const apiPackage = JSON.parse(readRoot('services/api/package.json'));
  assert.ok(apiPackage.dependencies && apiPackage.dependencies.nodemailer, 'services/api 必须依赖 nodemailer');

  // FR-R5-02：ImAdapter 接 integrations（模块间只经 service 层；mock 降级不得静默假成功）
  const imAdapter = read('modules/notifications/adapters/im.adapter.ts');
  assert.doesNotMatch(imAdapter, /NOT_IMPLEMENTED/, 'ImAdapter 不得残留 NOT_IMPLEMENTED 占位');
  assert.match(imAdapter, /IntegrationsService/, 'ImAdapter 必须注入 integrations 模块出口（service 层交互）');
  assert.match(imAdapter, /integrations\.sendMessage\(/, 'ImAdapter 必须委托 IntegrationsService.sendMessage');
  assert.match(imAdapter, /IM_GATEWAY_UNREACHABLE/, 'mcp 模式下网关降级 mock 必须判失败（防静默假成功）');
  assert.match(imAdapter, /IM_RECIPIENT_MISSING/, '缺 IM 目标必须显式失败');
  const imMessage = read('modules/notifications/adapters/im-message.ts');
  assert.match(imMessage, /expectsRealImDelivery/, '必须存在「是否要求真实 IM 投递」判定纯函数');
  assert.match(imMessage, /NOTIFICATION_IM_PROVIDER/, 'IM 供应商必须可配（NOTIFICATION_IM_PROVIDER，默认 feishu）');
  const notificationsModule = read('modules/notifications/notifications.module.ts');
  assert.match(notificationsModule, /imports:\s*\[IntegrationsModule\]/, 'NotificationsModule 必须 import IntegrationsModule');
  const imInterface = read('modules/integrations/adapters/im-adapter.interface.ts');
  assert.match(imInterface, /channel\?: ImChannel/, 'SendMessageResult 必须回传实际通道（mock 降级可观测）');

  // FR-R5-03：PushAdapter 实装（D-11：web-push 端到端加密出站）+ PushSubscription 订阅存储
  const pushAdapter = read('modules/notifications/adapters/push.adapter.ts');
  assert.doesNotMatch(pushAdapter, /NOT_IMPLEMENTED/, 'PushAdapter 不得残留 NOT_IMPLEMENTED 占位');
  assert.match(pushAdapter, /from 'web-push'/, 'PushAdapter 必须经 web-push 实发（VAPID + aes128gcm）');
  assert.match(pushAdapter, /PUSH_ADAPTER_NOT_CONFIGURED/, 'VAPID 未配置必须显式失败（默认关闭语义）');
  assert.match(pushAdapter, /PUSH_NO_SUBSCRIPTION/, '无订阅必须显式失败（不落死信重试）');
  assert.match(pushAdapter, /PUSH_ALL_SUBSCRIPTIONS_GONE/, '全部订阅失效必须显式失败');
  const pushPayload = read('modules/notifications/adapters/push-payload.ts');
  assert.match(pushPayload, /parseVapidConfig/, 'VAPID 配置解析必须是可单测纯函数');
  assert.match(pushPayload, /shouldPruneSubscription/, '死订阅判定必须是可单测纯函数');
  assert.match(pushPayload, /404/);
  assert.match(pushPayload, /410/);
  assert.ok(apiPackage.dependencies['web-push'], 'services/api 必须依赖 web-push');
  const schema = readRoot('services/api/prisma/schema.prisma');
  assert.match(schema, /model PushSubscription \{/, 'PushSubscription 订阅存储模型必须存在');
  assert.match(schema, /@@map\("push_subscriptions"\)/, 'PushSubscription 必须映射到 push_subscriptions 表');
  const migrationDir = path.join(ROOT, 'services', 'api', 'prisma', 'migrations');
  const pushMigration = fs.readdirSync(migrationDir).find((d) => d.startsWith('2026') && /push_subscriptions/i.test(d));
  assert.ok(pushMigration, '必须存在 push_subscriptions 的正式 migration 目录');
  const pushSql = readRoot(path.join('services', 'api', 'prisma', 'migrations', pushMigration, 'migration.sql'));
  assert.match(pushSql, /CREATE TABLE "push_subscriptions"/, 'migration 必须包含 push_subscriptions DDL');
  assert.match(pushSql, /"tenant_id" UUID NOT NULL/, 'push_subscriptions 必须含 tenant_id（铁律）');

  // FR-R5-04：免打扰补发口径（D-12：窗口内挂起 pending，窗口结束补发；重试扫描覆盖 pending）
  const quietHours = read('modules/notifications/quiet-hours.ts');
  assert.match(quietHours, /export function inQuietHours/, '免打扰判定必须是可单测纯函数');
  assert.match(quietHours, /export function quietHoursEnd/, '窗口结束时刻计算必须是可单测纯函数');
  const service = read('modules/notifications/notifications.service.ts');
  assert.match(service, /inQuietHours\(/, '路由/重试必须执行免打扰判定');
  assert.match(service, /nextRetryAt: until/, '免打扰挂起必须把 nextRetryAt 指向窗口结束（D-12 补发口径）');
  assert.match(service, /channel, status: 'pending'/, '免打扰挂起落投递记录必须为 pending（不消耗尝试次数）');
  assert.match(service, /status: \{ in: \['pending', 'failed'\] \}, nextRetryAt: \{ lte: now \}/, '重试扫描必须同时覆盖 pending（挂起补发）与 failed（失败重试）');

  // FR-R5-05：退避重试与终败收敛（MAX_DELIVERY_ATTEMPTS + nextRetryAt=null + §8.1 信封）
  assert.match(service, /export const MAX_DELIVERY_ATTEMPTS = 8/, '必须导出终败上限常量（8 次后停止自动重试）');
  assert.match(service, /terminal \? null : nextRetryAt\(attempts\)/, '达上限必须置 nextRetryAt=null（终态收敛）');
  assert.match(service, /buildEventEnvelope\(/, 'notification.failed 必须携带 §8.1 事件信封');
  assert.match(service, /notificationId: notification\.id/, 'notification.failed 必须含 notificationId');
  assert.match(service, /deliveryId,/, 'notification.failed 必须含 deliveryId');
  assert.match(service, /retryAt \? retryAt\.toISOString\(\) : null/, 'notification.failed 的 nextRetryAt 必须可表达终败（null）');
  const retryWorker = read('modules/notifications/notifications-retry.worker.ts');
  assert.match(retryWorker, /retryDueDeliveries/, '重试 worker 必须调用 retryDueDeliveries');
  assert.match(retryWorker, /NOTIFICATION_RETRY_INTERVAL_MS/, '重试间隔必须可配（NOTIFICATION_RETRY_INTERVAL_MS）');
  const retryPolicy = read('modules/notifications/retry-policy.ts');
  assert.match(retryPolicy, /export function nextRetryAt/, '退避策略必须是可单测纯函数');

  // FR-R5-06：WebPush 订阅 API（三端点）+ 注册前 SSRF 校验
  const controller = read('modules/notifications/notifications.controller.ts');
  assert.match(controller, /@Get\('notifications\/push-subscriptions'\)/, '必须有订阅列表端点');
  assert.match(controller, /@Post\('notifications\/push-subscriptions'\)/, '必须有订阅注册端点');
  assert.match(controller, /@Delete\('notifications\/push-subscriptions'\)/, '必须有订阅注销端点');
  const dto = read('modules/notifications/dto/push-subscription.dto.ts');
  assert.match(dto, /SubscribePushSubscriptionDto/, '订阅注册 DTO 必须存在');
  assert.match(dto, /@IsUrl\(/, '订阅端点必须做 URL 形状校验');
  assert.match(service, /assertSafeOutboundUrl\(dto\.endpoint\)/, '订阅端点落库前必须经 SSRF 防护校验（出站 POST 目标）');

  // FR-R5-07：适配器契约（channel=目标通道 + 收件人信息由 Service 组装，适配器不查业务表）
  const interfaceSrc = read('modules/notifications/adapters/notification-adapter.interface.ts');
  assert.match(interfaceSrc, /channel: string/, 'OutboundNotification.channel 必须为具体目标通道');
  assert.match(interfaceSrc, /recipientEmail: string \| null/, 'OutboundNotification 必须携带收件邮箱');
  assert.match(interfaceSrc, /timezone: string \| null/, 'OutboundNotification 必须携带收件人时区（免打扰语义）');
  assert.match(interfaceSrc, /send\(notification: OutboundNotification, delivery: DeliveryRecord\)/, 'send 契约必须携带投递记录（failed 落库元数据）');

  // FR-R5-08：环境样例齐全（真实投递的前置开关必须可发现）
  for (const rel of ['.env.example', 'services/api/.env.example']) {
    const env = readRoot(rel);
    for (const key of ['SMTP_HOST', 'MAIL_FROM', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'NOTIFICATION_IM_PROVIDER', 'INTEGRATION_FEISHU_MODE', 'INTEGRATION_DINGTALK_MODE', 'MCP_GATEWAY_URL', 'NOTIFICATION_RETRY_INTERVAL_MS']) {
      assert.match(env, new RegExp(`^${key}=`, 'm'), `${rel} 缺少环境变量样例: ${key}`);
    }
  }

  // FR-R5-09：验收单测规模（§3.2：偏好路由/免打扰单测 ≥10 例；三通道各有真实投递集成测试）
  const quietSpec = read('modules/notifications/quiet-hours.spec.ts');
  const itCount = (quietSpec.match(/\bit\(/g) ?? []).length;
  assert.ok(itCount >= 10, `quiet-hours.spec.ts 单测例数必须 ≥10（当前 ${itCount}）`);
  const routingSpec = read('modules/notifications/notification-routing.spec.ts');
  assert.match(routingSpec, /enabledOutboundChannels/, '偏好路由必须有专项单测');
  for (const spec of [
    'modules/notifications/adapters/email.adapter.spec.ts',
    'modules/notifications/adapters/im.adapter.spec.ts',
    'modules/notifications/adapters/push.adapter.spec.ts',
  ]) {
    read(spec);
  }
  const tlsFixture = readRoot('services/api/test/fixtures/self-signed-localhost.crt.pem');
  assert.match(tlsFixture, /BEGIN CERTIFICATE/, 'Push 真实投递测试必须使用本地 TLS 服务（自签证书 fixture）');

  console.log('notification-gates: FR-R5-01..09 contract assertions passed');
}

run();
