/**
 * 项目服务：CRUD / 归档 / 成员可见性校验（§3.4 权限矩阵 + §3.5.1 /projects 端点）。
 * 全部写操作单事务 + audit_logs 审计；查询强制 tenant_id 谓词（多租户铁律）。
 */
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Project, Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthUser, CurrentUser, isTenantAdmin } from './current-user.decorator';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectQueryDto, ProjectStatus } from './dto/project-query.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { PROJECT_EVENTS } from './events/project.events';

/** 项目错误码（§3.1 分段码表：400x 校验 / 40301 越权 / 40401 不存在或不可见） */
const E = { BAD_REQUEST: 40001, FORBIDDEN: 40301, NOT_FOUND: 40401 } as const;

/** 排序白名单（§3.1：sort 参数走白名单） */
const SORT_WHITELIST: Record<string, Prisma.ProjectOrderByWithRelationInput> = {
  createdAt: { createdAt: 'asc' },
  '-createdAt': { createdAt: 'desc' },
  updatedAt: { updatedAt: 'asc' },
  '-updatedAt': { updatedAt: 'desc' },
  deadline: { deadline: 'asc' },
  '-deadline': { deadline: 'desc' },
  name: { name: 'asc' },
  '-name': { name: 'desc' },
};

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly eventBus?: EventEmitter2,
  ) {}

  /** 项目列表（租户隔离；status/search 过滤；X-Total-Count 由 controller 设置） */
  async list(user: AuthUser, query: ProjectQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where: Prisma.ProjectWhereInput = {
      tenantId: user.tenantId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const orderBy = SORT_WHITELIST[query.sort ?? '-createdAt'];
    const [items, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.project.count({ where }),
    ]);
    return { data: items, meta: { page, pageSize, total } };
  }

  /** 创建项目：创建者自动成为项目负责人（§3.4 项目·创建：租户 Admin；创建者即 owner） */
  async create(user: AuthUser, dto: CreateProjectDto) {
    if (dto.deadline && dto.deadline.getTime() < Date.now()) {
      throw new BadRequestException({ code: E.BAD_REQUEST, message: 'deadline 不能早于当前时间' });
    }
    const project = await this.prisma.$transaction(async tx => {
      const created = await tx.project.create({
        data: {
          tenantId: user.tenantId,
          name: dto.name,
          description: dto.description,
          deadline: dto.deadline,
          ownerId: user.userId,
          status: ProjectStatus.ACTIVE,
          createdBy: user.userId,
          workflowId: dto.workflowId, // Phase 2 占位
        },
      });
      await this.audit.record(
        { tenantId: user.tenantId, actorId: user.userId, actorType: 'user', action: 'project.create', resourceType: 'project', resourceId: created.id, after: created },
        tx,
      );
      return created;
    });
    // 事务提交后发布事件（工程决策 11）
    this.eventBus?.emit(PROJECT_EVENTS.UPDATED, { projectId: project.id, tenantId: project.tenantId, status: project.status });
    return project;
  }

  /** 项目详情（40401 防存在性探测：跨租户/已删除一律 40401） */
  async getOne(id: string, user: AuthUser) {
    const project = await this.loadVisibleProject(id, user);
    return project;
  }

  /** 更新项目：仅项目负责人、租户 Admin（§3.4 项目·编辑） */
  async update(id: string, user: AuthUser, dto: UpdateProjectDto) {
    const project = await this.loadVisibleProject(id, user);
    await this.assertProjectPermission(project, user, 'edit');
    if (dto.deadline && dto.deadline.getTime() < Date.now()) {
      throw new BadRequestException({ code: E.BAD_REQUEST, message: 'deadline 不能早于当前时间' });
    }
    const updated = await this.prisma.$transaction(async tx => {
      const after = await tx.project.update({
        where: { id: project.id },
        data: { name: dto.name, description: dto.description, deadline: dto.deadline, workflowId: dto.workflowId },
      });
      await this.audit.record(
        { tenantId: user.tenantId, actorId: user.userId, action: 'project.update', resourceType: 'project', resourceId: project.id, before: project, after },
        tx,
      );
      return after;
    });
    this.eventBus?.emit(PROJECT_EVENTS.UPDATED, { projectId: updated.id, tenantId: updated.tenantId, status: updated.status });
    return updated;
  }

  /** 归档：status → archived（与删除语义分离，§3.5.1 POST /projects/:id/archive） */
  async archive(id: string, user: AuthUser) {
    const project = await this.loadVisibleProject(id, user);
    await this.assertProjectPermission(project, user, 'edit');
    if (project.status === ProjectStatus.ARCHIVED) return project; // 幂等
    const updated = await this.prisma.$transaction(async tx => {
      const after = await tx.project.update({ where: { id: project.id }, data: { status: ProjectStatus.ARCHIVED } });
      await this.audit.record(
        { tenantId: user.tenantId, actorId: user.userId, action: 'project.archive', resourceType: 'project', resourceId: project.id, before: project, after },
        tx,
      );
      return after;
    });
    this.eventBus?.emit(PROJECT_EVENTS.ARCHIVED, { projectId: updated.id, tenantId: updated.tenantId });
    // TODO: 归档后是否递归归档项目下未完成任务（产品口径待定；Phase 1 仅归档项目本身）
    return updated;
  }

  /** 软删（DELETE /projects/:id = 软删；T13 语义：有子资源时禁止物理删除，此处一律软删） */
  async softDelete(id: string, user: AuthUser) {
    const project = await this.loadVisibleProject(id, user);
    await this.assertProjectPermission(project, user, 'edit');
    const deleted = await this.prisma.$transaction(async tx => {
      const after = await tx.project.update({ where: { id: project.id }, data: { deletedAt: new Date() } });
      await this.audit.record(
        { tenantId: user.tenantId, actorId: user.userId, action: 'project.delete', resourceType: 'project', resourceId: project.id, before: project, after },
        tx,
      );
      return after;
    });
    // TODO: 项目删除后其任务/依赖的处理策略（产品口径；Phase 1 仅软删项目本身）
    return deleted;
  }

  /** 甘特/时间轴数据（Phase 2 占位：返回任务级最小字段，完整实现见 plans/scheduling 模块） */
  async timeline(id: string, user: AuthUser) {
    const project = await this.loadVisibleProject(id, user);
    // TODO(Phase 2)：返回甘特数据（任务树 + 依赖 + 关键路径），当前占位空数组
    void project;
    return { data: [], meta: { page: 1, pageSize: 0, total: 0 } };
  }

  /** 里程碑列表（Phase 2 占位：milestones 表 Phase 2 建表，见 chapter_03 §3.2 域 3） */
  async listMilestones(id: string, user: AuthUser) {
    const project = await this.loadVisibleProject(id, user);
    void project;
    return { data: [], meta: { page: 1, pageSize: 0, total: 0 } };
  }

  /** 项目成员判定（user_roles × roles scope=project；项目负责人由 owner_id 派生，非独立角色实体） */
  async isProjectMember(projectId: string, userId: string, tenantId: string): Promise<boolean> {
    const row = await this.prisma.userRole.findFirst({
      where: { tenantId, userId, scopeResourceId: projectId, role: { scope: 'project' } },
      select: { id: true },
    });
    return row !== null;
  }

  /** 加载可见项目（tenant 谓词 + 软删过滤 + 查看权限；不可见一律 40401 防存在性探测） */
  async loadVisibleProject(id: string, user: AuthUser): Promise<Project> {
    const project = await this.prisma.project.findFirst({ where: { id, tenantId: user.tenantId, deletedAt: null } });
    if (!project) throw new NotFoundException({ code: E.NOT_FOUND, message: '项目不存在或不可见' });
    await this.assertProjectPermission(project, user, 'view');
    return project;
  }

  /** 项目权限断言（§3.4：view=项目成员+只读、租户 Admin；edit=项目负责人、租户 Admin） */
  async assertProjectPermission(project: Project, user: AuthUser, mode: 'view' | 'edit'): Promise<void> {
    if (isTenantAdmin(user) || project.ownerId === user.userId) return;
    if (mode === 'edit') {
      throw new ForbiddenException({ code: E.FORBIDDEN, message: '仅项目负责人或租户 Admin 可执行此操作' });
    }
    const member = await this.isProjectMember(project.id, user.userId, project.tenantId);
    if (!member) throw new ForbiddenException({ code: E.FORBIDDEN, message: '非项目成员，无权访问' });
  }
}
