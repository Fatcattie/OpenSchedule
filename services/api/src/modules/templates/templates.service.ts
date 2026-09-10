/**
 * templates.service.ts —— 模板库服务（B19）
 * v1 范围：项目模板 CRUD + 从项目保存为模板 + 从模板创建项目
 * 任务与依赖快照用 JSON 存储，不拆子表。
 */
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../../common/prisma/prisma.service'
import { AuthUser } from '../../common/decorators/current-user.decorator'

const E = { NOT_FOUND: 40401, FORBIDDEN: 40301 } as const

export interface TaskSnapshot {
  id: string
  title: string
  description?: string
  status?: string
  priority?: string
  estimatedHours?: number
  tags?: string[]
  sectionId?: string
  orderIndex?: number
  assigneePlaceholder?: string
}

export interface DependencySnapshot {
  prevTaskRef: string
  nextTaskRef: string
  type: 'FS' | 'SS' | 'FF' | 'SF'
  lagDays?: number
  isShared?: boolean
}

@Injectable()
export class TemplatesService {
  constructor(private prisma: PrismaService) {}

  // ========== 列表 & 详情 ==========

  async listTemplates(user: AuthUser, options: { type?: string; keyword?: string; isPublic?: boolean } = {}) {
    const where: any = {
      tenantId: user.tenantId,
      deletedAt: null,
    }
    if (options.type) where.type = options.type
    if (options.isPublic != null) where.isPublic = options.isPublic
    else {
      // 看自己的 + 公共的
      where.OR = [
        { ownerId: user.userId },
        { isPublic: true },
      ]
    }
    if (options.keyword) {
      where.AND = [
        {
          OR: [
            { name: { contains: options.keyword, mode: 'insensitive' } },
            { description: { contains: options.keyword, mode: 'insensitive' } },
            { tags: { has: options.keyword } },
          ],
        },
      ]
    }

    const templates = await this.prisma.projectTemplate.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        category: true,
        isPublic: true,
        taskCount: true,
        tags: true,
        ownerId: true,
        sourceProjectId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    })

    return { data: templates }
  }

  async getTemplate(id: string, user: AuthUser) {
    const tpl = await this.prisma.projectTemplate.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    })
    if (!tpl) throw new NotFoundException('模板不存在')
    // 权限：自己的 or 公开的
    if (tpl.ownerId !== user.userId && !tpl.isPublic) {
      throw new ForbiddenException('无权限查看此模板')
    }
    return { data: tpl }
  }

  // ========== 创建 & 更新 & 删除 ==========

  async createTemplate(user: AuthUser, input: {
    name: string
    description?: string
    type?: string
    category?: string
    isPublic?: boolean
    tags?: string[]
    taskSnapshot: TaskSnapshot[]
    dependencySnapshot?: DependencySnapshot[]
    sourceProjectId?: string
  }) {
    const taskCount = input.taskSnapshot.length
    const tpl = await this.prisma.projectTemplate.create({
      data: {
        tenantId: user.tenantId,
        name: input.name,
        description: input.description,
        type: input.type ?? 'project',
        category: input.category,
        isPublic: input.isPublic ?? false,
        tags: input.tags ?? [],
        taskSnapshot: input.taskSnapshot as any,
        dependencySnapshot: (input.dependencySnapshot ?? []) as any,
        taskCount,
        ownerId: user.userId,
        createdBy: user.userId,
        sourceProjectId: input.sourceProjectId,
      },
      select: {
        id: true, name: true, type: true, taskCount: true, isPublic: true, createdAt: true,
      },
    })
    return { data: tpl }
  }

  async updateTemplate(id: string, user: AuthUser, input: {
    name?: string
    description?: string
    category?: string
    isPublic?: boolean
    tags?: string[]
    taskSnapshot?: TaskSnapshot[]
    dependencySnapshot?: DependencySnapshot[]
  }) {
    const tpl = await this.prisma.projectTemplate.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    })
    if (!tpl) throw new NotFoundException('模板不存在')
    if (tpl.ownerId !== user.userId) {
      throw new ForbiddenException('只有创建者可修改模板')
    }

    const data: any = {}
    if (input.name !== undefined) data.name = input.name
    if (input.description !== undefined) data.description = input.description
    if (input.category !== undefined) data.category = input.category
    if (input.isPublic !== undefined) data.isPublic = input.isPublic
    if (input.tags !== undefined) data.tags = input.tags
    if (input.taskSnapshot !== undefined) {
      data.taskSnapshot = input.taskSnapshot as any
      data.taskCount = input.taskSnapshot.length
    }
    if (input.dependencySnapshot !== undefined) {
      data.dependencySnapshot = input.dependencySnapshot as any
    }

    const updated = await this.prisma.projectTemplate.update({
      where: { id },
      data,
      select: { id: true, name: true, taskCount: true, updatedAt: true },
    })
    return { data: updated }
  }

  async deleteTemplate(id: string, user: AuthUser) {
    const tpl = await this.prisma.projectTemplate.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    })
    if (!tpl) throw new NotFoundException('模板不存在')
    if (tpl.ownerId !== user.userId) {
      throw new ForbiddenException('只有创建者可删除模板')
    }
    await this.prisma.projectTemplate.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
    return { data: { id, deleted: true } }
  }

  // ========== 从项目保存为模板 ==========

  async saveProjectAsTemplate(projectId: string, user: AuthUser, input: {
    name: string
    description?: string
    isPublic?: boolean
    category?: string
    tags?: string[]
  }) {
    // 校验项目权限
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId: user.tenantId, deletedAt: null },
    })
    if (!project) throw new NotFoundException('项目不存在')

    // 拉任务
    const tasks = await this.prisma.task.findMany({
      where: { tenantId: user.tenantId, projectId, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        estimatedHours: true,
        tags: true,
        sortOrder: true,
      },
    })

    // 拉依赖
    const deps = await this.prisma.taskDependency.findMany({
      where: { tenantId: user.tenantId, projectId },
      select: { prevTaskId: true, nextTaskId: true, type: true, lagDays: true, isShared: true },
    })

    const taskSnapshot: TaskSnapshot[] = tasks.map(t => ({
      id: t.id,
      title: t.title,
      description: t.description ?? undefined,
      status: 'todo', // 模板里统一置为 todo
      priority: t.priority ?? undefined,
      estimatedHours: t.estimatedHours ? (t.estimatedHours as any).toNumber() : undefined,
      tags: t.tags,
      orderIndex: (t.sortOrder as any).toNumber ? (t.sortOrder as any).toNumber() : Number(t.sortOrder),
    }))

    const dependencySnapshot: DependencySnapshot[] = deps.map(d => ({
      prevTaskRef: d.prevTaskId,
      nextTaskRef: d.nextTaskId,
      type: d.type as any,
      lagDays: d.lagDays,
      isShared: d.isShared,
    }))

    return this.createTemplate(user, {
      name: input.name,
      description: input.description,
      type: 'project',
      category: input.category,
      isPublic: input.isPublic ?? false,
      tags: input.tags ?? [],
      taskSnapshot,
      dependencySnapshot,
      sourceProjectId: projectId,
    })
  }

  // ========== 从模板创建项目 ==========

  async applyTemplate(templateId: string, user: AuthUser, input: {
    name: string
    description?: string
  }) {
    const tpl = await this.prisma.projectTemplate.findFirst({
      where: { id: templateId, tenantId: user.tenantId, deletedAt: null },
    })
    if (!tpl) throw new NotFoundException('模板不存在')
    if (tpl.ownerId !== user.userId && !tpl.isPublic) {
      throw new ForbiddenException('无权限使用此模板')
    }

    const tasks = (tpl.taskSnapshot as any) as TaskSnapshot[]
    const deps = (tpl.dependencySnapshot as any) as DependencySnapshot[]

    // 1. 创建项目
    const project = await this.prisma.project.create({
      data: {
        tenantId: user.tenantId,
        name: input.name,
        description: input.description ?? tpl.description ?? undefined,
        ownerId: user.userId,
        createdBy: user.userId,
        status: 'active',
      },
      select: { id: true, name: true },
    })

    if (tasks.length === 0) {
      return { data: { projectId: project.id, projectName: project.name, taskCount: 0, dependencyCount: 0 } }
    }

    // 2. 批量创建任务（快照 id -> 真实 id 映射）
    const idMap = new Map<string, string>()
    let sortOrder = 0

    for (const t of tasks) {
      const created = await this.prisma.task.create({
        data: {
          tenantId: user.tenantId,
          projectId: project.id,
          title: t.title,
          description: t.description ?? null,
          status: t.status ?? 'todo',
          priority: t.priority ?? 'medium',
          estimatedHours: t.estimatedHours,
          tags: t.tags ?? [],
          sortOrder: t.orderIndex ?? sortOrder,
          createdBy: user.userId,
        },
        select: { id: true },
      })
      idMap.set(t.id, created.id)
      sortOrder += 10
    }

    // 3. 批量创建依赖
    let depCount = 0
    for (const d of deps) {
      const prevId = idMap.get(d.prevTaskRef)
      const nextId = idMap.get(d.nextTaskRef)
      if (!prevId || !nextId) continue // 跳过映射不上的
      await this.prisma.taskDependency.create({
        data: {
          tenantId: user.tenantId,
          projectId: project.id,
          prevTaskId: prevId,
          nextTaskId: nextId,
          type: d.type,
          lagDays: d.lagDays ?? 0,
          isShared: d.isShared ?? false,
        },
      })
      depCount++
    }

    return {
      data: {
        projectId: project.id,
        projectName: project.name,
        taskCount: tasks.length,
        dependencyCount: depCount,
      },
    }
  }
}
