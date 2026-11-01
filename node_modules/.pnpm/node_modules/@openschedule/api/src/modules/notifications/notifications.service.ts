/**
 * 通知服务：站内通知落库（in_app）+ 偏好路由三通道实发（email=SMTP / push=WebPush / im=integrations）
 * + 免打扰补发（D-12）+ 重试退避与终败收敛。
 * 业务模块经本服务 notify()（模块间只经 service 层交互）；外发失败发布 notification.failed（§8.1 信封契约）。
 */
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { buildEventEnvelope } from '@openschedule/domain-events';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertSafeOutboundUrl } from '../../common/security/url-guard';
import { AuthUser } from './current-user.decorator';
import { EmailAdapter } from './adapters/email.adapter';
import { ImAdapter } from './adapters/im.adapter';
import { NotificationAdapter, OutboundChannel, OutboundNotification } from './adapters/notification-adapter.interface';
import { PushAdapter } from './adapters/push.adapter';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { SubscribePushSubscriptionDto } from './dto/push-subscription.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { NOTIFICATION_EVENTS } from './events/notification.events';
import { enabledOutboundChannels } from './notification-routing';
import { inQuietHours, quietHoursEnd, QuietHourRange } from './quiet-hours';
import { nextRetryAt } from './retry-policy';

/** 通知模块错误码（§3.1 分段码表） */
const E = { BAD_REQUEST: 40001, FORBIDDEN: 40301, NOT_FOUND: 40401 } as const;

/** 外发终败上限（此后置 failed + nextRetryAt=null，不再自动重试；约 3h 退避窗口） */
export const MAX_DELIVERY_ATTEMPTS = 8;

/** notify 入参（调用方构造；type 取 §3.6 事件名或产品语义，如 task.assigned/mention/reminder.due） */
export interface NotifyInput {
  tenantId: string;
  /** 接收人 */
  userId: string;
  type: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}

/** 偏好视图（列表响应；通配默认项 id=null 表示未落库） */
export interface PreferenceView {
  id: string | null;
  eventType: string;
  channels: unknown;
  quietHours: unknown;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly adapters: Record<OutboundChannel, NotificationAdapter>;

  constructor(
    private readonly prisma: PrismaService,
    email: EmailAdapter,
    push: PushAdapter,
    im: ImAdapter,
    @Optional() private readonly eventBus?: EventEmitter2,
  ) {
    this.adapters = { email, push, im };
  }

  /** 站内通知落库（in_app 即时可见）+ 按偏好路由外发（失败不阻塞主流程） */
  async notify(input: NotifyInput) {
    const notification = await this.prisma.notification.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: (input.data ?? {}) as Prisma.InputJsonValue,
        channel: 'in_app',
        status: 'sent',
      },
    });
    await this.routeOutbound(notification).catch(err => this.logger.warn(`外发路由失败 notification=${notification.id}: ${err.message}`));
    return notification;
  }

  /** 通知收件箱（tenant + user 谓词；meta 带未读数） */
  async list(user: AuthUser, query: NotificationQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where: Prisma.NotificationWhereInput = {
      tenantId: user.tenantId,
      userId: user.userId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.unreadOnly ? { status: { not: 'read' } } : {}),
    };
    const [items, total, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { tenantId: user.tenantId, userId: user.userId, status: { not: 'read' } } }),
    ]);
    return { data: items, meta: { page, pageSize, total, unreadCount } };
  }

  /** 标记已读/未读（仅本人通知可操作） */
  async markRead(id: string, user: AuthUser, dto: UpdateNotificationDto) {
    const notification = await this.prisma.notification.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!notification) throw new NotFoundException({ code: E.NOT_FOUND, message: '通知不存在或不可见' });
    if (notification.userId !== user.userId) throw new ForbiddenException({ code: E.FORBIDDEN, message: '只能操作自己的通知' });
    const read = dto.read ?? true;
    return this.prisma.notification.update({
      where: { id },
      data: { status: read ? 'read' : 'sent', readAt: read ? new Date() : null },
    });
  }

  /** 全部已读 */
  async markAllRead(user: AuthUser) {
    const res = await this.prisma.notification.updateMany({
      where: { tenantId: user.tenantId, userId: user.userId, status: { not: 'read' } },
      data: { status: 'read', readAt: new Date() },
    });
    return { updated: res.count };
  }

  /**
   * 重试/补发到期的外发投递（BullMQ repeatable + setInterval 兜底共用）。
   * - 扫描对象：pending（免打扰挂起，D-12）与 failed（发送失败）且 nextRetryAt 到期；
   * - 免打扰窗口内到期 → 顺延至窗口结束（不消耗尝试次数）；
   * - 失败达到 MAX_DELIVERY_ATTEMPTS → 终败（nextRetryAt=null，事件 nextRetryAt=null）。
   */
  async retryDueDeliveries(now = new Date()): Promise<number> {
    const deliveries = await this.prisma.notificationDelivery.findMany({
      where: { status: { in: ['pending', 'failed'] }, nextRetryAt: { lte: now } },
      include: { notification: { include: { user: { select: { email: true, timezone: true } } } } },
      orderBy: { nextRetryAt: 'asc' },
      take: 100,
    });
    let retried = 0;
    for (const delivery of deliveries) {
      const channel = delivery.channel as OutboundChannel;
      const adapter = this.adapters[channel];
      if (!adapter) continue;
      const notification = delivery.notification;
      const pref = await this.loadPreference(notification.userId, notification.type);
      const quietHours = (pref?.quietHours ?? []) as unknown as QuietHourRange[];
      const timezone = notification.user?.timezone ?? null;
      if (inQuietHours(quietHours, now, timezone)) {
        const until = quietHoursEnd(quietHours, now, timezone);
        if (until) {
          await this.prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { nextRetryAt: until } });
          continue;
        }
      }
      const outbound: OutboundNotification = {
        ...notification,
        channel,
        recipientEmail: notification.user?.email ?? null,
        timezone,
      };
      try {
        await adapter.send(outbound, delivery);
        await this.prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: { status: 'sent', sentAt: new Date(), nextRetryAt: null },
        });
      } catch (err) {
        const attempts = delivery.attempts + 1;
        const terminal = attempts >= MAX_DELIVERY_ATTEMPTS;
        const retryAt = terminal ? null : nextRetryAt(attempts);
        await this.prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'failed',
            attempts,
            lastError: String((err as Error)?.message ?? err).slice(0, 500),
            nextRetryAt: retryAt,
          },
        });
        this.emitFailed(notification, delivery.id, channel, attempts, retryAt);
      }
      retried++;
    }
    return retried;
  }

  /** 偏好列表（含未显式设置时的通配默认项 '*'） */
  async listPreferences(user: AuthUser): Promise<PreferenceView[]> {
    const rows = await this.prisma.notificationPreference.findMany({ where: { tenantId: user.tenantId, userId: user.userId }, orderBy: { eventType: 'asc' } });
    const items: PreferenceView[] = rows.map(r => ({ id: r.id, eventType: r.eventType, channels: r.channels, quietHours: r.quietHours }));
    if (!rows.some(r => r.eventType === '*')) {
      items.unshift({ id: null, eventType: '*', channels: { email: false, push: false, im: false }, quietHours: [] });
    }
    return items;
  }

  /** 偏好写入（PUT 语义：提供的字段整体替换；UNIQUE(user_id, event_type) upsert） */
  async putPreferences(user: AuthUser, dto: UpdatePreferencesDto) {
    const eventType = dto.eventType ?? '*';
    const channels = dto.channels ?? undefined;
    const quietHours = dto.quietHours ?? undefined;
    return this.prisma.notificationPreference.upsert({
      where: { userId_eventType: { userId: user.userId, eventType } },
      create: {
        tenantId: user.tenantId,
        userId: user.userId,
        eventType,
        channels: (channels ?? {}) as Prisma.InputJsonValue,
        quietHours: (quietHours ?? []) as unknown as Prisma.InputJsonValue,
      },
      update: {
        ...(channels ? { channels: channels as Prisma.InputJsonValue } : {}),
        ...(quietHours ? { quietHours: quietHours as unknown as Prisma.InputJsonValue } : {}),
      },
    });
  }

  // ===================== WebPush 订阅（R5-3 / D-11） =====================

  /** 本人订阅列表（endpoint 不回显密钥材料） */
  async listPushSubscriptions(user: AuthUser) {
    const rows = await this.prisma.pushSubscription.findMany({
      where: { tenantId: user.tenantId, userId: user.userId },
      select: { id: true, endpoint: true, userAgent: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return { data: rows };
  }

  /** 注册订阅（endpoint 唯一；写入前 SSRF 校验 —— 出站 POST 目标不可指向内网/环回） */
  async addPushSubscription(user: AuthUser, dto: SubscribePushSubscriptionDto) {
    try {
      await assertSafeOutboundUrl(dto.endpoint);
    } catch (err) {
      throw new BadRequestException({ code: E.BAD_REQUEST, message: (err as Error).message });
    }
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        tenantId: user.tenantId,
        userId: user.userId,
        endpoint: dto.endpoint,
        p256dh: dto.p256dh,
        auth: dto.auth,
        userAgent: dto.userAgent,
      },
      update: {
        tenantId: user.tenantId,
        userId: user.userId,
        p256dh: dto.p256dh,
        auth: dto.auth,
        userAgent: dto.userAgent,
      },
      select: { id: true, endpoint: true, createdAt: true, updatedAt: true },
    });
  }

  /** 注销订阅（仅本人/本租户可注销） */
  async removePushSubscription(user: AuthUser, endpoint: string) {
    const existing = await this.prisma.pushSubscription.findUnique({ where: { endpoint } });
    if (!existing || existing.tenantId !== user.tenantId || existing.userId !== user.userId) {
      throw new NotFoundException({ code: E.NOT_FOUND, message: '订阅不存在或不可见' });
    }
    await this.prisma.pushSubscription.delete({ where: { endpoint } });
    return { removed: true };
  }

  // ===================== 内部工具 =====================

  /**
   * 按偏好路由外发：读偏好（含默认 '*'）→ 免打扰判定（挂起待补发，D-12）→ 逐通道投递。
   * push 通道无订阅记录 → 视为不可达，不落投递记录；投递失败落退避元数据 + notification.failed。
   */
  private async routeOutbound(notification: {
    id: string;
    tenantId: string;
    userId: string;
    type: string;
    title: string;
    body: string | null;
    data: unknown;
  }): Promise<void> {
    const pref = await this.loadPreference(notification.userId, notification.type);
    const wanted = enabledOutboundChannels(pref?.channels);
    if (wanted.length === 0) return;
    const user = await this.prisma.user.findUnique({
      where: { id: notification.userId },
      select: { email: true, timezone: true },
    });
    const timezone = user?.timezone ?? null;
    const quietHours = (pref?.quietHours ?? []) as unknown as QuietHourRange[];
    const now = new Date();
    if (inQuietHours(quietHours, now, timezone)) {
      const until = quietHoursEnd(quietHours, now, timezone);
      if (until) {
        // 站内已落库；外发挂起，窗口结束后由重试扫描补发（D-12）
        await this.prisma.notificationDelivery.createMany({
          data: wanted.map(channel => ({ notificationId: notification.id, channel, status: 'pending', attempts: 0, nextRetryAt: until })),
        });
        this.logger.debug(`免打扰挂起外发 notification=${notification.id} 至 ${until.toISOString()}`);
      }
      return;
    }
    for (const channel of wanted) {
      if (channel === 'push') {
        const subscriptions = await this.prisma.pushSubscription.count({
          where: { tenantId: notification.tenantId, userId: notification.userId },
        });
        if (subscriptions === 0) continue;
      }
      const delivery = await this.prisma.notificationDelivery.create({
        data: { notificationId: notification.id, channel, status: 'pending', attempts: 0 },
      });
      const outbound: OutboundNotification = {
        ...notification,
        channel,
        recipientEmail: user?.email ?? null,
        timezone,
      };
      try {
        await this.adapters[channel].send(outbound, delivery);
        await this.prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { status: 'sent', sentAt: new Date() } });
      } catch (err) {
        const attempts = delivery.attempts + 1;
        const retryAt = nextRetryAt(attempts);
        await this.prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'failed',
            attempts,
            lastError: String((err as Error)?.message ?? err).slice(0, 500),
            nextRetryAt: retryAt,
          },
        });
        this.emitFailed(notification, delivery.id, channel, attempts, retryAt);
      }
    }
  }

  /** 发布 notification.failed（§8.1 信封契约；终败 nextRetryAt=null） */
  private emitFailed(
    notification: { id: string; tenantId: string; userId: string },
    deliveryId: string,
    channel: OutboundChannel,
    attempts: number,
    retryAt: Date | null,
  ): void {
    this.eventBus?.emit(NOTIFICATION_EVENTS.FAILED, {
      ...buildEventEnvelope(randomUUID(), notification.tenantId, { id: 'system', type: 'system' }, new Date().toISOString()),
      notificationId: notification.id,
      deliveryId,
      channel,
      attempts,
      nextRetryAt: retryAt ? retryAt.toISOString() : null,
    });
  }

  /** 加载偏好（优先事件级，其次通配默认 '*'） */
  private async loadPreference(userId: string, eventType: string) {
    const exact = await this.prisma.notificationPreference.findUnique({
      where: { userId_eventType: { userId, eventType } },
    });
    if (exact) return exact;
    return this.prisma.notificationPreference.findUnique({
      where: { userId_eventType: { userId, eventType: '*' } },
    });
  }
}
