/**
 * domain-events-contract 契约测试（QA 先期 authoring，s3 红 → s5 绿）。
 *
 * 断言内容（production-ddd-design.md §8.1 / R2 批次）：
 *  1. 6 个模块级事件常量文件必须 re-export 自 @openschedule/domain-events（头部 TODO 清除）
 *  2. 各事件名常量值与 §8.1 事件目录一致
 *  3. 每个事件 payload 类型必含 5 个信封字段（eventId/occurredAt/tenantId/actor/version）——运行时 + 编译期双重断言
 *
 * 无 DB / Nest 依赖，纯契约验证；随 `pnpm test` 运行（vitest.config.ts 的 include 含 test 目录下的 .spec.ts）。
 * 编译期断言由 `pnpm typecheck`（tsconfig.test.json）承担——vitest 本身不做类型检查。
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as de from '../../../packages/domain-events/dist/index';
import { TASK_EVENTS } from '../src/modules/tasks/events/task.events';
import { PROJECT_EVENTS } from '../src/modules/projects/events/project.events';
import { COMMENT_EVENTS } from '../src/modules/comments/events/comment.events';
import { NOTIFICATION_EVENTS } from '../src/modules/notifications/events/notification.events';
import { REMINDER_EVENTS } from '../src/modules/reminders/events/reminder.events';
import { ASSIGNMENT_EVENTS } from '../src/modules/assignments/events/assignment.events';

const API_ROOT = path.resolve(__dirname, '..');

/** 6 个事件常量文件相对 services/api 的路径（R2 接线目标面） */
const EVENTS_FILES = [
  'src/modules/tasks/events/task.events.ts',
  'src/modules/projects/events/project.events.ts',
  'src/modules/comments/events/comment.events.ts',
  'src/modules/notifications/events/notification.events.ts',
  'src/modules/reminders/events/reminder.events.ts',
  'src/modules/assignments/events/assignment.events.ts',
] as const;

describe('domain-events-contract', () => {
  describe('事件名常量值与 §8.1 目录一致（运行时）', () => {
    it('TASK_EVENTS 四个事件名', () => {
      expect(TASK_EVENTS.CREATED).toBe('task.created');
      expect(TASK_EVENTS.ASSIGNED).toBe('task.assigned');
      expect(TASK_EVENTS.STATUS_CHANGED).toBe('task.status_changed');
      expect(TASK_EVENTS.COMPLETED).toBe('task.completed');
    });

    it('PROJECT / COMMENT / NOTIFICATION / REMINDER / ASSIGNMENT 事件名', () => {
      expect(PROJECT_EVENTS.UPDATED).toBe('project.updated');
      expect(PROJECT_EVENTS.ARCHIVED).toBe('project.archived');
      expect(COMMENT_EVENTS.CREATED).toBe('task.comment_created');
      expect(COMMENT_EVENTS.MENTION_PARSED).toBe('mention.parsed');
      expect(NOTIFICATION_EVENTS.FAILED).toBe('notification.failed');
      expect(REMINDER_EVENTS.DUE).toBe('reminder.due');
      // 承接域复用 task.* 事件名（§8.1：领取/转移均发 task.assigned）
      expect(ASSIGNMENT_EVENTS.ASSIGNED).toBe('task.assigned');
      expect(ASSIGNMENT_EVENTS.STATUS_CHANGED).toBe('task.status_changed');
    });
  });

  describe('events/*.ts 必须 re-export 自 @openschedule/domain-events（s5 交付项）', () => {
    it.each(EVENTS_FILES)('file re-exports the shared contract package and drops the TODO marker', (relPath) => {
      const text = fs.readFileSync(path.join(API_ROOT, relPath), 'utf8');
      // re-export 标记：文件必须引用共享包
      expect(text).toContain('@openschedule/domain-events');
      // 迁移完成：文件头部的「TODO 迁移」注释必须清除（避免旧契约残留）
      expect(text).not.toContain('TODO');
    });
  });

  describe('§8.1 五个必含信封字段', () => {
    it('buildEventEnvelope 产出完整 5 字段且 version 为当前 schema 版本', () => {
      const envelope = de.buildEventEnvelope(
        '018f3a0c-aaaa-7000-8000-000000000001',
        '018f3a0c-bbbb-7000-8000-000000000002',
        { id: '018f3a0c-cccc-7000-8000-000000000003', type: 'user' },
        new Date(0).toISOString(),
      );
      expect(envelope).toEqual({
        eventId: '018f3a0c-aaaa-7000-8000-000000000001',
        occurredAt: '1970-01-01T00:00:00.000Z',
        tenantId: '018f3a0c-bbbb-7000-8000-000000000002',
        actor: { id: '018f3a0c-cccc-7000-8000-000000000003', type: 'user' },
        version: de.DOMAIN_EVENTS_SCHEMA_VERSION,
      });
      // schema 版本号必须是 ≥1 的数字（§8.1 破坏性变更升版）
      expect(typeof de.DOMAIN_EVENTS_SCHEMA_VERSION).toBe('number');
      expect(de.DOMAIN_EVENTS_SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
    });

    // 编译期断言：每个已注册事件名的 payload 类型必须继承信封 5 字段。
    // 若任一 payload 缺字段，HasEnvelope 退化为 never，下面常量赋值即 TS 报错（typecheck 转红）。
    type HasEnvelope<K extends de.DomainEventName> = de.DomainEventPayloads[K] extends de.DomainEventEnvelope ? true : never;
    type AllEventsCarryEnvelope = {
      'task.created': HasEnvelope<'task.created'>;
      'task.assigned': HasEnvelope<'task.assigned'>;
      'task.status_changed': HasEnvelope<'task.status_changed'>;
      'task.completed': HasEnvelope<'task.completed'>;
      'project.updated': HasEnvelope<'project.updated'>;
      'project.archived': HasEnvelope<'project.archived'>;
      'task.comment_created': HasEnvelope<'task.comment_created'>;
      'mention.parsed': HasEnvelope<'mention.parsed'>;
      'notification.failed': HasEnvelope<'notification.failed'>;
      'reminder.due': HasEnvelope<'reminder.due'>;
      'ai.proposal.expired': HasEnvelope<'ai.proposal.expired'>;
    };
    const compileCheck: AllEventsCarryEnvelope = {
      'task.created': true,
      'task.assigned': true,
      'task.status_changed': true,
      'task.completed': true,
      'project.updated': true,
      'project.archived': true,
      'task.comment_created': true,
      'mention.parsed': true,
      'notification.failed': true,
      'reminder.due': true,
      'ai.proposal.expired': true,
    };
    it('全部 11 个事件名的 payload 类型均含 5 个信封字段（类型级）', () => {
      expect(compileCheck).toEqual(
        expect.objectContaining({ 'ai.proposal.expired': true, 'task.created': true }),
      );
    });
  });
});
