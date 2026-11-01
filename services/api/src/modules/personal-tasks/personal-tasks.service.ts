/**
 * PersonalTasksService —— 个人任务（BC-04 / R6-2）：CRUD + 完成/重开 + 关联团队任务。
 * - 个人任务属主 = 当前用户（tenant_id + user_id 由服务强制，请求体不可指定租户/属主）；
 * - 状态机复用统一 TASK_TRANSITIONS（self-scoped ctx，见 personal-task.policy.ts）；
 * - 关联团队任务 linked_task_id 落地前校验同租户可见任务（防跨租户悬挂）；
 * - 全部写操作落审计（§3.1 审计铁律）。
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PersonalTask, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { TaskStatus } from '../../common/constants/task-status';
import type { AuthUser } from '../../common/auth/auth-user.interface';
import { assertPersonalTransition } from './personal-task.policy';
import { CreatePersonalTaskDto } from './dto/create-personal-task.dto';
import { UpdatePersonalTaskDto } from './dto/update-personal-task.dto';
import { CompletePersonalTaskDto } from './dto/complete-personal-task.dto';
import { ReopenPersonalTaskDto } from './dto/reopen-personal-task.dto';
import { PersonalTaskQueryDto } from './dto/personal-task-query.dto';

const E = { BAD_REQUEST: 40001, NOT_FOUND: 40401 } as const;

@Injectable()
export class PersonalTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** 列表：仅本人名下个人任务（tenant_id + user_id 双重谓词，铁律） */
  async list(user: AuthUser, query: PersonalTaskQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 50, 100);
    const where: Prisma.PersonalTaskWhereInput = {
      tenantId: user.tenantId,
      userId: user.userId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.personalTask.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.personalTask.count({ where }),
    ]);
    return { data: items, meta: { page, pageSize, total } };
  }

  /** 详情（本人名下；不可见一律 404 防存在性探测） */
  async getOne(user: AuthUser, id: string): Promise<PersonalTask> {
    return this.loadOr404(user, id);
  }

  /** 创建个人任务 */
  async create(user: AuthUser, dto: CreatePersonalTaskDto): Promise<PersonalTask> {
    if (dto.parentId) await this.assertParentValid(user, dto.parentId, null);
    if (dto.linkedTaskId) await this.assertLinkedTaskVisible(user.tenantId, dto.linkedTaskId);

    const task = await this.prisma.personalTask.create({
      data: {
        tenantId: user.tenantId,
        userId: user.userId,
        parentId: dto.parentId,
        title: dto.title,
        description: dto.description,
        status: TaskStatus.TODO,
        priority: dto.priority ?? 'medium',
        startAt: dto.startAt,
        endAt: dto.endAt,
        dueAt: dto.dueAt,
        estimatedHours: dto.estimatedHours,
        linkedTaskId: dto.linkedTaskId,
        tags: dto.tags ?? [],
      },
    });
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.userId,
      action: 'personal_task.create',
      resourceType: 'personal_task',
      resourceId: task.id,
      after: task,
    });
    return task;
  }

  /** 更新个人任务（含状态迁移；status 变更走统一状态机） */
  async update(user: AuthUser, id: string, dto: UpdatePersonalTaskDto): Promise<PersonalTask> {
    const task = await this.loadOr404(user, id);
    if (dto.parentId !== undefined && dto.parentId !== task.parentId) {
      await this.assertParentValid(user, dto.parentId, id);
    }
    if (dto.linkedTaskId !== undefined && dto.linkedTaskId !== task.linkedTaskId) {
      await this.assertLinkedTaskVisible(user.tenantId, dto.linkedTaskId);
    }

    const statusChanged = dto.status !== undefined && dto.status !== task.status;
    if (statusChanged) {
      assertPersonalTransition(task.status as TaskStatus, dto.status!, user, {
        reason: dto.reason,
        actualHours: dto.actualHours,
      });
    }

    const patch: Prisma.PersonalTaskUpdateInput = {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
      ...(dto.startAt !== undefined ? { startAt: dto.startAt } : {}),
      ...(dto.endAt !== undefined ? { endAt: dto.endAt } : {}),
      ...(dto.dueAt !== undefined ? { dueAt: dto.dueAt } : {}),
      ...(dto.estimatedHours !== undefined ? { estimatedHours: dto.estimatedHours } : {}),
      ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
      ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
      ...(dto.linkedTaskId !== undefined ? { linkedTaskId: dto.linkedTaskId } : {}),
    };
    if (statusChanged) {
      patch.status = dto.status!;
      if (dto.status === TaskStatus.DONE) {
        patch.completedAt = new Date();
        if (dto.actualHours != null) patch.actualHours = dto.actualHours;
      } else if (task.status === TaskStatus.DONE) {
        patch.completedAt = null; // 重开：completed_at 置空、actual_hours 保留
      }
    }
    const after = await this.prisma.personalTask.update({
      where: { id: task.id },
      data: patch,
    });
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.userId,
      action: 'personal_task.update',
      resourceType: 'personal_task',
      resourceId: task.id,
      before: task,
      after,
    });
    return after;
  }

  /** 完成（T4/T7：actual_hours 必填 ★D3） */
  async complete(user: AuthUser, id: string, dto: CompletePersonalTaskDto): Promise<PersonalTask> {
    const task = await this.loadOr404(user, id);
    assertPersonalTransition(task.status as TaskStatus, TaskStatus.DONE, user, { actualHours: dto.actualHours });
    const after = await this.prisma.personalTask.update({
      where: { id: task.id },
      data: { status: TaskStatus.DONE, actualHours: dto.actualHours, completedAt: new Date() },
    });
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.userId,
      action: 'personal_task.complete',
      resourceType: 'personal_task',
      resourceId: task.id,
      before: task,
      after,
    });
    return after;
  }

  /** 重开（T9：原因必填；completed_at 置空、actual_hours 保留） */
  async reopen(user: AuthUser, id: string, dto: ReopenPersonalTaskDto): Promise<PersonalTask> {
    const task = await this.loadOr404(user, id);
    assertPersonalTransition(task.status as TaskStatus, TaskStatus.TODO, user, { reason: dto.reason });
    const after = await this.prisma.personalTask.update({
      where: { id: task.id },
      data: { status: TaskStatus.TODO, completedAt: null },
    });
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.userId,
      action: 'personal_task.reopen',
      resourceType: 'personal_task',
      resourceId: task.id,
      before: task,
      after,
    });
    return after;
  }

  /** 软删（个人任务精简：直接软删，不做子树递归） */
  async softDelete(user: AuthUser, id: string): Promise<{ id: string; deleted: true }> {
    const task = await this.loadOr404(user, id);
    await this.prisma.personalTask.update({
      where: { id: task.id },
      data: { deletedAt: new Date() },
    });
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.userId,
      action: 'personal_task.delete',
      resourceType: 'personal_task',
      resourceId: task.id,
      before: task,
      after: { deletedAt: new Date() },
    });
    return { id: task.id, deleted: true };
  }

  // ===================== 内部工具 =====================

  /** 加载本人名下个人任务（tenant_id + user_id + 软删过滤；不可见 404） */
  private async loadOr404(user: AuthUser, id: string): Promise<PersonalTask> {
    const task = await this.prisma.personalTask.findFirst({
      where: { id, tenantId: user.tenantId, userId: user.userId, deletedAt: null },
    });
    if (!task) throw new NotFoundException({ code: E.NOT_FOUND, message: '个人任务不存在或不可见' });
    return task;
  }

  /** 父个人任务校验：须为本人名下任务，且不可把自己设为父（防环；深度上限留 P2） */
  private async assertParentValid(user: AuthUser, parentId: string | null | undefined, selfId: string | null): Promise<void> {
    if (!parentId) return;
    if (selfId && parentId === selfId) {
      throw new BadRequestException({ code: E.BAD_REQUEST, message: '不能把自己设为父任务（防环）' });
    }
    const parent = await this.prisma.personalTask.findFirst({
      where: { id: parentId, tenantId: user.tenantId, userId: user.userId, deletedAt: null },
      select: { id: true },
    });
    if (!parent) {
      throw new BadRequestException({ code: E.BAD_REQUEST, message: '父个人任务不存在或不可见' });
    }
  }

  /** 关联团队任务校验：同租户可见（防跨租户悬挂引用，铁律） */
  private async assertLinkedTaskVisible(tenantId: string, taskId: string): Promise<void> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!task) {
      throw new BadRequestException({ code: E.BAD_REQUEST, message: '关联的团队任务不存在或不可见' });
    }
  }
}