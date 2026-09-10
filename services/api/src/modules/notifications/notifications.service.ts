/**
 * 通知服务：站内通知落库（in_app）+ 偏好路由三通道（邮件/WebPush/IM 适配器 TODO）+ 免打扰 + 重试退避元数据。
 * 业务模块经本服务 notify()（模块间只经 service 层交互）；外发失败发布 notification.failed（§3.6）。
 */
import { ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthUser } from './current-user.decorator';
import { EmailAdapter } from './adapters/email.adapter';
import { ImAdapter } from './adapters/im.adapter';
import { NotificationAdapter, OutboundChannel, OutboundNotification } from './adapters/notification-adapter.interface';
import { PushAdapter } from './adapters/push.adapter';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { NOTIFICATION_EVENTS } from './events/notification.events';
import { nextRetryAt } from './retry-policy';

/** 通知模块错误码（§3.1 分段码表） */
const E = { FORBIDDEN: 40301, NOT_FOUND: 40401 } as const;

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

/** 免打扰时段（notification_preferences.quiet_hours jsonb 形状） */
export interface QuietHourRange {
  days: number[]; // 0-6（周日=0，与 JS getDay 对齐）
  start: string; // 'HH:mm'
  end: string;
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

  /** 重试到期的外发投递；站内通知不重复创建，失败仍按同一退避策略回写。 */
  async retryDueDeliveries(now = new Date()): Promise<number> {
    const deliveries = await this.prisma.notificationDelivery.findMany({
      where: { status: 'failed', nextRetryAt: { lte: now } },
      include: { notification: true },
      orderBy: { nextRetryAt: 'asc' },
      take: 100,
    });
    let retried = 0;
    for (const delivery of deliveries) {
      const channel = delivery.channel as OutboundChannel;
      const adapter = this.adapters[channel];
      if (!adapter) continue;
      const notification = delivery.notification;
      const outbound: OutboundNotification = { ...notification, channel: 'in_app' };
      try {
        await adapter.send(outbound, delivery);
        await this.prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { status: 'sent', sentAt: new Date(), nextRetryAt: null } });
      } catch (err) {
        const attempts = delivery.attempts + 1;
        await this.prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: { attempts, lastError: String((err as Error)?.message ?? err).slice(0, 500), nextRetryAt: nextRetryAt(attempts) },
        });
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

  // ===================== 内部工具 =====================

  /** 按偏好路由外发：读取偏好（含默认 '*'）→ 免打扰判定 → 逐通道投递 → 失败落退避元数据 + notification.failed 事件 */
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
    const wanted = NOTIFICATION_CHANNELS_FILTER(pref?.channels);
    if (wanted.length === 0) return;
    if (this.inQuietHours((pref?.quietHours ?? []) as unknown as QuietHourRange[])) {
      this.logger.debug(`免打扰时段内，跳过外发 notification=${notification.id}`);
      return; // 站内通知已落库，外发静默跳过（TODO：免打扰结束后是否补发，产品口径待定）
    }
    const outbound: OutboundNotification = { ...notification, channel: 'in_app' };
    for (const channel of wanted) {
      const delivery = await this.prisma.notificationDelivery.create({
        data: { notificationId: notification.id, channel, status: 'pending', attempts: 0 },
      });
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
        this.eventBus?.emit(NOTIFICATION_EVENTS.FAILED, {
          notificationId: notification.id,
          deliveryId: delivery.id,
          channel,
          attempts,
          nextRetryAt: retryAt,
        });
      }
    }
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

  /** 免打扰判定（支持跨午夜区间） */
  private inQuietHours(quietHours: QuietHourRange[], now = new Date()): boolean {
    const day = now.getDay();
    const minutes = now.getHours() * 60 + now.getMinutes();
    for (const qh of quietHours) {
      if (!qh.days?.length || !qh.days.includes(day)) continue;
      const s = this.toMinutes(qh.start);
      const e = this.toMinutes(qh.end);
      if (s <= e) {
        if (minutes >= s && minutes < e) return true;
      } else if (minutes >= s || minutes < e) {
        return true; // 跨午夜（如 21:00-08:00）
      }
    }
    return false;
  }

  private toMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }
}

/** 通道开关过滤（channels jsonb → 启用外发通道列表） */
function NOTIFICATION_CHANNELS_FILTER(channels: unknown): OutboundChannel[] {
  if (!channels || typeof channels !== 'object') return [];
  const c = channels as Record<string, unknown>;
  return (['email', 'push', 'im'] as OutboundChannel[]).filter(ch => c[ch] === true);
}
