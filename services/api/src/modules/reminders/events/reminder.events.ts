/**
 * 提醒领域事件常量（§3.6：reminder.due 消费者=notifications（按偏好路由）、IM 适配器；payload 契约唯一来源 packages/domain-events，TODO 迁移）。
 */
export const REMINDER_EVENTS = {
  DUE: 'reminder.due',
} as const;
