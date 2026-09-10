/**
 * 依赖服务（B15）：
 * - 列表：GET /projects/:projectId/dependencies
 * - 创建：POST /projects/:projectId/dependencies（含自依赖/闭环/UNIQUE 校验）
 * - 删除：DELETE /dependencies/:id
 * - CPM 计划：GET /projects/:projectId/plan
 */
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { AuthUser, isTenantAdmin } from '../tasks/current-user.decorator';
import { CreateDependencyDto } from './dto/create-dependency.dto';
import { calculateCPM, PlanResult, TaskInput, DependencyOutput } from './cpm/cpm';

/** 分段错误码 */
const E = {
  BAD_REQUEST: 40001,
  FORBIDDEN: 40301,
  NOT_FOUND: 40401,
  CONFLICT_CYCLE: 40902,
} as const;

@Injectable()
export class DependenciesService {
  private readonly logger = new Logger(DependenciesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
  ) {}

  // ===================== 列表 =====================

  /** GET /projects/:projectId/dependencies */
  async listByProject(projectId: string, user: AuthUser) {
    const project = await this.loadProject(projectId, user.tenantId);
    await this.assertProjectAccess(project, user, 'view');

    const deps = await this.prisma.taskDependency.findMany({
      where: { projectId, tenantId: user.tenantId },
      include: {
        prevTask: { select: { id: true, title: true, status: true } },
        nextTask: { select: { id: true, title: true, status: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const items = deps.map(d => ({
      id: d.id,
      projectId: d.projectId!,
      prevTaskId: d.prevTaskId,
      nextTaskId: d.nextTaskId,
      type: d.type as 'FS' | 'SS' | 'FF' | 'SF',
      lagDays: d.lagDays,
      isShared: d.isShared,
      createdAt: d.createdAt.toISOString(),
      prevTask: d.prevTask ? { id: d.prevTask.id, title: d.prevTask.title, status: d.prevTask.status } : null,
      nextTask: d.nextTask ? { id: d.nextTask.id, title: d.nextTask.title, status: d.nextTask.status } : null,
    }));

    return { data: { items } };
  }

  // ===================== 创建 =====================

  /** POST /projects/:projectId/dependencies */
  async create(projectId: string, user: AuthUser, dto: CreateDependencyDto) {
    const project = await this.loadProject(projectId, user.tenantId);
    await this.assertProjectAccess(project, user, 'create');

    // 自依赖检测
    if (dto.prevTaskId === dto.nextTaskId) {
      throw new BadRequestException({ code: E.BAD_REQUEST, message: '不能创建自依赖（prevTaskId 与 nextTaskId 相同）' });
    }

    // 两任务必须属于本项目且存在
    const [prevTask, nextTask] = await this.prisma.$transaction([
      this.prisma.task.findFirst({
        where: { id: dto.prevTaskId, tenantId: user.tenantId, projectId, deletedAt: null },
        select: { id: true, status: true },
      }),
      this.prisma.task.findFirst({
        where: { id: dto.nextTaskId, tenantId: user.tenantId, projectId, deletedAt: null },
        select: { id: true, status: true },
      }),
    ]);

    if (!prevTask) throw new NotFoundException({ code: E.NOT_FOUND, message: '前置任务不存在或不可见' });
    if (!nextTask) throw new NotFoundException({ code: E.NOT_FOUND, message: '后置任务不存在或不可见' });

    // UNIQUE(prev,next,type) 冲突检测
    const existing = await this.prisma.taskDependency.findFirst({
      where: {
        tenantId: user.tenantId,
        prevTaskId: dto.prevTaskId,
        nextTaskId: dto.nextTaskId,
        type: dto.type ?? 'FS',
      },
    });
    if (existing) {
      throw new BadRequestException({ code: E.BAD_REQUEST, message: '该依赖已存在（UNIQUE 冲突）' });
    }

    // 闭环检测：临时加入该依赖，运行拓扑排序
    await this.assertNoCycle(projectId, user.tenantId, dto.prevTaskId, dto.nextTaskId, dto.type ?? 'FS');

    // 创建依赖
    const dep = await this.prisma.taskDependency.create({
      data: {
        tenantId: user.tenantId,
        projectId,
        prevTaskId: dto.prevTaskId,
        nextTaskId: dto.nextTaskId,
        type: dto.type ?? 'FS',
        lagDays: dto.lagDays ?? 0,
        isShared: dto.isShared ?? false,
        createdBy: user.userId,
      },
      include: {
        prevTask: { select: { id: true, title: true, status: true } },
        nextTask: { select: { id: true, title: true, status: true } },
      },
    });

    return {
      data: {
        id: dep.id,
        projectId: dep.projectId!,
        prevTaskId: dep.prevTaskId,
        nextTaskId: dep.nextTaskId,
        type: dep.type as 'FS' | 'SS' | 'FF' | 'SF',
        lagDays: dep.lagDays,
        isShared: dep.isShared,
        createdAt: dep.createdAt.toISOString(),
        prevTask: dep.prevTask ? { id: dep.prevTask.id, title: dep.prevTask.title, status: dep.prevTask.status } : null,
        nextTask: dep.nextTask ? { id: dep.nextTask.id, title: dep.nextTask.title, status: dep.nextTask.status } : null,
      },
    };
  }

  // ===================== 删除 =====================

  /** DELETE /dependencies/:id */
  async remove(id: string, user: AuthUser) {
    const dep = await this.prisma.taskDependency.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { projectId: true },
    });
    if (!dep) throw new NotFoundException({ code: E.NOT_FOUND, message: '依赖不存在或不可见' });

    const project = await this.loadProject(dep.projectId!, user.tenantId);
    await this.assertProjectAccess(project, user, 'edit');

    await this.prisma.taskDependency.delete({ where: { id, tenantId: user.tenantId } });
    return { data: { id, deleted: true } };
  }

  // ===================== CPM 计划 =====================

  /** GET /projects/:projectId/plan */
  async getPlan(projectId: string, user: AuthUser): Promise<{ data: PlanResult }> {
    const project = await this.loadProject(projectId, user.tenantId);
    await this.assertProjectAccess(project, user, 'view');

    // 加载项目内所有任务和依赖
    const [tasks, dependencies] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where: { projectId, tenantId: user.tenantId, deletedAt: null },
        select: {
          id: true,
          title: true,
          status: true,
          estimatedHours: true,
          dueAt: true,
        },
      }),
      this.prisma.taskDependency.findMany({
        where: { projectId, tenantId: user.tenantId },
        select: {
          id: true,
          prevTaskId: true,
          nextTaskId: true,
          type: true,
          lagDays: true,
        },
      }),
    ]);

    const taskInputs: TaskInput[] = tasks.map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      estimatedHours: t.estimatedHours?.toNumber() ?? null,
      dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    }));

    const depOutputs: DependencyOutput[] = dependencies.map(d => ({
      id: d.id,
      prevTaskId: d.prevTaskId,
      nextTaskId: d.nextTaskId,
      type: d.type as 'FS' | 'SS' | 'FF' | 'SF',
      lagDays: d.lagDays,
    }));

    const result = calculateCPM(projectId, taskInputs, depOutputs);
    return { data: result };
  }

  // ===================== 内部工具 =====================

  /** 加载项目（40401 防探测） */
  private async loadProject(projectId: string, tenantId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId, deletedAt: null },
    });
    if (!project) throw new NotFoundException({ code: E.NOT_FOUND, message: '项目不存在或不可见' });
    return project;
  }

  /** 项目访问权限（§3.4：view=项目成员+只读、租户 Admin；edit=项目负责人、租户 Admin） */
  private async assertProjectAccess(project: import('@prisma/client').Project, user: AuthUser, mode: 'view' | 'edit' | 'create'): Promise<void> {
    if (isTenantAdmin(user) || project.ownerId === user.userId) return;
    if (mode === 'edit') {
      throw new ForbiddenException({ code: E.FORBIDDEN, message: '仅项目负责人或租户 Admin 可执行此操作' });
    }
    const member = await this.prisma.userRole.findFirst({
      where: { tenantId: user.tenantId, userId: user.userId, scopeResourceId: project.id, role: { scope: 'project' } },
      select: { id: true },
    });
    if (!member) throw new ForbiddenException({ code: E.FORBIDDEN, message: '非项目成员，无权访问' });
  }

  /**
   * 闭环检测：将拟新增依赖加入后，对项目内所有活跃任务运行拓扑排序，有环则抛 40902。
   */
  private async assertNoCycle(projectId: string, tenantId: string, prevTaskId: string, nextTaskId: string, type: string): Promise<void> {
    const allDeps = await this.prisma.taskDependency.findMany({
      where: { projectId, tenantId },
      select: { prevTaskId: true, nextTaskId: true, type: true },
    });

    // 临时加入新依赖
    allDeps.push({ prevTaskId, nextTaskId, type });

    // 只考虑活跃任务（非 done/cancelled）
    const activeIdsSet = new Set<string>();
    const activeTasks = await this.prisma.task.findMany({
      where: { projectId, tenantId, deletedAt: null, status: { notIn: ['done', 'cancelled'] } },
      select: { id: true },
    });
    for (const t of activeTasks) {
      activeIdsSet.add(t.id);
    }

    // 过滤依赖（两端都是活跃任务）
    const validDeps = allDeps.filter(d => activeIdsSet.has(d.prevTaskId) && activeIdsSet.has(d.nextTaskId));
    const taskIds = Array.from(activeIdsSet);

    // Kahn 算法
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();
    for (const id of taskIds) {
      inDegree.set(id, 0);
      adj.set(id, []);
    }
    for (const d of validDeps) {
      adj.get(d.prevTaskId)!.push(d.nextTaskId);
      inDegree.set(d.nextTaskId, (inDegree.get(d.nextTaskId) ?? 0) + 1);
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    let count = 0;
    while (queue.length > 0) {
      const node = queue.shift()!;
      count++;
      for (const neighbor of adj.get(node) ?? []) {
        const newDeg = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) queue.push(neighbor);
      }
    }

    if (count !== taskIds.length) {
      throw new BadRequestException({ code: E.CONFLICT_CYCLE, message: '依赖闭环被拒' });
    }
  }
}
