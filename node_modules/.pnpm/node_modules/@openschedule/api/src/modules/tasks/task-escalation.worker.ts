/**
 * 任务阻塞>72h 升级扫描 worker（§3.2 / R3 双保险，镜像 RemindersWorker 模式）：
 * ① BullMQ repeatable（REDIS_URL 可用时）承担周期主路径；② setInterval DB 扫描兜底（Redis 宕机升级不丢）。
 * 目标：status=blocked 且 blocked_at ≤ now-72h 且尚未发过升级通知（block_escalated_at IS NULL）
 * 的动作：站内通知项目负责人 + 置 block_escalated_at（去重，同一次阻塞只升级一次）。
 * 时间戳由 tasks.service.applyTransition 维护（进 blocked 记 blocked_at，离开 blocked 清空两者）。
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common'
import { PrismaService } from '../../common/prisma/prisma.service'
import { QueueService } from '../../common/queue/queue.service'
import { NotificationsService } from '../notifications/notifications.service'
import { isBlockedEscalationDue } from './task-escalation.policy'

const ESCALATION_SCAN_INTERVAL_MS = Number(process.env.TASK_ESCALATION_INTERVAL_MS ?? 300_000) // 默认 5 分钟
const BLOCKED_ESCALATION_MS = 72 * 60 * 60 * 1000 // 阻塞 72h 升级阈值

@Injectable()
export class TaskEscalationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaskEscalationWorker.name)
  private timer?: NodeJS.Timeout

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Optional() private readonly queue?: QueueService,
  ) {}

  onModuleInit(): void {
    void this.queue
      ?.addRepeatable('tasks', 'tasks.blocked-escalation', { intervalMs: ESCALATION_SCAN_INTERVAL_MS }, ESCALATION_SCAN_INTERVAL_MS)
      .then((ok) => ok && this.logger.log('任务阻塞升级 BullMQ repeatable job 已注册'))
    void this.queue?.startWorker('tasks', () => this.tick()).then((started) =>
      started && this.logger.log('任务阻塞升级 BullMQ worker 已启动'),
    )
    this.timer = setInterval(() => {
      void this.tick().catch((err) => this.logger.warn(`任务阻塞升级扫描失败: ${(err as Error).message}`))
    }, ESCALATION_SCAN_INTERVAL_MS)
    this.timer.unref?.()
    this.logger.log(`任务阻塞升级 worker 启动（间隔 ${ESCALATION_SCAN_INTERVAL_MS}ms，阈值 ${BLOCKED_ESCALATION_MS}ms）`)
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
  }

  /** 扫描阻塞超 72h 且未升级过的任务 → 通知项目负责人 + 标记 block_escalated_at（原子去重） */
  private async tick(): Promise<void> {
    const now = new Date()
    const threshold = new Date(now.getTime() - BLOCKED_ESCALATION_MS)
    const due = await this.prisma.task.findMany({
      where: {
        status: 'blocked',
        deletedAt: null,
        blockEscalatedAt: null,
        blockedAt: { lte: threshold },
      },
      take: 200,
      select: {
        id: true,
        tenantId: true,
        title: true,
        projectId: true,
        blockedAt: true,
        blockEscalatedAt: true,
      },
    })
    let escalated = 0
    for (const task of due) {
      // 纯函数判定（与 DB 谓词同口径，防御性复核；多实例时钟漂移下仍不误升级）
      if (!isBlockedEscalationDue(task.blockedAt, task.blockEscalatedAt, now, BLOCKED_ESCALATION_MS)) continue
      if (!task.projectId) continue
      const project = await this.prisma.project.findFirst({
        where: { id: task.projectId, tenantId: task.tenantId },
        select: { ownerId: true },
      })
      const ownerId = project?.ownerId
      if (!ownerId) continue
      // 原子去重：仅未升级过的任务可被认领（多实例/多路径安全，同 reminder.fire() 思路）
      const claimed = await this.prisma.task.updateMany({
        where: { id: task.id, status: 'blocked', blockEscalatedAt: null },
        data: { blockEscalatedAt: now },
      })
      if (claimed.count === 0) continue
      await this.notifications
        .notify({
          tenantId: task.tenantId,
          userId: ownerId,
          type: 'task.blocked_escalation',
          title: `任务「${task.title}」阻塞超过 3 天，请介入`,
          body: '该任务长时间处于阻塞状态，需要项目负责人协调资源或调整计划。',
          data: { taskId: task.id, projectId: task.projectId },
        })
        .catch((err) => this.logger.warn(`任务阻塞升级通知发送失败 task=${task.id}: ${(err as Error).message}`))
      escalated++
    }
    if (escalated > 0) this.logger.log(`任务阻塞升级扫描：${escalated} 条发出升级通知`)
  }
}
