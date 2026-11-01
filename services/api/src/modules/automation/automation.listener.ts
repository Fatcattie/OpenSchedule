/**
 * automation.listener.ts —— 自动化规则事件监听（R6-3 / BC-08 / §2.5 订阅表）。
 * 订阅 task.created / task.status_changed（Outbox 重放的进程内 EventBus 事件），
 * 交给 AutomationService.handleTaskEvent 匹配规则并执行动作。
 * task.completed 是 status_changed(to=done) 派生事件，不在此订阅（防二次触发，见 automation-trigger.ts）。
 */
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TASK_EVENTS } from '@openschedule/domain-events';
import { AutomationService } from './automation.service';

@Injectable()
export class AutomationListener {
  constructor(private readonly automation: AutomationService) {}

  @OnEvent(TASK_EVENTS.CREATED, { async: true })
  onTaskCreated(payload: Record<string, unknown>): Promise<void> {
    return this.automation.handleTaskEvent(TASK_EVENTS.CREATED, payload);
  }

  @OnEvent(TASK_EVENTS.STATUS_CHANGED, { async: true })
  onTaskStatusChanged(payload: Record<string, unknown>): Promise<void> {
    return this.automation.handleTaskEvent(TASK_EVENTS.STATUS_CHANGED, payload);
  }
}