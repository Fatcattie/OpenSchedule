/**
 * WebPush 通道适配器（R5-3 / D-11）：web-push 实发（VAPID JWT + aes128gcm 端到端加密）。
 * 无 VAPID 配置 → 未启用；无订阅 → 通道不可达（路由层不落投递记录）；
 * 推送服务 404/410 → 清理死订阅（浏览器注销/过期）。
 */
import { Injectable } from '@nestjs/common';
import * as webpush from 'web-push';
import type { Agent } from 'node:https';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { safeHttpsAgent } from '../../../common/security/url-guard';
import { DeliveryRecord, NotificationAdapter, OutboundNotification } from './notification-adapter.interface';
import { buildPushPayload, parseVapidConfig, shouldPruneSubscription } from './push-payload';

const PUSH_TIMEOUT_MS = 5_000;
const PUSH_TTL_SECONDS = 3_600;

@Injectable()
export class PushAdapter implements NotificationAdapter {
  readonly channel = 'push' as const;
  /** 出站 agent（测试注入点）：生产为 safeHttpsAgent，连接时 SSRF 校验（endpoint 为用户提交的出站目标，M-3） */
  agent: Agent = safeHttpsAgent;

  constructor(private readonly prisma: PrismaService) {}

  async send(notification: OutboundNotification, _delivery: DeliveryRecord): Promise<void> {
    const vapid = parseVapidConfig(process.env);
    if (!vapid) throw new Error('PUSH_ADAPTER_NOT_CONFIGURED');
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { tenantId: notification.tenantId, userId: notification.userId },
    });
    if (subscriptions.length === 0) throw new Error('PUSH_NO_SUBSCRIPTION');
    const payload = JSON.stringify(buildPushPayload(notification));
    let sent = 0;
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { vapidDetails: vapid, TTL: PUSH_TTL_SECONDS, timeout: PUSH_TIMEOUT_MS, agent: this.agent },
        );
        sent++;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (shouldPruneSubscription(statusCode)) {
          await this.prisma.pushSubscription.deleteMany({ where: { id: sub.id } });
        } else {
          throw err;
        }
      }
    }
    if (sent === 0) throw new Error('PUSH_ALL_SUBSCRIPTIONS_GONE');
  }
}
