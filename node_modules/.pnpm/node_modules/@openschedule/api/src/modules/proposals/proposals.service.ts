/**
 * proposals.service.ts —— AI 建议服务（拆解/排期草稿）
 *
 * 设计原则（方案书 4.1）：
 * - AI 提议、人确认：所有写操作都是草稿，用户 apply 才落库
 * - 草稿态 + 审批门：ai_proposals.status=pending → applied/rejected
 * - 可撤销/回溯：apply 后记录真实 taskIds，支持追溯
 */
import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { AuthUser, isTenantAdmin } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../common/prisma/prisma.service'
import { AuditService } from '../../common/audit/audit.service'
import {
  decompose,
  scheduleDecompose,
  type TemplateTask,
} from './decompose/decompose-engine'
import type { DecomposeDto, ProposalDetail, ProposalListItem, ApplyProposalResult } from './dto/proposals.dto'
import type { AiCallbackDto } from './dto/ai-callback.dto'

const E = { NOT_FOUND: 40401, FORBIDDEN: 40301, BAD_REQUEST: 40001 } as const
const PROPOSAL_TYPE_DECOMPOSE = 'decompose'
const DEFAULT_PAGE_SIZE = 20

@Injectable()
export class ProposalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ==================== 生成拆解建议 ====================

  async createDecompose(user: AuthUser, dto: DecomposeDto): Promise<{ data: ProposalDetail }> {
    const goalTitle = dto.goalTitle.trim()
    if (!goalTitle) throw new BadRequestException({ code: E.BAD_REQUEST, message: '目标标题不能为空' })

    // 模板模式：取模板快照
    let templateTasks: TemplateTask[] | undefined
    let templateDependencies: Array<{ fromIndex: number; toIndex: number; type: string; lagDays?: number }> | undefined
    if (dto.templateId) {
      const tpl = await this.prisma.projectTemplate.findFirst({
        where: { id: dto.templateId, tenantId: user.tenantId },
      })
      if (!tpl) throw new NotFoundException({ code: E.NOT_FOUND, message: '模板不存在' })
      if (tpl.ownerId !== user.userId && !tpl.isPublic) {
        throw new ForbiddenException({ code: E.FORBIDDEN, message: '无权限使用此模板' })
      }
      templateTasks = (tpl.taskSnapshot as any[])?.map((t: any) => ({
        title: t.title,
        description: t.description,
        estimatedHours: t.estimatedHours,
        isShared: t.isShared,
        priority: t.priority,
      })) ?? []
      templateDependencies = (tpl.dependencySnapshot as any[])?.map((d: any, i: number) => ({
        fromIndex: d.fromIndex ?? d.prevIndex ?? 0,
        toIndex: d.toIndex ?? d.nextIndex ?? i + 1,
        type: d.type ?? 'FS',
        lagDays: d.lagDays ?? 0,
      })) ?? []
    }

    // 确定性拆解
    const result = decompose({
      goalTitle,
      goalDescription: dto.goalDescription,
      templateTasks,
      templateDependencies,
      totalEstimatedHours: dto.totalEstimatedHours,
      startDate: dto.startDate,
    })

    // CPM 排期
    const scheduled = scheduleDecompose(result, { startDate: dto.startDate })
    const tasksWithSchedule = scheduled.tasks

    const payload = {
      version: 1,
      summary: result.summary,
      tasks: tasksWithSchedule,
      dependencies: result.dependencies,
      warnings: result.warnings,
      scheduleMeta: {
        projectEta: scheduled.projectEta,
        criticalPath: scheduled.criticalPath,
      },
    }

    const diffSummary = {
      add: tasksWithSchedule.map(t => ({
        title: t.title,
        estimatedHours: t.estimatedHours,
        isShared: t.isShared,
      })),
      update: [],
      remove: [],
    }

    const proposal = await this.prisma.aiProposal.create({
      data: {
        tenantId: user.tenantId,
        type: PROPOSAL_TYPE_DECOMPOSE,
        status: 'pending',
        payload: payload as any,
        diffSummary: diffSummary as any,
        proposerId: user.userId,
        source: 'manual_request',
        relatedProjectId: dto.relatedProjectId ?? undefined,
        expiresAt: new Date(Date.now() + 72 * 3600 * 1000), // 72h 审批时效
      },
      select: {
        id: true, type: true, status: true, source: true,
        relatedProjectId: true, payload: true, diffSummary: true,
        createdAt: true, updatedAt: true, expiresAt: true,
      },
    })

    return { data: this.formatDetail(proposal) }
  }

  /**
   * AI 服务回调入口：只更新草稿提案，不创建或修改业务任务。
   * run_id 写入 payload 元数据，重复回调直接返回当前状态，保证幂等。
   */
  async handleAiCallback(input: AiCallbackDto) {
    const proposal = input.proposal_id
      ? await this.prisma.aiProposal.findUnique({ where: { id: input.proposal_id } })
      : null
    if (!proposal) throw new NotFoundException({ code: E.NOT_FOUND, message: 'AI 提案不存在' })

    const currentPayload = (proposal.payload ?? {}) as Record<string, any>
    if (currentPayload.aiRunId === input.run_id) {
      return { data: { proposalId: proposal.id, status: proposal.status, idempotent: true } }
    }
    if (proposal.status !== 'pending') {
      return { data: { proposalId: proposal.id, status: proposal.status, idempotent: true } }
    }

    const nextPayload = {
      ...currentPayload,
      ...(input.status === 'succeeded' && input.payload ? input.payload : {}),
      aiRunId: input.run_id,
      aiStatus: input.status,
      ...(input.error ? { aiError: input.error } : {}),
    }
    const updated = await this.prisma.aiProposal.update({
      where: { id: proposal.id },
      data: { payload: nextPayload as Prisma.InputJsonValue },
      select: { id: true, status: true },
    })
    await this.audit.record({
      action: 'ai_proposal.callback',
      resourceType: 'ai_proposal',
      resourceId: proposal.id,
      actorId: proposal.proposerId ?? 'system',
      tenantId: proposal.tenantId,
      after: { runId: input.run_id, status: input.status },
    })
    return { data: { proposalId: updated.id, status: updated.status, idempotent: false } }
  }

  // ==================== 列表 ====================

  async list(user: AuthUser, query: { type?: string; status?: string; page?: number; pageSize?: number } = {}) {
    const page = query.page ?? 1
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, 100)
    const skip = (page - 1) * pageSize

    const where: Prisma.AiProposalWhereInput = {
      tenantId: user.tenantId,
      proposerId: user.userId,
    }
    if (query.type) where.type = query.type
    if (query.status) where.status = query.status

    const [total, items] = await this.prisma.$transaction([
      this.prisma.aiProposal.count({ where }),
      this.prisma.aiProposal.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, type: true, status: true, payload: true,
          relatedProjectId: true, createdAt: true,
        },
      }),
    ])

    const list: ProposalListItem[] = items.map(p => {
      const payload: any = p.payload
      const tasks = Array.isArray(payload?.tasks) ? payload.tasks : []
      return {
        id: p.id,
        type: p.type,
        status: p.status,
        summary: payload?.summary ?? '',
        taskCount: tasks.length,
        relatedProjectId: p.relatedProjectId,
        createdAt: p.createdAt.toISOString(),
      }
    })

    return { data: { items: list, total, page, pageSize } }
  }

  // ==================== 详情 ====================

  async getDetail(id: string, user: AuthUser): Promise<{ data: ProposalDetail }> {
    const proposal = await this.loadProposal(id, user)
    return { data: this.formatDetail(proposal) }
  }

  // ==================== 应用（确认落库） ====================

  async apply(id: string, user: AuthUser): Promise<{ data: ApplyProposalResult }> {
    const proposal = await this.loadProposal(id, user)
    if (proposal.type !== PROPOSAL_TYPE_DECOMPOSE) {
      throw new BadRequestException({ code: E.BAD_REQUEST, message: '仅 decompose 类型可应用' })
    }
    if (proposal.status !== 'pending') {
      throw new BadRequestException({ code: E.BAD_REQUEST, message: `当前状态 ${proposal.status}，不可应用` })
    }
    if (!proposal.relatedProjectId) {
      throw new BadRequestException({ code: E.BAD_REQUEST, message: '请先指定目标项目' })
    }

    // 项目权限校验
    const project = await this.prisma.project.findFirst({
      where: { id: proposal.relatedProjectId, tenantId: user.tenantId, deletedAt: null },
    })
    if (!project) throw new NotFoundException({ code: E.NOT_FOUND, message: '项目不存在' })
    await this.assertProjectEdit(project.id, user, 'apply proposal')

    const payload: any = proposal.payload
    const tasks = payload?.tasks ?? []
    const dependencies = payload?.dependencies ?? []

    if (tasks.length === 0) {
      throw new BadRequestException({ code: E.BAD_REQUEST, message: '无任务可应用' })
    }

    // 事务：创建任务 → 创建依赖 → 更新 proposal
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. 逐条创建任务
      const taskIdMap: Record<number, string> = {}
      const createdTasks: { id: string; title: string }[] = []

      for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i]
        const created = await tx.task.create({
          data: {
            tenantId: user.tenantId,
            projectId: proposal.relatedProjectId!,
            title: t.title,
            description: t.description ?? '',
            status: 'todo',
            estimatedHours: t.estimatedHours ?? 8,
            priority: t.priority ?? 'medium',
            isAiGenerated: true,
            createdBy: user.userId,
          },
          select: { id: true, title: true },
        })
        taskIdMap[i] = created.id
        createdTasks.push(created)
      }

      // 2. 逐条创建依赖（用真实 id 替换索引）
      let depCount = 0
      const validDeps = dependencies.filter(
        (d: any) =>
          typeof d.fromIndex === 'number' &&
          typeof d.toIndex === 'number' &&
          taskIdMap[d.fromIndex] &&
          taskIdMap[d.toIndex] &&
          d.fromIndex !== d.toIndex,
      )

      for (const d of validDeps) {
        await tx.taskDependency.create({
          data: {
            tenantId: user.tenantId,
            projectId: proposal.relatedProjectId!,
            prevTaskId: taskIdMap[d.fromIndex],
            nextTaskId: taskIdMap[d.toIndex],
            type: d.type ?? 'FS',
            lagDays: d.lagDays ?? 0,
            isShared: false,
          },
        })
        depCount++
      }

      // 3. 更新 proposal 状态
      const updated = await tx.aiProposal.update({
        where: { id: proposal.id, tenantId: user.tenantId },
        data: {
          status: 'applied',
          approverId: user.userId,
          approvedAt: new Date(),
          diffSummary: {
            add: createdTasks.map(t => ({ id: t.id, title: t.title })),
            update: [],
            remove: [],
            appliedAt: new Date().toISOString(),
          } as any,
          payload: {
            ...payload,
            realTaskIds: Object.values(taskIdMap),
          } as any,
        },
        select: { id: true },
      })

      return {
        projectId: proposal.relatedProjectId!,
        taskIds: Object.values(taskIdMap),
        dependencyCount: depCount,
      }
    })

    await this.audit.record({
      action: 'ai_proposal.apply',
      resourceType: 'ai_proposal',
      resourceId: id,
      actorId: user.userId,
      tenantId: user.tenantId,
      after: { taskCount: result.taskIds.length, dependencyCount: result.dependencyCount },
    })

    return {
      data: {
        projectId: result.projectId,
        taskCount: result.taskIds.length,
        dependencyCount: result.dependencyCount,
        taskIds: result.taskIds,
      },
    }
  }

  // ==================== 拒绝 ====================

  async reject(id: string, user: AuthUser, reason?: string): Promise<{ data: { id: string; status: string } }> {
    const proposal = await this.loadProposal(id, user)
    if (proposal.status !== 'pending') {
      throw new BadRequestException({ code: E.BAD_REQUEST, message: `当前状态 ${proposal.status}，不可拒绝` })
    }
    await this.prisma.aiProposal.update({
      where: { id: proposal.id, tenantId: user.tenantId },
      data: { status: 'rejected', rejectReason: reason?.slice(0, 500) },
      select: { id: true },
    })
    return { data: { id, status: 'rejected' } }
  }

  // ==================== helpers ====================

  private async loadProposal(
    id: string,
    user: AuthUser,
  ) {
    const proposal = await this.prisma.aiProposal.findFirst({
      where: { id, tenantId: user.tenantId },
    })
    if (!proposal) throw new NotFoundException({ code: E.NOT_FOUND, message: '建议不存在' })
    if (proposal.proposerId !== user.userId) {
      throw new ForbiddenException({ code: E.FORBIDDEN, message: '无权访问此建议' })
    }
    return proposal
  }

  private formatDetail(proposal: {
    id: string
    type: string
    status: string
    source: string
    relatedProjectId: string | null
    payload: any
    diffSummary: any
    createdAt: Date
    updatedAt: Date
    expiresAt: Date | null
  }): ProposalDetail {
    const payload = proposal.payload as any
    return {
      id: proposal.id,
      type: proposal.type,
      status: proposal.status,
      source: proposal.source,
      relatedProjectId: proposal.relatedProjectId,
      summary: payload?.summary ?? '',
      tasks: payload?.tasks ?? [],
      dependencies: payload?.dependencies ?? [],
      warnings: payload?.warnings ?? [],
      diffSummary: proposal.diffSummary ?? {},
      createdAt: proposal.createdAt.toISOString(),
      updatedAt: proposal.updatedAt.toISOString(),
      expiresAt: proposal.expiresAt ? proposal.expiresAt.toISOString() : null,
    }
  }

  private async assertProjectEdit(projectId: string, user: AuthUser, op: string): Promise<void> {
    if (isTenantAdmin(user)) return
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId: user.tenantId },
      select: { ownerId: true },
    })
    if (project?.ownerId === user.userId) return
    throw new ForbiddenException({ code: E.FORBIDDEN, message: `${op}: 仅项目负责人或租户 Admin` })
  }
}
