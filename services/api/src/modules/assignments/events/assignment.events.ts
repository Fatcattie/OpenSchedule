/**
 * 承接事件常量（§3.6：领取/转移均发布 task.assigned；payload 契约唯一来源 packages/domain-events，TODO 迁移）。
 */
import { TASK_EVENTS } from '../../tasks/events/task.events';

export const ASSIGNMENT_EVENTS = {
  /** 领取/转移共用 task.assigned（§3.6 事件清单；消费者：notifications、automation、WS） */
  ASSIGNED: TASK_EVENTS.ASSIGNED,
  /** 状态机迁移副作用（T1 领取即开始执行） */
  STATUS_CHANGED: TASK_EVENTS.STATUS_CHANGED,
} as const;
