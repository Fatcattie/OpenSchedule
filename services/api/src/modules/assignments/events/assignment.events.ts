/**
 * 承接域事件常量（§3.6：领取/转移均发布 task.assigned，状态机副作用发 task.status_changed）。
 * payload 类型契约唯一来源 @openschedule/domain-events（§8.1）；本文件复用任务域常量，保持承接侧语义命名。
 */
import { TASK_EVENTS } from '@openschedule/domain-events';

export const ASSIGNMENT_EVENTS = {
  /** 领取/转移共用 task.assigned（消费者：notifications、automation、WS） */
  ASSIGNED: TASK_EVENTS.ASSIGNED,
  /** 状态机迁移副作用（T1 领取即开始执行） */
  STATUS_CHANGED: TASK_EVENTS.STATUS_CHANGED,
} as const;
