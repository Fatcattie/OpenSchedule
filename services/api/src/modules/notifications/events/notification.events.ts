/**
 * 通知领域事件常量（§3.6：notification.failed 重试 worker 退避；payload 契约唯一来源 packages/domain-events，TODO 迁移）。
 */
export const NOTIFICATION_EVENTS = {
  /** 外发失败 → 重试 worker 退避重试 */
  FAILED: 'notification.failed',
} as const;
