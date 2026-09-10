/**
 * 总结服务（A6 完成总结粒度：任务级自动摘要 + 周级手动触发；Phase 1 收尾模块）。
 * GET /me/summaries：按用户本人周期内完成任务聚合（团队任务+个人任务）——任务数/按时完成数/实际工时合计/延期清单
 *   + 已保存的草稿内容（草稿持久化在 ai_proposals：type='weekly_report' + status='pending' + source='manual_request'，
 *   与 Phase 2 周报 AI 共用同一载体，不新增表）。
 * POST /me/summaries：手动编辑保存草稿（同周期覆盖）。
 * 租户隔离：显式 tenantId + Prisma 租户扩展；个人数据按 userId + tenantId 双谓词。
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SaveSummaryDto, SummaryPeriod } from './dto/summary.dto';

/** 草稿载体：ai_proposals.type（schema 权威注释列出的官方类型之一，Phase 2 周报 AI 复用） */
const SUMMARY_PROPOSAL_TYPE = 'weekly_report';

/** 延期/完成清单条数上限（草稿展示足够，防大响应） */
const MAX_LIST_ITEMS = 50;

/** 周期窗口（滚动窗口天数，Phase 1 口径） */
const PERIOD_DAYS: Record<SummaryPeriod, number> = {
  [SummaryPeriod.WEEK]: 7,
  [SummaryPeriod.MONTH]: 30,
};

/** 周期聚合统计 */
export interface SummaryStats {
  /** 周期内完成任务数（团队+个人） */
  completedCount: number;
  /** 按时完成数（仅统计带 due_at 的任务：completedAt <= dueAt） */
  onTimeCount: number;
  /** 延期完成数（completedAt > dueAt） */
  overdueCount: number;
  /** 实际工时合计（小时，Decimal 转 number） */
  actualHoursTotal: number;
  /** 按时率（带 due_at 任务的口径；无带截止任务时为 null） */
  onTimeRate: number | null;
}

/** 完成/延期清单条目（团队任务带项目信息，个人任务 type=personal） */
export interface SummaryTaskItem {
  id: string;
  type: 'team' | 'personal';
  title: string;
  dueAt: Date | null;
  completedAt: Date;
  actualHours: number | null;
  projectId: string | null;
  projectName: string | null;
  overdue: boolean;
}

@Injectable()
export class SummariesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** 周期总结：聚合统计 + 延期/完成清单 + 已保存草稿 */
  async getSummary(user: { userId: string; tenantId: string }, period: SummaryPeriod) {
    const { start, end } = this.periodWindow(period);

    // 团队任务 + 个人任务分别聚合（个人总结口径：本人完成的全部任务）
    const [teamTasks, personalTasks] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          tenantId: user.tenantId,
          assigneeId: user.userId,
          status: 'done',
          deletedAt: null,
          completedAt: { gte: start, lte: end },
        },
        include: { project: { select: { id: true, name: true } } },
        orderBy: { completedAt: 'desc' },
      }),
      this.prisma.personalTask.findMany({
        where: {
          tenantId: user.tenantId,
          userId: user.userId,
          status: 'done',
          deletedAt: null,
          completedAt: { gte: start, lte: end },
        },
        orderBy: { completedAt: 'desc' },
      }),
    ]);

    const items: SummaryTaskItem[] = [
      ...teamTasks.map(t => ({
        id: t.id,
        type: 'team' as const,
        title: t.title,
        dueAt: t.dueAt,
        completedAt: t.completedAt!,
        actualHours: this.toNum(t.actualHours),
        projectId: t.project?.id ?? t.projectId ?? null,
        projectName: t.project?.name ?? null,
        overdue: !!t.dueAt && t.completedAt! > t.dueAt,
      })),
      ...personalTasks.map(t => ({
        id: t.id,
        type: 'personal' as const,
        title: t.title,
        dueAt: t.dueAt,
        completedAt: t.completedAt!,
        actualHours: this.toNum(t.actualHours),
        projectId: null,
        projectName: null,
        overdue: !!t.dueAt && t.completedAt! > t.dueAt,
      })),
    ].sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());

    const withDue = items.filter(i => i.dueAt !== null);
    const onTime = withDue.filter(i => !i.overdue);
    const stats: SummaryStats = {
      completedCount: items.length,
      onTimeCount: onTime.length,
      overdueCount: withDue.length - onTime.length,
      actualHoursTotal: Math.round(items.reduce((sum, i) => sum + (i.actualHours ?? 0), 0) * 10) / 10,
      onTimeRate: withDue.length > 0 ? Math.round((onTime.length / withDue.length) * 1000) / 10 : null,
    };

    const draft = await this.loadDraft(user, period);

    return {
      data: {
        period,
        window: { start, end },
        stats,
        overdueTasks: items.filter(i => i.overdue).slice(0, MAX_LIST_ITEMS),
        completedTasks: items.slice(0, MAX_LIST_ITEMS),
        draft,
      },
      meta: {},
    };
  }

  /** 保存总结草稿（同周期覆盖写：更新最新 pending 草稿，否则新建） */
  async saveSummary(user: { userId: string; tenantId: string }, dto: SaveSummaryDto) {
    const existing = await this.findDraftRow(user, dto.period);
    const payload = { period: dto.period, content: dto.content, savedAt: new Date().toISOString() } as Prisma.InputJsonValue;

    const saved = await this.prisma.$transaction(async tx => {
      const row = existing
        ? await tx.aiProposal.update({
            where: { id: existing.id },
            data: { payload, updatedAt: new Date() },
          })
        : await tx.aiProposal.create({
            data: {
              tenantId: user.tenantId,
              type: SUMMARY_PROPOSAL_TYPE,
              status: 'pending',
              payload,
              proposerId: user.userId,
              source: 'manual_request',
            },
          });
      await this.audit.record(
        {
          tenantId: user.tenantId,
          actorId: user.userId,
          action: 'summary.save',
          resourceType: 'ai_proposal',
          resourceId: row.id,
          before: existing ? { id: existing.id } : undefined,
          after: { type: row.type, period: dto.period, contentLength: dto.content.length },
        },
        tx,
      );
      return row;
    });

    return {
      data: {
        id: saved.id,
        period: dto.period,
        content: dto.content,
        updatedAt: saved.updatedAt,
      },
      meta: {},
    };
  }

  // ===================== 工具 =====================

  /** 滚动周期窗口（week=最近 7 天 / month=最近 30 天，含当下） */
  private periodWindow(period: SummaryPeriod): { start: Date; end: Date } {
    const end = new Date();
    const start = new Date(end.getTime() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000);
    return { start, end };
  }

  /** 读取已保存草稿（该周期最新一条 pending 周报载体；payload.period 在 JS 侧过滤） */
  private async loadDraft(user: { userId: string; tenantId: string }, period: SummaryPeriod) {
    const row = await this.findDraftRow(user, period);
    if (!row) return null;
    const payload = row.payload as { content?: string } | null;
    return {
      id: row.id,
      content: typeof payload?.content === 'string' ? payload.content : '',
      updatedAt: row.updatedAt,
    };
  }

  /** 找该周期最新一条 pending 周报草稿（ai_proposals） */
  private async findDraftRow(user: { userId: string; tenantId: string }, period: SummaryPeriod) {
    const candidates = await this.prisma.aiProposal.findMany({
      where: {
        tenantId: user.tenantId,
        proposerId: user.userId,
        type: SUMMARY_PROPOSAL_TYPE,
        status: 'pending',
      },
      orderBy: { updatedAt: 'desc' },
      take: 10, // 用户保存草稿频率低，取最近 10 条 JS 侧过滤足够
    });
    return candidates.find(c => (c.payload as { period?: string } | null)?.period === period) ?? null;
  }

  /** Prisma Decimal → number（null 安全） */
  private toNum(v: Prisma.Decimal | null): number | null {
    return v === null ? null : Number(v);
  }
}