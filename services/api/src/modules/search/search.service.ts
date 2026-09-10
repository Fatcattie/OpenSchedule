/**
 * 搜索服务：全局搜索（任务/项目/评论，§3.5.1 GET /search?q=&type=）。
 * 实现：ILIKE 大小写不敏感模糊匹配 + pg_trgm 加速（扩展已在 deploy/postgres/init/001-extensions.sql 启用；
 * gin_trgm_ops 索引需 schema 负责人补迁移，见回传文档）。租户隔离由 PrismaService 租户扩展 + 显式谓词双保险。
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SearchHit, SearchQueryDto, SearchType } from './dto/search-query.dto';

/** 搜索模块错误码（§3.1 分段码表） */
const E = { BAD_REQUEST: 40001 } as const;

/** 单类型命中上限（防大结果集内存膨胀；total 为精确 count） */
const MAX_PER_TYPE = 200;

/** 内部命中（附相关度分，排序用；返回前剥离） */
interface ScoredHit extends SearchHit {
  score: number;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /** 全局搜索：按类型分别匹配后合并排序分页 */
  async search(user: { tenantId: string }, query: SearchQueryDto) {
    const q = query.q.trim();
    if (!q) throw new BadRequestException({ code: E.BAD_REQUEST, message: '搜索关键词不能为空' });
    if (q.length > 200) throw new BadRequestException({ code: E.BAD_REQUEST, message: '搜索关键词最长 200 字符' });

    const types: SearchType[] = query.type === SearchType.ALL ? [SearchType.TASK, SearchType.PROJECT, SearchType.COMMENT] : [query.type];
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);

    // 各类型并行检索（返回精确 total + 截断后的 hits，便于全局排序）
    const results = await Promise.all(
      types.map(type => {
        if (type === SearchType.TASK) return this.searchTasks(user.tenantId, q);
        if (type === SearchType.PROJECT) return this.searchProjects(user.tenantId, q);
        return this.searchComments(user.tenantId, q);
      }),
    );

    const hits = results.flatMap(r => r.hits);
    const total = results.reduce((sum, r) => sum + r.total, 0);

    // 全局排序：标题/名称命中（score 3）> 正文命中（score 1）；同分按创建时间倒序
    hits.sort((a, b) => b.score - a.score || b.createdAt.getTime() - a.createdAt.getTime());

    const start = (page - 1) * pageSize;
    const data: SearchHit[] = hits.slice(start, start + pageSize).map(({ score: _s, ...hit }) => hit);
    return { data, meta: { page, pageSize, total } };
  }

  /** 任务搜索：title/description 命中（软删过滤；标题命中权重更高） */
  private async searchTasks(tenantId: string, q: string): Promise<{ hits: ScoredHit[]; total: number }> {
    const pattern = { contains: q, mode: 'insensitive' as const };
    const where: Prisma.TaskWhereInput = {
      tenantId,
      deletedAt: null,
      OR: [{ title: pattern }, { description: pattern }],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        select: { id: true, title: true, description: true, projectId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: MAX_PER_TYPE,
      }),
      this.prisma.task.count({ where }),
    ]);
    const hits: ScoredHit[] = rows.map(t => {
      const titleHit = t.title.toLowerCase().includes(q.toLowerCase());
      return {
        type: SearchType.TASK,
        id: t.id,
        title: t.title,
        snippet: this.snippet(titleHit ? t.title : (t.description ?? ''), q),
        projectId: t.projectId,
        taskId: t.id,
        createdAt: t.createdAt,
        score: titleHit ? 3 : 1,
      };
    });
    return { hits, total };
  }

  /** 项目搜索：name/description 命中 */
  private async searchProjects(tenantId: string, q: string): Promise<{ hits: ScoredHit[]; total: number }> {
    const pattern = { contains: q, mode: 'insensitive' as const };
    const where: Prisma.ProjectWhereInput = {
      tenantId,
      deletedAt: null,
      OR: [{ name: pattern }, { description: pattern }],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        select: { id: true, name: true, description: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: MAX_PER_TYPE,
      }),
      this.prisma.project.count({ where }),
    ]);
    const hits: ScoredHit[] = rows.map(p => {
      const nameHit = p.name.toLowerCase().includes(q.toLowerCase());
      return {
        type: SearchType.PROJECT,
        id: p.id,
        title: p.name,
        snippet: this.snippet(nameHit ? p.name : (p.description ?? ''), q),
        projectId: p.id,
        taskId: null,
        createdAt: p.createdAt,
        score: nameHit ? 3 : 1,
      };
    });
    return { hits, total };
  }

  /** 评论搜索：content 命中（附带所属任务标题与 projectId 供跳转） */
  private async searchComments(tenantId: string, q: string): Promise<{ hits: ScoredHit[]; total: number }> {
    const where: Prisma.TaskCommentWhereInput = {
      tenantId,
      deletedAt: null,
      content: { contains: q, mode: 'insensitive' },
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.taskComment.findMany({
        where,
        select: { id: true, content: true, createdAt: true, taskId: true, task: { select: { title: true, projectId: true } } },
        orderBy: { createdAt: 'desc' },
        take: MAX_PER_TYPE,
      }),
      this.prisma.taskComment.count({ where }),
    ]);
    const hits: ScoredHit[] = rows.map(c => ({
      type: SearchType.COMMENT,
      id: c.id,
      title: c.task?.title ?? '(任务已删除)',
      snippet: this.snippet(c.content, q),
      projectId: c.task?.projectId ?? null,
      taskId: c.taskId,
      createdAt: c.createdAt,
      score: 1,
    }));
    return { hits, total };
  }

  /** 命中片段：截取关键词上下文（前后各 30 字符，加省略号） */
  private snippet(text: string, q: string): string {
    if (!text) return '';
    const lower = text.toLowerCase();
    const idx = lower.indexOf(q.toLowerCase());
    const start = idx >= 0 ? Math.max(0, idx - 30) : 0;
    const end = idx >= 0 ? Math.min(text.length, idx + q.length + 30) : Math.min(text.length, 80);
    const prefix = start > 0 ? '…' : '';
    const suffix = end < text.length ? '…' : '';
    return `${prefix}${text.substring(start, end)}${suffix}`;
  }
}