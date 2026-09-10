/**
 * resource-pool.service.ts —— 跨项目资源池服务
 *
 * 实时聚合：不拉固定表，从 Project/Task 实时查
 * 再平衡建议：写 ai_proposals（type=rebalance，草稿态）
 */
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma/prisma.service'
import { AuthUser } from '../../common/decorators/current-user.decorator'
import { AuditService } from '../../common/audit/audit.service'
import { calculateResourcePool, generateRebalanceSuggestions } from './resource-pool'
import type {
  ResourcePoolOverviewDto,
  ResourceMemberDto,
  ResourceConflictDto,
  RebalanceSuggestionDto,
  ResourceMatrixDto,
} from './dto/resource-pool.dto'

@Injectable()
export class ResourcePoolService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ========== 加载租户内的项目 + 任务 ==========
  private async loadTenantTasks(user: AuthUser, projectIds?: string[]) {
    const where: any = {
      tenantId: user.tenantId,
      deletedAt: null,
    }
    if (projectIds?.length) {
      where.id = { in: projectIds }
    }

    const projects = await this.prisma.project.findMany({
      where,
      include: {
        tasks: {
          where: { deletedAt: null },
        },
      },
    })

    // 收集所有 assigneeId 去查成员名
    const assigneeIds = new Set<string>()
    for (const p of projects) {
      for (const t of p.tasks) {
        if ((t as any).assigneeId) assigneeIds.add((t as any).assigneeId)
      }
    }

    // 查用户姓名
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...assigneeIds] } },
      select: { id: true, displayName: true },
    })
    const userMap = new Map(users.map(u => [u.id, u.displayName]))

    // 转换为引擎输入格式
    const tasks = []
    for (const project of projects) {
      for (const t of project.tasks) {
        const task = t as any
        if (!task.assigneeId) continue
        tasks.push({
          id: task.id,
          assigneeId: task.assigneeId,
          status: task.status,
          estimatedHours: Number(task.estimatedHours ?? 0),
          dueAt: task.dueAt ?? undefined,
          priority: task.priority ?? 'medium',
          projectId: project.id,
          projectName: project.name,
          isCritical: false, // v1 暂不区分关键路径
        })
      }
    }

    const members = [...assigneeIds].map(id => ({
      id,
      name: userMap.get(id),
    }))

    return { tasks, members, projects }
  }

  // ========== 概览 ==========
  async getOverview(user: AuthUser, projectIds?: string[]): Promise<ResourcePoolOverviewDto> {
    const { tasks, members } = await this.loadTenantTasks(user, projectIds)
    const result = calculateResourcePool(tasks, members)

    return {
      members: result.members as ResourceMemberDto[],
      totalCapacity: result.totalCapacity,
      totalAllocated: result.totalAllocated,
      utilization: result.utilization,
      overloadCount: result.overloadCount,
      idleCount: result.idleCount,
      topBottlenecks: result.topBottlenecks,
      conflicts: result.conflicts as ResourceConflictDto[],
    }
  }

  // ========== 单个成员详情 ==========
  async getMember(user: AuthUser, assigneeId: string): Promise<ResourceMemberDto | null> {
    const overview = await this.getOverview(user)
    return overview.members.find(m => m.assigneeId === assigneeId) ?? null
  }

  // ========== 冲突清单 ==========
  async getConflicts(user: AuthUser, projectIds?: string[]): Promise<ResourceConflictDto[]> {
    const overview = await this.getOverview(user, projectIds)
    return overview.conflicts
  }

  // ========== 成员×项目矩阵 ==========
  async getMatrix(user: AuthUser, projectIds?: string[]): Promise<ResourceMatrixDto> {
    const overview = await this.getOverview(user, projectIds)

    const projectSet = new Map<string, string>() // id → name
    for (const m of overview.members) {
      for (const p of m.projects) {
        projectSet.set(p.projectId, p.projectName)
      }
    }
    const projectIdList = [...projectSet.keys()].sort()
    const projectNames = projectIdList.map(id => projectSet.get(id)!)

    const assigneeIds = overview.members.map(m => m.assigneeId)
    const assigneeNames = overview.members.map(m => m.name ?? m.assigneeId)

    // 构建矩阵
    const matrix: number[][] = []
    for (const m of overview.members) {
      const row: number[] = []
      const projMap = new Map(m.projects.map(p => [p.projectId, p.hours]))
      for (const pid of projectIdList) {
        row.push(projMap.get(pid) ?? 0)
      }
      matrix.push(row)
    }

    return {
      projectIds: projectIdList,
      projectNames,
      assigneeIds,
      assigneeNames,
      matrix,
    }
  }

  // ========== 生成再平衡建议 ==========
  async generateRebalance(user: AuthUser, projectIds?: string[]): Promise<RebalanceSuggestionDto> {
    const { tasks, members } = await this.loadTenantTasks(user, projectIds)
    const result = generateRebalanceSuggestions(tasks, members)

    // 写 proposal（草稿态）
    const proposal = await this.prisma.aiProposal.create({
      data: {
        tenantId: user.tenantId,
        type: 'rebalance' as any,
        status: 'pending',
        source: 'resource_pool',
        proposerId: user.userId,
        payload: {
          actions: result.actions,
          utilizationBefore: result.utilizationBefore,
          utilizationAfterEstimate: result.utilizationAfterEstimate,
          summary: result.summary,
        } as any,
        diffSummary: {
          actionCount: result.actions.length,
          overloadedMembers: result.overloadedMembers,
          idleMembers: result.idleMembers,
          utilizationBefore: result.utilizationBefore,
          utilizationAfterEstimate: result.utilizationAfterEstimate,
        } as any,
        expiresAt: new Date(Date.now() + 72 * 3600 * 1000),
      },
      select: { id: true },
    })

    await this.audit.record({
      action: 'ai_proposal.create',
      resourceType: 'AiProposal',
      resourceId: proposal.id,
      tenantId: user.tenantId,
      actorId: user.userId,
      after: { id: proposal.id, type: 'rebalance', actionCount: result.actions.length },
    })

    return {
      ...result,
      generatedAt: new Date().toISOString(),
      proposalId: proposal.id,
    }
  }
}