/**
 * 评论服务：评论/回复串 CRUD（软删）+ @提及解析占位 → 通知被提及人 + 事件（§3.4 评论/@ 权限行）。
 * 写操作单事务 + 审计；@解析仅限项目内成员，服务端解析为准。
 */
import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, Task, TaskComment } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OutboxService, type OutboxEventName } from '../../common/outbox/outbox.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TasksService } from '../tasks/tasks.service';
import { AuthUser, isTenantAdmin } from './current-user.decorator';
import { CommentQueryDto } from './dto/comment-query.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { ReplyCommentDto } from './dto/reply-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { COMMENT_EVENTS } from './events/comment.events';
import { parseMentions } from './mention.parser';

/** 评论模块错误码（§3.1 分段码表） */
const E = { BAD_REQUEST: 40001, FORBIDDEN: 40301, NOT_FOUND: 40401 } as const;

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tasks: TasksService,
    private readonly notifications: NotificationsService,
    private readonly outbox: OutboxService,
  ) {}

  /** 任务评论列表（tenant 谓词 + 软删过滤；按创建时间升序，parent_id 表达回复串） */
  async listByTask(taskId: string, user: AuthUser, query: CommentQueryDto) {
    const task = await this.tasks.assertTaskVisible(taskId, user);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 50, 100);
    const where: Prisma.TaskCommentWhereInput = { taskId: task.id, tenantId: user.tenantId, deletedAt: null };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.taskComment.findMany({ where, orderBy: { createdAt: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.taskComment.count({ where }),
    ]);
    return { data: items, meta: { page, pageSize, total } };
  }

  /** 发评论：服务端 @提及解析（精确匹配项目成员）→ 落库 mentions jsonb → 通知被提及人 + 事件 */
  async create(taskId: string, user: AuthUser, dto: CreateCommentDto) {
    const task = await this.tasks.assertTaskVisible(taskId, user);
    await this.assertCanComment(task, user);
    const members = await this.listMentionableMembers(task, user.tenantId);
    const mentions = parseMentions(dto.content, members);
    const comment = await this.prisma.$transaction(async tx => {
      const created = await tx.taskComment.create({
        data: {
          tenantId: user.tenantId,
          taskId: task.id,
          authorId: user.userId,
          content: dto.content,
          mentions: mentions as unknown as Prisma.InputJsonValue,
          isDecision: dto.isDecision ?? false,
        },
      });
      await this.audit.record(
        { tenantId: user.tenantId, actorId: user.userId, action: 'comment.create', resourceType: 'task_comment', resourceId: created.id, after: created },
        tx,
      );
      // R3 事务性 Outbox：评论/提及事件与写同事务落库（mentions 非空才发 mention.parsed）
      await this.outbox.publish(user.tenantId, COMMENT_EVENTS.CREATED as OutboxEventName, {
        taskId: task.id,
        projectId: task.projectId,
        commentId: created.id,
        actor: { id: user.userId, type: 'user' },
      }, tx);
      if (mentions.length > 0) {
        await this.outbox.publish(user.tenantId, COMMENT_EVENTS.MENTION_PARSED as OutboxEventName, {
          taskId: task.id,
          commentId: created.id,
          mentions,
          actor: { id: user.userId, type: 'user' },
        }, tx);
      }
      return created;
    });
    // 事务提交后：@提及 → 站内通知（跳过本人；领域事件已走 Outbox，工程决策 11）
    for (const m of mentions) {
      if (m.userId === user.userId) continue;
      await this.notifications.notify({
        tenantId: user.tenantId,
        userId: m.userId,
        type: 'mention',
        title: `有人在任务「${task.title}」的评论中提到了你`,
        data: { taskId: task.id, commentId: comment.id },
      });
    }
    return comment;
  }

  /** 回复（讨论串：parent_id = 被回复评论；@提及重新解析） */
  async reply(commentId: string, user: AuthUser, dto: ReplyCommentDto) {
    const parent = await this.loadCommentOr404(commentId, user);
    const task = await this.tasks.assertTaskVisible(parent.taskId, user);
    await this.assertCanComment(task, user);
    const members = await this.listMentionableMembers(task, user.tenantId);
    const mentions = parseMentions(dto.content, members);
    const comment = await this.prisma.$transaction(async tx => {
      const created = await tx.taskComment.create({
        data: {
          tenantId: user.tenantId,
          taskId: parent.taskId,
          authorId: user.userId,
          parentId: parent.id,
          content: dto.content,
          mentions: mentions as unknown as Prisma.InputJsonValue,
          isDecision: false,
        },
      });
      await this.audit.record(
        { tenantId: user.tenantId, actorId: user.userId, action: 'comment.reply', resourceType: 'task_comment', resourceId: created.id, after: created, before: { parentId: parent.id } },
        tx,
      );
      // R3 事务性 Outbox：回复评论事件与写同事务落库
      await this.outbox.publish(user.tenantId, COMMENT_EVENTS.CREATED as OutboxEventName, {
        taskId: parent.taskId,
        projectId: task.projectId,
        commentId: created.id,
        actor: { id: user.userId, type: 'user' },
      }, tx);
      if (mentions.length > 0) {
        await this.outbox.publish(user.tenantId, COMMENT_EVENTS.MENTION_PARSED as OutboxEventName, {
          taskId: parent.taskId,
          commentId: created.id,
          mentions,
          actor: { id: user.userId, type: 'user' },
        }, tx);
      }
      return created;
    });
    for (const m of mentions) {
      if (m.userId === user.userId) continue;
      await this.notifications.notify({
        tenantId: user.tenantId,
        userId: m.userId,
        type: 'mention',
        title: `有人在任务「${task.title}」的回复中提到了你`,
        data: { taskId: task.id, commentId: comment.id },
      });
    }
    return comment;
  }

  /** 编辑评论（作者本人、项目负责人、租户 Admin；TODO(Phase 2)：编辑后重新解析 mentions 并重发通知） */
  async update(id: string, user: AuthUser, dto: UpdateCommentDto) {
    const comment = await this.loadCommentOr404(id, user);
    await this.assertCanModerate(comment, user);
    const updated = await this.prisma.$transaction(async tx => {
      const after = await tx.taskComment.update({ where: { id: comment.id }, data: { content: dto.content } });
      await this.audit.record(
        { tenantId: user.tenantId, actorId: user.userId, action: 'comment.update', resourceType: 'task_comment', resourceId: comment.id, before: comment, after },
        tx,
      );
      return after;
    });
    return updated;
  }

  /** 软删评论（作者本人、项目负责人、租户 Admin；§3.5.1 DELETE /comments/:id 软删） */
  async softDelete(id: string, user: AuthUser) {
    const comment = await this.loadCommentOr404(id, user);
    await this.assertCanModerate(comment, user);
    return this.prisma.$transaction(async tx => {
      const after = await tx.taskComment.update({ where: { id: comment.id }, data: { deletedAt: new Date() } });
      await this.audit.record(
        { tenantId: user.tenantId, actorId: user.userId, action: 'comment.delete', resourceType: 'task_comment', resourceId: comment.id, before: comment, after },
        tx,
      );
      return after;
    });
  }

  // ===================== 内部工具 =====================

  /** 加载评论（tenant 谓词 + 软删过滤；40401 防存在性探测） */
  private async loadCommentOr404(id: string, user: AuthUser): Promise<TaskComment> {
    const comment = await this.prisma.taskComment.findFirst({ where: { id, tenantId: user.tenantId, deletedAt: null } });
    if (!comment) throw new NotFoundException({ code: E.NOT_FOUND, message: '评论不存在或不可见' });
    return comment;
  }

  /** 评论权限：项目成员+只读默认可评论（§3.4 评论/@ 创建行） */
  private async assertCanComment(task: Task, user: AuthUser): Promise<void> {
    const project = await this.prisma.project.findFirst({ where: { id: task.projectId!, tenantId: user.tenantId, deletedAt: null } });
    if (!project) throw new NotFoundException({ code: E.NOT_FOUND, message: '项目不存在或不可见' });
    if (isTenantAdmin(user) || project.ownerId === user.userId) return;
    const member = await this.prisma.userRole.findFirst({
      where: { tenantId: user.tenantId, userId: user.userId, scopeResourceId: project.id, role: { scope: 'project' } },
      select: { id: true },
    });
    if (!member) throw new ForbiddenException({ code: E.FORBIDDEN, message: '非项目成员，无权评论（§3.4）' });
  }

  /** 编辑/删除评论权限：作者本人、项目负责人、租户 Admin（§3.4 评论/@ 编辑删除行） */
  private async assertCanModerate(comment: TaskComment, user: AuthUser): Promise<void> {
    if (comment.authorId === user.userId || isTenantAdmin(user)) return;
    const task = await this.prisma.task.findFirst({ where: { id: comment.taskId, tenantId: user.tenantId }, select: { projectId: true } });
    if (!task?.projectId) throw new NotFoundException({ code: E.NOT_FOUND, message: '任务不存在或不可见' });
    const project = await this.prisma.project.findFirst({ where: { id: task.projectId, tenantId: user.tenantId }, select: { ownerId: true } });
    if (project?.ownerId === user.userId) return;
    throw new ForbiddenException({ code: E.FORBIDDEN, message: '仅作者本人、项目负责人或租户 Admin 可编辑/删除评论（§3.4）' });
  }

  /** 可提及成员：项目成员（user_roles scope=project）+ 项目负责人（派生身份）；解析仅限项目内（§3.4） */
  private async listMentionableMembers(task: Task, tenantId: string): Promise<{ id: string; displayName: string }[]> {
    const project = await this.prisma.project.findFirst({ where: { id: task.projectId!, tenantId, deletedAt: null }, select: { id: true, ownerId: true } });
    if (!project) return [];
    const rows = await this.prisma.userRole.findMany({
      where: { tenantId, scopeResourceId: project.id, role: { scope: 'project' } },
      include: { user: { select: { id: true, displayName: true } } },
    });
    const members = rows.map(r => ({ id: r.user.id, displayName: r.user.displayName }));
    if (project.ownerId && !members.some(m => m.id === project.ownerId)) {
      const owner = await this.prisma.user.findUnique({ where: { id: project.ownerId }, select: { id: true, displayName: true } });
      if (owner) members.push(owner);
    }
    return members;
  }
}
