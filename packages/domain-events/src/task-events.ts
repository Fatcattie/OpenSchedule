/**
 * task.* 事件名与 payload 类型（事件名清单 production-ddd-design.md §8.1；payload 以现有 emit 侧字段为准 + §8.1 信封字段）。
 * task.completed 是 task.status_changed(to=done) 的派生事件：由迁移完成后同步发布，供 BC-10 投影与 BC-08 自动化订阅。
 */
import type { DomainEventEnvelope } from './envelope';

export const TASK_EVENTS = {
  CREATED: 'task.created',
  ASSIGNED: 'task.assigned',
  STATUS_CHANGED: 'task.status_changed',
  COMPLETED: 'task.completed',
} as const;

export type TaskEventName = (typeof TASK_EVENTS)[keyof typeof TASK_EVENTS];

/** 任务状态（与 services/api common/constants/task-status.ts 的 TaskStatus 同值；本包不依赖 NestJS） */
export type TaskStatusValue = 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled' | 'pending_review';

/** 事件名 → payload 的映射（发布/订阅两侧共用的强类型契约） */
export interface TaskEventPayloads {
  [TASK_EVENTS.CREATED]: DomainEventEnvelope & {
    taskId: string;
    projectId: string;
    /** 创建者即 actor */
  };
  [TASK_EVENTS.ASSIGNED]: DomainEventEnvelope & {
    taskId: string;
    projectId: string;
    assigneeId: string;
    /** 转移场景存在 */
    transferredBy?: string;
  };
  [TASK_EVENTS.STATUS_CHANGED]: DomainEventEnvelope & {
    taskId: string;
    projectId: string;
    /** 首次状态变更 from 可为 null（如提报批准落 todo） */
    from: TaskStatusValue | null;
    to: TaskStatusValue;
  };
  [TASK_EVENTS.COMPLETED]: DomainEventEnvelope & {
    taskId: string;
    projectId: string;
    /** Estimate 值对象语义：0 ≤ x ≤ 1000，1 位小数（§2.3） */
    actualHours: number;
  };
}

export type TaskDomainEvent<K extends TaskEventName = TaskEventName> = {
  name: K;
  payload: TaskEventPayloads[K];
};
