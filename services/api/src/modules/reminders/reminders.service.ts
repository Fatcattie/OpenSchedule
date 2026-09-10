/**
 * 提醒服务：提醒 CRUD + Redis zset 延迟队列同步（score=trigger_at）+ 触发（原子认领防双路径重复）。
 * 双保险（工程决策 4）：zset 主队列 + DB 兜底扫描；触发时从 DB 重读最新状态防"幽灵提醒"。
 */
import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, Reminder } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TasksService } from '../tasks/tasks.service';
import { AuthUser } from './current-user.decorator';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { ReminderQueryDto } from './dto/reminder-query.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { REMINDER_EVENTS } from './events/reminder.events';

/** 提醒模块错误码（§3.1 分段码表） */
const E = { BAD_REQUEST: 40001, NOT_FOUND: 40401 } as const;

/** zset key：{REDIS_PREFIX}reminders:due（score=trigger_at 毫秒时间戳） */
export function reminderZsetKey(): string {
  return `${process.env.REDIS_PREFIX ?? 'openschedule:'}reminders:due`;
}

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tasks: TasksService,
    private readonly notifications: NotificationsService,
    @Optional() private readonly redis?: RedisService,
    @Optional() private readonly eventBus?: EventEmitter2,
  ) {}

  /** 创建提醒（支持多档提前量 leads → 每条一档；触发时间不得早于当前） */
  async create(user: AuthUser, dto: CreateReminderDto, taskId?: string) {
    const finalTaskId = taskId ?? dto.taskId;
    if (finalTaskId) await this.tasks.assertTaskVisible(finalTaskId, user); // 任务可见性（40401 防探测）
    if (dto.triggerAt.getTime() < Date.now()) {
      throw new BadRequestException({ code: E.BAD_REQUEST, message: 'trigger_at 不能早于当前时间' });
    }
    const leads = dto.leads?.length ? dto.leads : [dto.leadMinutes ?? 0];
    const created = await this.prisma.$transaction(async tx => {
      const list: Reminder[] = [];
      for (const lead of leads) {
        const triggerAt = new Date(dto.triggerAt.getTime() - (lead ?? 0) * 60 * 1000);
        if (triggerAt.getTime() < Date.now()) continue; // 已过期的提前档跳过（TODO：是否改为立即触发，产品口径待定）
        const reminder = await tx.reminder.create({
          data: {
            tenantId: user.tenantId,
            userId: user.userId,
            taskId: finalTaskId,
            reminderType: dto.reminderType ?? 'custom',
            triggerAt,
            leadMinutes: lead ?? 0,
            payload: (dto.payload ?? {}) as Prisma.InputJsonValue,
            status: 'scheduled',
          },
        });
        await this.audit.record(
          { tenantId: user.tenantId, actorId: user.userId, action: 'reminder.create', resourceType: 'reminder', resourceId: reminder.id, after: reminder },
          tx,
        );
        list.push(reminder);
      }
      return list;
    });
    for (const r of created) await this.syncZset(r.id, r.triggerAt);
    return created;
  }

  /** 本人提醒列表 */
  async list(user: AuthUser, query: ReminderQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 50, 100);
    const where: Prisma.ReminderWhereInput = {
      tenantId: user.tenantId,
      userId: user.userId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.reminder.findMany({ where, orderBy: { triggerAt: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.reminder.count({ where }),
    ]);
    return { data: items, meta: { page, pageSize, total } };
  }

  /** 任务维度提醒（本人视角） */
  async listByTask(taskId: string, user: AuthUser, query: ReminderQueryDto) {
    await this.tasks.assertTaskVisible(taskId, user);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 50, 100);
    const where: Prisma.ReminderWhereInput = {
      tenantId: user.tenantId,
      userId: user.userId,
      taskId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.reminder.findMany({ where, orderBy: { triggerAt: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.reminder.count({ where }),
    ]);
    return { data: items, meta: { page, pageSize, total } };
  }

  /** 更新提醒（改 trigger_at 同步 zset；status 手动取消/恢复） */
  async update(id: string, user: AuthUser, dto: UpdateReminderDto) {
    const reminder = await this.loadOwnOr404(id, user);
    if (dto.triggerAt && dto.triggerAt.getTime() < Date.now()) {
      throw new BadRequestException({ code: E.BAD_REQUEST, message: 'trigger_at 不能早于当前时间' });
    }
    const data: Prisma.ReminderUpdateInput = {
      ...(dto.triggerAt ? { triggerAt: dto.triggerAt } : {}),
      ...(dto.leadMinutes !== undefined ? { leadMinutes: dto.leadMinutes } : {}),
      ...(dto.payload ? { payload: dto.payload as Prisma.InputJsonValue } : {}),
    };
    if (dto.status) {
      if (dto.status === 'cancelled') data.status = 'cancelled';
      else if (dto.status === 'scheduled' && reminder.status === 'cancelled') data.status = 'scheduled';
      else throw new BadRequestException({ code: E.BAD_REQUEST, message: `不支持的状态变更：${reminder.status} → ${dto.status}` });
    }
    const updated = await this.prisma.reminder.update({ where: { id }, data });
    await this.audit.record(
      { tenantId: user.tenantId, actorId: user.userId, action: 'reminder.update', resourceType: 'reminder', resourceId: id, before: reminder, after: updated },
    );
    if (updated.status === 'scheduled') await this.syncZset(updated.id, updated.triggerAt);
    else await this.syncZset(updated.id, null);
    return updated;
  }

  /** 删除提醒（无 deleted_at 字段 → status=cancelled 语义，§3.2 域 7 reminders 表） */
  async remove(id: string, user: AuthUser) {
    const reminder = await this.loadOwnOr404(id, user);
    const updated = await this.prisma.reminder.update({ where: { id }, data: { status: 'cancelled' } });
    await this.audit.record(
      { tenantId: user.tenantId, actorId: user.userId, action: 'reminder.cancel', resourceType: 'reminder', resourceId: id, before: reminder, after: updated },
    );
    await this.syncZset(id, null);
    return updated;
  }

  /**
   * 触发提醒（worker 双路径调用）：原子认领 scheduled→fired（防 Redis/DB 双路径重复触发）→ DB 重读 → 站内通知 + reminder.due 事件。
   * TODO(★D7)：reminderType=deadline_approach 触发后走 AI 应急（emergency-plan）入口；IM 外发由 notifications 偏好路由。
   */
  async fire(id: string): Promise<void> {
    const now = new Date();
    const claimed = await this.prisma.reminder.updateMany({
      where: { id, status: 'scheduled', triggerAt: { lte: now } },
      data: { status: 'fired', firedAt: now },
    });
    if (claimed.count === 0) return; // 已被另一路径触发 / 已取消（防"幽灵提醒"）
    const reminder = await this.prisma.reminder.findUnique({ where: { id } });
    if (!reminder) return;
    const payload = (reminder.payload ?? {}) as { title?: string; body?: string };
    let title = payload.title ?? '任务提醒';
    let body = payload.body;
    if (reminder.taskId) {
      try {
        const task = await this.prisma.task.findFirst({ where: { id: reminder.taskId, tenantId: reminder.tenantId }, select: { title: true } });
        if (task) body = body ?? `任务「${task.title}」` + (reminder.reminderType === 'due' ? ' 已到截止时间' : ' 提醒时间到');
      } catch {
        // 任务已删：保持通用文案
      }
    }
    await this.notifications.notify({
      tenantId: reminder.tenantId,
      userId: reminder.userId,
      type: 'reminder.due',
      title,
      body,
      data: { reminderId: reminder.id, taskId: reminder.taskId, reminderType: reminder.reminderType },
    });
    this.eventBus?.emit(REMINDER_EVENTS.DUE, {
      reminderId: reminder.id,
      tenantId: reminder.tenantId,
      userId: reminder.userId,
      taskId: reminder.taskId,
      reminderType: reminder.reminderType,
    });
  }

  // ===================== 内部工具 =====================

  /** 加载本人提醒（40401 防存在性探测；提醒属私有资源，仅本人可操作） */
  private async loadOwnOr404(id: string, user: AuthUser): Promise<Reminder> {
    const reminder = await this.prisma.reminder.findFirst({ where: { id, tenantId: user.tenantId, userId: user.userId } });
    if (!reminder) throw new NotFoundException({ code: E.NOT_FOUND, message: '提醒不存在或不可见' });
    return reminder;
  }

  /** 同步 zset：triggerAt 非空 ZADD（score=毫秒时间戳），null 时 ZREM；Redis 不可用静默降级（DB 兜底扫描覆盖） */
  private async syncZset(reminderId: string, triggerAt: Date | null): Promise<void> {
    if (!this.redis) return;
    try {
      const client = await this.redis.getClient();
      if (triggerAt) {
        await client.zAdd(reminderZsetKey(), { score: triggerAt.getTime(), value: reminderId });
      } else {
        await client.zRem(reminderZsetKey(), reminderId);
      }
    } catch (err) {
      this.logger.warn(`zset 同步失败 reminder=${reminderId}（由 DB 兜底扫描覆盖）: ${(err as Error).message}`);
    }
  }
}
