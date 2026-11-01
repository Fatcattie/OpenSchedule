/**
 * 通知外发适配器契约（§3.2：三通道 email/push/im；失败抛错由 NotificationsService 落 failed + 退避）。
 * OutboundNotification 由 NotificationsService 组装（含收件人联系方式，适配器不查业务表）。
 */
export interface OutboundNotification {
  id: string;
  tenantId: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  data: unknown;
  /** 目标外发通道（= delivery.channel，如 'email'；站内落库通知本体为 'in_app'） */
  channel: string;
  /** 收件邮箱（User.email；IM 目标解析亦以此为准） */
  recipientEmail: string | null;
  /** 收件人时区（免打扰语义；null 时按服务器本地时区） */
  timezone: string | null;
}

export interface DeliveryRecord {
  id: string;
  notificationId: string;
  channel: string;
  attempts: number;
}

export const NOTIFICATION_CHANNELS = ['email', 'push', 'im'] as const;
export type OutboundChannel = (typeof NOTIFICATION_CHANNELS)[number];

export interface NotificationAdapter {
  readonly channel: OutboundChannel;
  /** 发送通知；失败抛错（由 NotificationService 落 failed + 退避元数据并发布 notification.failed） */
  send(notification: OutboundNotification, delivery: DeliveryRecord): Promise<void>;
}
