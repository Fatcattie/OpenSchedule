/**
 * 承接服务：领取（先到先得 A5）/ 转移（免审批但审计 A5 默认）。
 * 领取=T1 状态迁移（todo→in_progress，复用 tasks 模块 applyTransition）；转移=assignee 变更 + 审计，不改状态。
 * 模块无独立表（读 tasks，§2 §3 模块表），写操作单事务 + 审计 + 通知 + 事件。
 */
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Project, Task } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { OutboxService, type OutboxEventName } from '../../common/outbox/outbox.service';
import { getAllowedTransitionsForActor, TaskStatus } from '../../common/constants/task-status';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TasksService } from '../tasks/tasks.service';
import { AuthUser, isTenantAdmin } from './current-user.decorator';
import { ClaimTaskDto } from './dto/claim-task.dto';
import { TransferTaskDto } from './dto/transfer-task.dto';
import { ASSIGNMENT_EVENTS } from './events/assignment.events';

/** 承接模块错误码（§3.1 分段码表） */
const E = { BAD_REQUEST: 40001, FORBIDDEN: 40301, NOT_FOUND: 40401, ILLEGAL_TRANSITION: 40902 } as const;

@Injectable()
export class AssignmentsService {
  private readonly logger = new Logger(AssignmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tasks: TasksService,
    private readonly notifications: NotificationsService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * 领取（T1：todo → in_progress；A5 默认先到先得）：
   * - 仅项目成员可领（§3.4 领取行）；已被他人领取 → 40902（无效的领取迁移）
   * - 已分配给自己 → 幂等返回；未分配 → 落 assignee + T1 迁移，全程审计
   */
  async claim(taskId: string, user: AuthUser, dto: ClaimTaskDto) {
    const { task, project } = await this.loadForAssignment(taskId, user);
    await this.assertProjectMember(project, user);
    // 先到先得（A5 默认已写死；TODO：变更只动配置不动架构）
    if (task.assigneeId && task.assigneeId !== user.userId) {
      throw new ConflictException({
        code: E.ILLEGAL_TRANSITION,
        message: '任务已被他人领取（先到先得，A5）',
        details: { allowed_transitions: [], currentAssigneeId: task.assigneeId },
      });
    }
    if (task.assigneeId === user.userId) return task; // 幂等：已是我领取
    if (task.status !== TaskStatus.TODO) {
      throw new ConflictException({
        code: E.ILLEGAL_TRANSITION,
        message: `非法领取：当前状态 ${task.status} 不可领取（仅 todo，T1）`,
        details: { allowed_transitions: getAllowedTransitionsForActor(task.status as TaskStatus, { userId: user.userId, assigneeId: task.assigneeId, projectOwnerId: project.ownerId, createdBy: task.createdBy, isTenantAdmin: isTenantAdmin(user) }, task) },
      });
    }
    const result = await this.prisma.$transaction(async tx => {
      // 原子占位：只有仍是 todo、未分配且版本未变化的请求可以赢得领取竞争。
      const claimed = await tx.task.updateMany({
        where: { id: task.id, tenantId: user.tenantId, status: TaskStatus.TODO, assigneeId: null, version: task.version },
        data: { assigneeId: user.userId, startedAt: task.startedAt ?? new Date() },
      });
      if (claimed.count !== 1) {
        throw new ConflictException({ code: E.ILLEGAL_TRANSITION, message: '任务已被他人领取或已发生版本变更，请刷新后重试' });
      }
      const claimedTask = await tx.task.findUniqueOrThrow({ where: { id: task.id } });
      const applied = await this.tasks.applyTransition(tx, claimedTask, TaskStatus.IN_PROGRESS, {
        ctx: { userId: user.userId, assigneeId: user.userId, projectOwnerId: project.ownerId, createdBy: claimedTask.createdBy, isTenantAdmin: isTenantAdmin(user) },
        expectedVersion: dto.version,
        action: 'task.claim',
      });
      // R3 事务性 Outbox：task.assigned 与领取同事务落库（task.status_changed 已由 applyTransition 覆盖，不重复发）
      await this.outbox.publish(user.tenantId, ASSIGNMENT_EVENTS.ASSIGNED as OutboxEventName, {
        taskId: task.id,
        projectId: project.id,
        assigneeId: user.userId,
        actor: { id: user.userId, type: 'user' },
      }, tx);
      return applied;
    });
    // 事务提交后：T1 副作用通知项目负责人（站内同步通知；领域事件已走 Outbox）
    if (project.ownerId !== user.userId) {
      await this.notifications.notify({
        tenantId: user.tenantId,
        userId: project.ownerId!, // 上方已判非 ownerId 不等于当前用户，此处类型断言（schema owner_id 可空）
        type: 'task.status_changed',
        title: `任务「${result.title}」已被领取并开始执行`,
        data: { taskId: task.id, projectId: project.id, status: TaskStatus.IN_PROGRESS },
      });
    }
    return result;
  }

  /**
   * 转移（§3.4 转移行：assignee 本人、项目负责人、租户 Admin；目标必须是项目成员；免审批但审计 A5 默认）。
   * 转移不改变任务状态，仅变更 assignee + started_at + 审计 + 通知目标人。
   */
  async transfer(taskId: string, user: AuthUser, dto: TransferTaskDto) {
    const { task, project } = await this.loadForAssignment(taskId, user);
    const canTransfer = isTenantAdmin(user) || project.ownerId === user.userId || task.assigneeId === user.userId;
    if (!canTransfer) throw new ForbiddenException({ code: E.FORBIDDEN, message: '转移仅 assignee 本人、项目负责人或租户 Admin 可操作（§3.4）' });
    // 目标必须是项目成员（owner 由派生身份放行）
    if (dto.targetUserId !== project.ownerId) {
      const member = await this.prisma.userRole.findFirst({
        where: { tenantId: user.tenantId, userId: dto.targetUserId, scopeResourceId: project.id, role: { scope: 'project' } },
        select: { id: true },
      });
      if (!member) throw new BadRequestException({ code: E.BAD_REQUEST, message: '目标必须是本项目成员（§3.4）' });
    }
    if (dto.targetUserId === task.assigneeId) return task; // 幂等
    const result = await this.prisma.$transaction(async tx => {
      this.tasks.assertTaskVersion(task, dto.version); // 携带 version 则校验（40901）
      const updated = await tx.task.update({
        where: { id: task.id },
        data: { assigneeId: dto.targetUserId, startedAt: task.startedAt ?? new Date(), version: { increment: 1 } },
      });
      // 免审批但审计（A5 默认）：before/after 含 assignee 与转移原因
      await this.audit.record(
        {
          tenantId: user.tenantId,
          actorId: user.userId,
          action: 'task.transfer',
          resourceType: 'task',
          resourceId: task.id,
          before: { assigneeId: task.assigneeId, status: task.status },
          after: { ...updated, transferReason: dto.reason ?? null },
        },
        tx,
      );
      // R3 事务性 Outbox：task.assigned（转移）与 assignee 变更同事务落库
      await this.outbox.publish(user.tenantId, ASSIGNMENT_EVENTS.ASSIGNED as OutboxEventName, {
        taskId: task.id,
        projectId: project.id,
        assigneeId: dto.targetUserId,
        transferredBy: user.userId,
        actor: { id: user.userId, type: 'user' },
      }, tx);
      return updated;
    });
    await this.notifications.notify({
      tenantId: user.tenantId,
      userId: dto.targetUserId,
      type: 'task.assigned',
      title: `任务「${result.title}」已转移给你`,
      data: { taskId: task.id, projectId: project.id, reason: dto.reason },
    });
    return result;
  }

  // ===================== 内部工具 =====================

  /** 加载任务 + 项目（tenant 谓词 + 软删过滤；40401 防存在性探测） */
  private async loadForAssignment(taskId: string, user: AuthUser): Promise<{ task: Task; project: Project }> {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, tenantId: user.tenantId, deletedAt: null } });
    if (!task || !task.projectId) throw new NotFoundException({ code: E.NOT_FOUND, message: '任务不存在或不可见' });
    const project = await this.prisma.project.findFirst({ where: { id: task.projectId, tenantId: user.tenantId, deletedAt: null } });
    if (!project) throw new NotFoundException({ code: E.NOT_FOUND, message: '项目不存在或不可见' });
    return { task, project };
  }

  /** 项目成员断言（§3.4 领取：项目成员；先到先得 A5） */
  private async assertProjectMember(project: Project, user: AuthUser): Promise<void> {
    if (isTenantAdmin(user) || project.ownerId === user.userId) return;
    const member = await this.prisma.userRole.findFirst({
      where: { tenantId: project.tenantId, userId: user.userId, scopeResourceId: project.id, role: { scope: 'project' } },
      select: { id: true },
    });
    if (!member) throw new ForbiddenException({ code: E.FORBIDDEN, message: '非项目成员，无权领取（§3.4）' });
  }
}
