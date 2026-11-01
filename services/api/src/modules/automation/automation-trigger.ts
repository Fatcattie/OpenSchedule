/**
 * automation-trigger.ts —— 自动化触发映射（R6-3 / BC-08）：把 task.* Outbox 事件映射为规则引擎 EvalContext。
 * 纯函数、无 IO。触发器白名单（§3.2）：task.created / task.status_changed / task.completed。
 * 注意：task.completed 是 task.status_changed(to=done) 的派生事件（applyTransition 同事务双发布），
 * 订阅 status_changed 已覆盖 done 语义，故 completed 返回 null 丢弃，防二次触发（§2.5「防订阅者收到两次」）。
 */
import type { EvalContext } from './engine/rule-engine';

export interface AutomationTrigger {
  /** 规则 triggerType（用于 where 过滤，见 rule-engine TriggerType） */
  triggerType: string;
  /** 规则引擎评估上下文 */
  ctx: EvalContext;
}

/** task.* 事件 → 自动化触发器；非白名单/已覆盖事件返回 null */
export function taskEventToAutomationTrigger(
  eventName: string,
  payload: Record<string, unknown>,
): AutomationTrigger | null {
  switch (eventName) {
    case 'task.created':
      // 新建任务 = 进入初始 todo（语义等同 status_changed from=null → todo）
      return {
        triggerType: 'status_changed',
        ctx: {
          eventType: 'status_changed',
          changedFields: { status: { old: null, new: 'todo' } },
        },
      };
    case 'task.status_changed':
      return {
        triggerType: 'status_changed',
        ctx: {
          eventType: 'status_changed',
          changedFields: {
            status: {
              old: (payload.from as string | null) ?? null,
              new: (payload.to as string) ?? '',
            },
          },
        },
      };
    case 'task.completed':
      // 派生事件：已由 status_changed(to=done) 覆盖，丢弃防重复（见文件头）
      return null;
    default:
      return null;
  }
}