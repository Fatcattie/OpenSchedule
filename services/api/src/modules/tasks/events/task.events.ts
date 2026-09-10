/**
 * 任务领域事件名常量（§3.6 事件清单：task.created/task.assigned/task.status_changed/task.completed；
 * payload 类型契约唯一来源 packages/domain-events，Phase 1 先本地常量 + TODO 迁移）。
 */
export const TASK_EVENTS = {
  CREATED: 'task.created',
  ASSIGNED: 'task.assigned',
  STATUS_CHANGED: 'task.status_changed',
  COMPLETED: 'task.completed',
} as const;
