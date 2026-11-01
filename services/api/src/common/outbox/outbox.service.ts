/**
 * OutboxService（§3.4 可靠性：事件零消费治理 / R3 事务性 Outbox）。
 *
 * 设计（production-ddd-design.md §2.5 可靠性要求）：
 * - 关键事件的副作用「必须可由 DB 兜底扫描补偿」：发布方在业务写事务内（或紧随其后）
 *   调用 publish() 落 outbox_events（tenant_id 铁律，§0 约定 2）；
 * - OutboxDispatcher（BullMQ repeatable）定期扫描 pending/due 事件 → 进程内 EventBus 重放
 *   → 成功后置 dispatched；失败按退避策略排 next_attempt_at；
 * - 分发锁（lockedUntil）防多实例重复处理；DB 不可达时 worker 自动降级（reminder 双保险同思路）。
 * - 新增事件名：① packages/domain-events 定义 ② 本服务 register 白名单 ③ 消费方集成测试。
 */
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

/** Outbox 事件名白名单（= domain-events 事件目录；新增必须同步 @openschedule/domain-events 契约） */
export const OUTBOX_EVENT_NAMES = [
  'task.created',
  'task.assigned',
  'task.status_changed',
  'task.completed',
  'project.updated',
  'project.archived',
  'task.comment_created',
  'mention.parsed',
  'reminder.due',
  'notification.failed',
  'ai.proposal.expired',
] as const;

export type OutboxEventName = (typeof OUTBOX_EVENT_NAMES)[number];

const DISPATCH_LOCK_SECONDS = 60; // 分发锁窗口（防多 worker 并发认领同一事件）
const DISPATCH_PAGE_SIZE = 100; // 单 tick 上限（防积压打满）
/** 退避（秒）：第 N 次失败后 2^N 封顶 30min（与 retry-policy 纯函数同构，Outbox 独立计时单位） */
export function outboxBackoffSeconds(attempts: number): number {
  return Math.min(30 * 60, 2 ** Math.max(1, Math.floor(attempts)) * 30);
}

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventEmitter2,
  ) {}

  /**
   * 发布关键事件到 Outbox（DB 兜底，§2.5 可靠性要求）。
   * 调用方保证在租户上下文内（tenantId 由 PrismaService 扩展自动注入，tenant_id 铁律）。
   * 事件名必须在 OUTBOX_EVENT_NAMES 白名单内（防任意事件名落库）。
   * @param tx 可选事务客户端（镜像 AuditService.record(input, tx?)）：业务写事务内落 outbox，保证副作用可重放。
   */
  async publish(tenantId: string, name: OutboxEventName, payload: Record<string, unknown>, tx?: Prisma.TransactionClient): Promise<string> {
    const db = tx ?? this.prisma;
    const row = await db.outboxEvent.create({
      data: {
        tenantId,
        eventName: name,
        payload: {
          // §8.1 机器可读约定：eventId(uuid7)/occurredAt/tenantId/actor/version
          eventId: randomUUID(),
          occurredAt: new Date().toISOString(),
          tenantId,
          actor: payload.actor ?? { id: 'system', type: 'system' },
          version: 1,
          ...payload,
        },
        status: 'pending',
        nextAttemptAt: new Date(), // 立即可分发
      },
      select: { id: true },
    });
    return row.id;
  }

  /**
   * 分发到期的 Outbox 事件（OutboxDispatcher / DB 兜底扫描调用）：
   * 原子认领（pending + next_attempt_at ≤ now + 无锁 → 置锁）→ 进程内 EventBus 重放 →
   * 成功置 dispatched；失败按退避排 next_attempt_at（status=failed 可查）。
   */
  async dispatchDue(now = new Date()): Promise<number> {
    const lockUntil = new Date(now.getTime() + DISPATCH_LOCK_SECONDS * 1000);
    const due = await this.prisma.outboxEvent.findMany({
      where: {
        status: 'pending',
        nextAttemptAt: { lte: now },
        OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
      },
      take: DISPATCH_PAGE_SIZE,
      orderBy: { nextAttemptAt: 'asc' },
    });

    let dispatched = 0;
    for (const row of due) {
      const claimed = await this.prisma.outboxEvent.updateMany({
        where: {
          id: row.id,
          status: 'pending',
          OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
        },
        data: { lockedUntil: lockUntil },
      });
      if (claimed.count === 0) continue; // 已被另一 worker 认领（多实例防重，§3.4 验收）

      try {
        this.eventBus.emit(row.eventName, row.payload as Record<string, unknown>);
        await this.prisma.outboxEvent.update({
          where: { id: row.id },
          data: { status: 'dispatched', dispatchedAt: now, lockedUntil: null, lastError: null },
        });
        dispatched++;
      } catch (err) {
        const attempts = row.attempts + 1;
        const nextAttemptAt = new Date(now.getTime() + outboxBackoffSeconds(attempts) * 1000);
        await this.prisma.outboxEvent.update({
          where: { id: row.id },
          data: {
            status: 'failed',
            attempts,
            lockedUntil: null,
            lastError: String((err as Error)?.message ?? err).slice(0, 500),
            nextAttemptAt,
          },
        });
        this.logger.warn(`Outbox 事件分发失败 event=${row.eventName} outbox=${row.id}：${(err as Error).message}`);
      }
    }
    return dispatched;
  }
}
