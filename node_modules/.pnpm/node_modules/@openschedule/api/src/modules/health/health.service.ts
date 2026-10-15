/**
 * health.service.ts —— 项目健康度 & 临期保障服务
 *
 * 健康度实时计算，不落表（轻量、即时）
 * 应急建议走 ai_proposals 表（type=emergency，草稿态）
 *
 * 注意：Task 无 progress 字段，按 status 粗估：
 *   todo → 0%
 *   in_progress → 50%
 *   blocked → 0%
 *   done → 100%
 *   cancelled → 不计入
 */
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../../common/prisma/prisma.service'
import { AuthUser, isTenantAdmin } from '../../common/decorators/current-user.decorator'
import { AuditService } from '../../common/audit/audit.service'
import { calculateHealthScore } from './health-scorer'
import { generateEmergencySuggestions } from './emergency-engine'
import type {
  HealthScoreDto,
  HealthRiskDto,
  PortfolioHealthDto,
  EmergencySuggestionDto,
} from './dto/health.dto'

const E = { NOT_FOUND: 40401, FORBIDDEN: 40301 } as const

/** 按状态粗估进度百分比 */
function estimateProgress(status: string): number {
  switch (status) {
    case 'done': return 100
    case 'in_progress': return 50
    case 'todo':
    case 'blocked':
    default: return 0
  }
}

@Injectable()
export class HealthService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ========== 加载项目 & 权限校验 ==========
  private async loadProject(projectId: string, tenantId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId, tenantId, deletedAt: null },
      include: {
        tasks: { where: { deletedAt: null } },
        dependencies: true,
      },
    })
    if (!project) throw new NotFoundException('项目不存在')
    return project
  }

  private assertProjectAccess(project: any, user: AuthUser, _level: 'view' | 'edit' = 'view') {
    const isOwner = project.ownerId === user.userId
    const isAdmin = isTenantAdmin(user)
    // 项目成员：通过任务负责人判断（项目无 memberIds 字段）
    const assignees = new Set(project.tasks.map((t: any) => t.assigneeId).filter(Boolean))
    const isMember = assignees.has(user.userId)

    if (!isOwner && !isAdmin && !isMember) {
      throw new ForbiddenException('无权限访问该项目')
    }
  }

  // ========== 项目健康度 ==========
  async getProjectHealth(projectId: string, user: AuthUser): Promise<HealthScoreDto> {
    const project = await this.loadProject(projectId, user.tenantId)
    this.assertProjectAccess(project, user, 'view')

    const now = new Date()

    // 转换为评分引擎格式
    const tasks = project.tasks.map((t: any) => ({
      id: t.id,
      status: t.status,
      progress: estimateProgress(t.status),
      estimatedHours: Number(t.estimatedHours ?? 0),
      actualHours: t.actualHours ? Number(t.actualHours) : undefined,
      dueDate: t.dueAt ?? undefined,
      assigneeId: t.assigneeId ?? undefined,
      priority: t.priority,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }))

    const dependencies = project.dependencies.map((d: any) => ({
      id: d.id,
      fromTaskId: d.prevTaskId,
      toTaskId: d.nextTaskId,
      type: d.type,
      status: 'active',
    }))

    // 项目周期：createdAt → deadline（或 createdAt + 30 天）
    const startDate = project.createdAt
    const endDate = project.deadline ?? new Date(startDate.getTime() + 30 * 86400000)

    const result = calculateHealthScore({
      project: {
        id: project.id,
        startDate,
        endDate,
        totalTasks: project.tasks.length,
      },
      tasks,
      dependencies,
      now,
    })

    // 统计信息
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000
    const activeTasks = project.tasks.filter((t: any) => t.status !== 'done' && t.status !== 'cancelled')
    const taskStats = {
      total: project.tasks.length,
      done: project.tasks.filter((t: any) => t.status === 'done').length,
      inProgress: project.tasks.filter((t: any) => t.status === 'in_progress').length,
      blocked: project.tasks.filter((t: any) => t.status === 'blocked').length,
      todo: project.tasks.filter((t: any) => t.status === 'todo').length,
      overdue: activeTasks.filter((t: any) => t.dueAt && t.dueAt < now).length,
      nearDue: activeTasks.filter((t: any) => {
        if (!t.dueAt) return false
        const diff = t.dueAt.getTime() - now.getTime()
        return diff > 0 && diff <= threeDaysMs && estimateProgress(t.status) < 50
      }).length,
    }

    return {
      projectId: project.id,
      score: result.score,
      level: result.level,
      dimensions: result.dimensions,
      risks: result.risks as HealthRiskDto[],
      suggestions: result.suggestions,
      computedAt: result.computedAt.toISOString(),
      taskStats,
    }
  }

  // ========== 风险清单 ==========
  async getProjectRisks(projectId: string, user: AuthUser): Promise<HealthRiskDto[]> {
    const health = await this.getProjectHealth(projectId, user)
    return health.risks
  }

  // ========== 组合健康度概览 ==========
  async getPortfolioHealth(user: AuthUser): Promise<PortfolioHealthDto> {
    // 我参与的项目：我是 owner，或是任务负责人
    const ownedOrAssignedProjects = await this.prisma.project.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
        OR: [
          { ownerId: user.userId },
          { tasks: { some: { assigneeId: user.userId, deletedAt: null } } },
        ],
      },
      include: {
        tasks: { where: { deletedAt: null } },
        dependencies: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    })

    const items = ownedOrAssignedProjects.map((project: any) => {
      const tasks = project.tasks.map((t: any) => ({
        id: t.id,
        status: t.status,
        progress: estimateProgress(t.status),
        estimatedHours: Number(t.estimatedHours ?? 0),
        dueDate: t.dueAt ?? undefined,
        assigneeId: t.assigneeId ?? undefined,
        priority: t.priority,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }))

      const startDate = project.createdAt
      const endDate = project.deadline ?? new Date(startDate.getTime() + 30 * 86400000)

      const result = calculateHealthScore({
        project: { id: project.id, startDate, endDate, totalTasks: project.tasks.length },
        tasks,
        dependencies: project.dependencies.map((d: any) => ({
          id: d.id,
          fromTaskId: d.prevTaskId,
          toTaskId: d.nextTaskId,
          type: d.type,
          status: 'active',
        })),
      })

      const totalEstimated = tasks.reduce((s: number, t: any) => s + (t.estimatedHours || 0), 0)
      const completedEstimated = tasks
        .filter((t: any) => t.status === 'done')
        .reduce((s: number, t: any) => s + (t.estimatedHours || 0), 0)
      const progress = totalEstimated > 0 ? Math.round((completedEstimated / totalEstimated) * 100) : 0

      return {
        projectId: project.id,
        projectName: project.name,
        score: result.score,
        level: result.level,
        riskCount: result.risks.length,
        taskCount: project.tasks.length,
        progress,
        endDate: project.deadline?.toISOString(),
      }
    })

    const greenCount = items.filter(i => i.level === 'green').length
    const yellowCount = items.filter(i => i.level === 'yellow').length
    const redCount = items.filter(i => i.level === 'red').length
    const averageScore = items.length > 0
      ? Math.round(items.reduce((s, i) => s + i.score, 0) / items.length)
      : 100

    return {
      items,
      total: items.length,
      greenCount,
      yellowCount,
      redCount,
      averageScore,
    }
  }

  // ========== 生成应急建议 ==========
  async generateEmergency(
    projectId: string,
    user: AuthUser,
    focusAreas?: string[],
  ): Promise<EmergencySuggestionDto> {
    const project = await this.loadProject(projectId, user.tenantId)
    if (!isTenantAdmin(user) && project.ownerId !== user.userId) {
      throw new ForbiddenException('无权限生成应急建议')
    }

    const tasks = project.tasks.map((t: any) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      progress: estimateProgress(t.status),
      estimatedHours: Number(t.estimatedHours ?? 0),
      dueDate: t.dueAt ?? undefined,
      assigneeId: t.assigneeId ?? undefined,
      priority: t.priority,
    }))

    // 计算成员负载
    const assigneeMap = new Map<string, { count: number; hours: number }>()
    for (const t of project.tasks) {
      const task = t as any
      if (!task.assigneeId) continue
      if (task.status !== 'in_progress' && task.status !== 'todo') continue
      if (!assigneeMap.has(task.assigneeId)) assigneeMap.set(task.assigneeId, { count: 0, hours: 0 })
      const m = assigneeMap.get(task.assigneeId)!
      if (task.status === 'in_progress') m.count++
      m.hours += Number(task.estimatedHours ?? 0)
    }
    const memberLoads = [...assigneeMap.entries()].map(([assigneeId, m]) => ({
      assigneeId,
      inProgressCount: m.count,
      totalHours: m.hours,
    }))

    const result = generateEmergencySuggestions({
      projectId: project.id,
      projectName: project.name,
      tasks,
      dependencies: project.dependencies.map((d: any) => ({
        id: d.id,
        fromTaskId: d.prevTaskId,
        toTaskId: d.nextTaskId,
        type: d.type,
      })),
      memberLoads,
      focusAreas,
    })

    // 写入 ai_proposals（草稿态）
    const proposal = await this.prisma.aiProposal.create({
      data: {
        tenantId: user.tenantId,
        type: 'emergency',
        status: 'pending',
        source: 'auto_health',
        relatedProjectId: project.id,
        proposerId: user.userId,
        payload: {
          summary: result.summary,
          actions: result.actions,
          riskScoreBefore: result.riskScoreBefore,
          riskScoreAfterEstimate: result.riskScoreAfterEstimate,
        } as any,
        diffSummary: {
          actions: result.actions.map((a: any) => ({ type: a.actionType, title: a.title })),
          estimatedRiskReduction: result.riskScoreBefore - result.riskScoreAfterEstimate,
        } as any,
        expiresAt: new Date(Date.now() + 72 * 3600 * 1000),
      },
    })

    await this.audit.record({
      action: 'ai_proposal.create',
      resourceType: 'AiProposal',
      resourceId: proposal.id,
      tenantId: user.tenantId,
      actorId: user.userId,
      after: { id: proposal.id, type: 'emergency', actionCount: result.actions.length },
    })

    return {
      proposalId: proposal.id,
      projectId: project.id,
      actions: result.actions.map(a => ({
        id: a.id,
        actionType: a.actionType,
        title: a.title,
        rationale: a.rationale,
        impact: a.impact,
        targetTaskIds: a.targetTaskIds,
        targetAssigneeIds: a.targetAssigneeIds,
        effortHours: a.effortHours,
        riskReductionEstimate: a.riskReductionEstimate,
      })),
      riskScoreBefore: result.riskScoreBefore,
      riskScoreAfterEstimate: result.riskScoreAfterEstimate,
      summary: result.summary,
      generatedAt: result.generatedAt.toISOString(),
    }
  }
}