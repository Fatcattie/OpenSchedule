/**
 * 智能评估服务（B17）：
 * - GET  /evaluations/me/profile                        我的画像（skillTags/复杂度档/自评标记 + 聚合统计）
 * - PUT  /evaluations/me/profile                        upsert member_profile
 * - GET  /evaluations/projects/:projectId/members/stats 项目成员工时统计（time_entries 窗口内聚合）
 * - POST /evaluations/tasks/:taskId/recommend           任务智能推荐 Top-3（规则引擎，只建议不指派）
 * - GET  /evaluations/me/stats                          我的工时统计（按天 entries）
 *
 * 评估模型（无 LLM）：总分 = 技能匹配 40% + 历史绩效 30% + 当前负载 20% + 复杂度适配 10%；
 * 完成率/准时率不落表，由 tasks 聚合计算（见 scoring.ts 纯函数）。
 * 口径决策（契约未明处）：任务衍生统计（完成率/准时率/负载/估时合计）为全租户全量（非窗口）；
 * 仅 time_entries 的实际工时按 days 窗口聚合；entries 按 UTC 日切分（与 B16 报表一致）。
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthUser, isTenantAdmin } from '../../common/decorators/current-user.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import {
  ComplexityTier,
  computeMemberStats,
  MemberStats,
  calculateRecommendation,
  deriveComplexityTier,
} from './scoring/scoring';

/** 分段错误码 */
const E = {
  BAD_REQUEST: 40001,
  FORBIDDEN: 40301,
  NOT_FOUND: 40401,
} as const;

/** 成员聚合统计（含估时合计，供 members/stats 与 me/stats 输出） */
interface MemberAgg extends MemberStats {
  totalEstimatedHours: number;
}

const EMPTY_AGG: MemberAgg = {
  completedCount: 0,
  completionRate: 0,
  onTimeRate: 0.5, // 无历史 → 准时率中性（评分层冷启动仍走 0.5 中性分）
  activeLoad: 0,
  totalEstimatedHours: 0,
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class EvaluationsService {
  private readonly logger = new Logger(EvaluationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ===================== 我的画像 =====================

  /** GET /evaluations/me/profile（任意登录用户） */
  async getMyProfile(user: AuthUser) {
    const [profile, stats] = await this.loadProfileAndStats(user);
    return { data: { profile: this.toProfilePayload(user.userId, profile, stats) } };
  }

  /** PUT /evaluations/me/profile（upsert member_profile，任意登录用户） */
  async updateMyProfile(user: AuthUser, dto: UpdateProfileDto) {
    if (dto.skillTags === undefined && dto.complexityTier === undefined && dto.selfAssessed === undefined) {
      throw new BadRequestException({ code: E.BAD_REQUEST, message: '至少提供一个可更新字段（skillTags/complexityTier/selfAssessed）' });
    }
    const profile = await this.prisma.memberProfile.upsert({
      where: { tenantId_userId: { tenantId: user.tenantId, userId: user.userId } },
      create: {
        tenantId: user.tenantId,
        userId: user.userId,
        skillTags: dto.skillTags ?? [],
        complexityTier: dto.complexityTier ?? null,
        selfAssessed: dto.selfAssessed ?? false,
      },
      update: {
        ...(dto.skillTags !== undefined ? { skillTags: dto.skillTags } : {}),
        ...(dto.complexityTier !== undefined ? { complexityTier: dto.complexityTier } : {}),
        ...(dto.selfAssessed !== undefined ? { selfAssessed: dto.selfAssessed } : {}),
      },
    });
    const stats = await this.computeAggForUsers(user.tenantId, [user.userId]);
    return { data: { profile: this.toProfilePayload(user.userId, profile, stats.get(user.userId)!) } };
  }

  // ===================== 项目成员工时统计 =====================

  /**
   * GET /evaluations/projects/:projectId/members/stats?days=30
   * 成员 = 该项目 userRole(scope=project) 的用户；任务衍生统计全量，totalActualHours 按 time_entries 窗口聚合。
   */
  async getMembersStats(projectId: string, user: AuthUser, days: number) {
    const project = await this.loadProject(projectId, user.tenantId);
    await this.assertProjectAccess(project, user, 'view');
    const windowStart = this.windowStart(days);

    const roles = await this.prisma.userRole.findMany({
      where: { tenantId: user.tenantId, scopeResourceId: projectId, role: { scope: 'project' } },
      select: { userId: true, user: { select: { displayName: true } } },
    });
    const memberIds = [...new Set(roles.map(r => r.userId))];
    const nameMap = new Map(roles.map(r => [r.userId, r.user.displayName]));

    const [statsMap, timeMap] = await Promise.all([
      this.computeAggForUsers(user.tenantId, memberIds),
      this.aggregateTimeEntries(user.tenantId, memberIds, windowStart),
    ]);

    const members = memberIds
      .map(userId => {
        const agg = statsMap.get(userId)!;
        const time = timeMap.get(userId) ?? { totalSeconds: 0, taskCount: 0 };
        const totalActualHours = round2(time.totalSeconds / 3600);
        return {
          userId,
          displayName: nameMap.get(userId) ?? userId.slice(0, 8),
          completedCount: agg.completedCount,
          completionRate: round2(agg.completionRate),
          onTimeRate: round2(agg.onTimeRate),
          activeLoad: agg.activeLoad,
          totalActualHours,
          totalEstimatedHours: round1(agg.totalEstimatedHours),
          avgActualHoursPerTask: time.taskCount > 0 ? round2(totalActualHours / time.taskCount) : 0,
        };
      })
      .sort((a, b) => b.totalActualHours - a.totalActualHours || a.userId.localeCompare(b.userId));

    return { data: { projectId, days, members } };
  }

  // ===================== 任务智能推荐（核心） =====================

  /**
   * POST /evaluations/tasks/:taskId/recommend
   * 候选 = 项目成员（排除当前 assignee），按 score 降序 Top-3；只建议不指派。
   * coldStart = 所有候选 completedCount === 0（提示"自评画像模式"）。
   */
  async recommendForTask(taskId: string, user: AuthUser) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, tenantId: user.tenantId, deletedAt: null },
      select: { id: true, title: true, projectId: true, assigneeId: true, tags: true, estimatedHours: true },
    });
    if (!task) throw new NotFoundException({ code: E.NOT_FOUND, message: '任务不存在或不可见' });
    if (!task.projectId) {
      throw new BadRequestException({ code: E.BAD_REQUEST, message: '个人任务无项目上下文，不支持智能推荐' });
    }
    const project = await this.loadProject(task.projectId, user.tenantId);
    await this.assertProjectAccess(project, user, 'view');

    const roles = await this.prisma.userRole.findMany({
      where: { tenantId: user.tenantId, scopeResourceId: task.projectId, role: { scope: 'project' } },
      select: { userId: true, user: { select: { displayName: true } } },
    });
    const nameMap = new Map(roles.map(r => [r.userId, r.user.displayName]));
    let candidateIds = [...new Set(roles.map(r => r.userId))];
    if (task.assigneeId) candidateIds = candidateIds.filter(id => id !== task.assigneeId);

    const [profiles, statsMap] = await Promise.all([
      this.prisma.memberProfile.findMany({
        where: { tenantId: user.tenantId, userId: { in: candidateIds } },
        select: { userId: true, skillTags: true, complexityTier: true },
      }),
      this.computeAggForUsers(user.tenantId, candidateIds),
    ]);
    const profileMap = new Map(profiles.map(p => [p.userId, p]));

    const taskEstimatedHours = this.toNum(task.estimatedHours);
    const candidates = candidateIds
      .map(userId => {
        const profile = profileMap.get(userId);
        const agg = statsMap.get(userId)!;
        const result = calculateRecommendation({
          taskTags: task.tags,
          taskEstimatedHours,
          skillTags: profile?.skillTags ?? [],
          complexityTier: (profile?.complexityTier as ComplexityTier | null) ?? null,
          stats: {
            completedCount: agg.completedCount,
            completionRate: agg.completionRate,
            onTimeRate: agg.onTimeRate,
            activeLoad: agg.activeLoad,
          },
        });
        return {
          userId,
          displayName: nameMap.get(userId) ?? userId.slice(0, 8),
          score: result.score,
          scoreBreakdown: result.scoreBreakdown,
          reason: result.reason,
        };
      })
      .sort((a, b) => b.score - a.score || a.userId.localeCompare(b.userId))
      .slice(0, 3);

    const coldStart = candidates.length > 0 && candidates.every(c => statsMap.get(c.userId)!.completedCount === 0);

    return {
      data: {
        taskId: task.id,
        taskTitle: task.title,
        taskTags: task.tags,
        taskComplexity: deriveComplexityTier(taskEstimatedHours),
        candidates,
        coldStart,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  // ===================== 我的工时统计 =====================

  /** GET /evaluations/me/stats?days=30（任意登录用户；entries 按天聚合 time_entries，仅返回有工时的天） */
  async getMyStats(user: AuthUser, days: number) {
    const windowStart = this.windowStart(days);
    const [statsMap, entries] = await Promise.all([
      this.computeAggForUsers(user.tenantId, [user.userId]),
      this.prisma.timeEntry.findMany({
        where: {
          tenantId: user.tenantId,
          userId: user.userId,
          startedAt: { gte: windowStart },
          endedAt: { not: null },
          durationSeconds: { not: null },
        },
        select: { startedAt: true, durationSeconds: true },
        orderBy: { startedAt: 'asc' },
      }),
    ]);

    // 按天（UTC）聚合 durationSeconds
    const dayMap = new Map<string, number>();
    for (const e of entries) {
      const key = e.startedAt.toISOString().slice(0, 10);
      dayMap.set(key, (dayMap.get(key) ?? 0) + (e.durationSeconds ?? 0));
    }
    const dayEntries = [...dayMap.entries()].map(([date, secs]) => ({ date, hours: round2(secs / 3600) }));

    const agg = statsMap.get(user.userId)!;
    return {
      data: {
        userId: user.userId,
        days,
        totalActualHours: round2(dayEntries.reduce((s, d) => s + d.hours, 0)),
        totalEstimatedHours: round1(agg.totalEstimatedHours),
        completedCount: agg.completedCount,
        completionRate: round2(agg.completionRate),
        onTimeRate: round2(agg.onTimeRate),
        activeLoad: agg.activeLoad,
        entries: dayEntries,
      },
    };
  }

  // ===================== 内部工具 =====================

  /** 加载画像 + 聚合统计 */
  private async loadProfileAndStats(user: AuthUser) {
    const [profile, stats] = await Promise.all([
      this.prisma.memberProfile.findUnique({
        where: { tenantId_userId: { tenantId: user.tenantId, userId: user.userId } },
      }),
      this.computeAggForUsers(user.tenantId, [user.userId]),
    ]);
    return [profile, stats.get(user.userId)!] as const;
  }

  /** 画像响应载荷（profile 可能不存在 → 空画像 + 统计） */
  private toProfilePayload(userId: string, profile: { skillTags: string[]; complexityTier: string | null; selfAssessed: boolean } | null, agg: MemberAgg) {
    return {
      userId,
      skillTags: profile?.skillTags ?? [],
      complexityTier: (profile?.complexityTier as ComplexityTier | null) ?? null,
      selfAssessed: profile?.selfAssessed ?? false,
      stats: {
        completedCount: agg.completedCount,
        completionRate: round2(agg.completionRate),
        onTimeRate: round2(agg.onTimeRate),
        activeLoad: agg.activeLoad,
      },
    };
  }

  /**
   * 批量计算成员聚合统计（全租户全量任务：assigneeId ∈ userIds 且未软删）。
   * 完成率/准时率/活跃负载由 scoring.computeMemberStats 纯函数聚合；totalEstimatedHours 为估时合计。
   */
  private async computeAggForUsers(tenantId: string, userIds: string[]): Promise<Map<string, MemberAgg>> {
    const result = new Map<string, MemberAgg>();
    for (const id of userIds) result.set(id, { ...EMPTY_AGG });
    if (userIds.length === 0) return result;

    const tasks = await this.prisma.task.findMany({
      where: { tenantId, assigneeId: { in: userIds }, deletedAt: null },
      select: { assigneeId: true, status: true, dueAt: true, completedAt: true, estimatedHours: true },
    });

    // 估时合计（按当前 assignee）
    for (const t of tasks) {
      if (!t.assigneeId) continue;
      const agg = result.get(t.assigneeId);
      if (agg) agg.totalEstimatedHours += this.toNum(t.estimatedHours) ?? 0;
    }

    for (const id of userIds) {
      const s = computeMemberStats(tasks, id);
      const agg = result.get(id)!;
      agg.completedCount = s.completedCount;
      agg.completionRate = s.completionRate;
      agg.onTimeRate = s.onTimeRate;
      agg.activeLoad = s.activeLoad;
    }
    return result;
  }

  /** 窗口内 time_entries 聚合：按用户求和 durationSeconds + 去重任务数 */
  private async aggregateTimeEntries(tenantId: string, userIds: string[], windowStart: Date): Promise<Map<string, { totalSeconds: number; taskCount: number }>> {
    const result = new Map<string, { totalSeconds: number; taskCount: number }>();
    for (const id of userIds) result.set(id, { totalSeconds: 0, taskCount: 0 });
    if (userIds.length === 0) return result;

    const entries = await this.prisma.timeEntry.findMany({
      where: {
        tenantId,
        userId: { in: userIds },
        startedAt: { gte: windowStart },
        endedAt: { not: null },
        durationSeconds: { not: null },
      },
      select: { userId: true, taskId: true, durationSeconds: true },
    });
    const taskSeen = new Map<string, Set<string>>();
    for (const e of entries) {
      const agg = result.get(e.userId);
      if (!agg) continue;
      agg.totalSeconds += e.durationSeconds ?? 0;
      if (!taskSeen.has(e.userId)) taskSeen.set(e.userId, new Set());
      taskSeen.get(e.userId)!.add(e.taskId);
    }
    for (const [userId, tasks] of taskSeen) {
      result.get(userId)!.taskCount = tasks.size;
    }
    return result;
  }

  /** 窗口起点：今天 0 点（UTC）往前 (days-1) 天，含今天共 days 天 */
  private windowStart(days: number): Date {
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    now.setUTCDate(now.getUTCDate() - (days - 1));
    return now;
  }

  /** Decimal → number */
  private toNum(v: Prisma.Decimal | number | null | undefined): number | null {
    if (v == null) return null;
    return typeof v === 'number' ? v : v.toNumber();
  }

  /** 加载项目（40401 防探测） */
  private async loadProject(projectId: string, tenantId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId, deletedAt: null },
    });
    if (!project) throw new NotFoundException({ code: E.NOT_FOUND, message: '项目不存在或不可见' });
    return project;
  }

  /** 项目可见性（view=项目成员+只读、租户 Admin；与 dependencies.service 口径一致） */
  private async assertProjectAccess(project: { id: string; ownerId: string | null }, user: AuthUser, mode: 'view' | 'edit'): Promise<void> {
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
}
