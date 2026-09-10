/**
 * 导入导出服务（§3.5.1：POST /import/tasks CSV 批量导入、GET /export/tasks CSV/JSON 导出）。
 * 导入策略：跳过错误行（§3.5.1 要求返回校验错误明细）——逐行校验（title 必填/优先级枚举/due_at 日期/
 * estimated_hours 数值/tags 数组/assignee_email 匹配租户成员），合法行事务落库 + 逐条审计，非法行汇总 {line, reason}。
 * 租户隔离：显式 tenantId + PrismaService 租户扩展双保险；写操作走 Idempotency-Key（全局拦截器）。
 */
import { promises as fs } from 'node:fs';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, Task } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth-user.interface';
import { isTenantAdmin } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { parseCsv, toCsv } from './csv';
import { ExportFormat, ExportTasksQueryDto, ImportTasksQueryDto, UploadedCsvFile } from './dto/import-export-query.dto';

/** 导入导出模块错误码（§3.1 分段码表） */
const E = { BAD_REQUEST: 40001, FORBIDDEN: 40301, NOT_FOUND: 40401 } as const;

/** CSV 文件大小上限：5MB */
const MAX_CSV_BYTES = 5 * 1024 * 1024;

/** 单次导入行数上限（防大文件打爆连接） */
const MAX_IMPORT_ROWS = 2000;

/** 导入列契约（与前端收尾员对齐：首行为表头，列名大小写不敏感，顺序不限） */
const IMPORT_COLUMNS = ['title', 'description', 'priority', 'due_at', 'estimated_hours', 'tags', 'assignee_email'] as const;

/** 优先级枚举（§3.5.5；默认 medium） */
const PRIORITIES: ReadonlySet<string> = new Set(['urgent', 'high', 'medium', 'low']);

/** 单行校验结果 */
interface RowResult {
  line: number;
  ok: boolean;
  reason?: string;
  data?: {
    title: string;
    description: string | null;
    priority: string;
    dueAt: Date | null;
    estimatedHours: number | null;
    tags: string[];
    assigneeId: string | null;
  };
}

/** 导入错误明细（响应 errors[] 元素） */
export interface ImportError {
  line: number;
  reason: string;
}

@Injectable()
export class ImportExportService {
  private readonly logger = new Logger(ImportExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ===================== 导入 =====================

  /** CSV 批量导入任务：跳过错误行策略，返回 {imported, failed, errors[], created[]} */
  async importTasks(user: AuthUser, query: ImportTasksQueryDto, file: UploadedCsvFile | undefined) {
    const projectId = query.project_id ?? query.projectId;
    if (!projectId) throw new BadRequestException({ code: E.BAD_REQUEST, message: '缺少 project_id 查询参数（导入目标项目）' });
    if (!file) throw new BadRequestException({ code: E.BAD_REQUEST, message: '缺少 CSV 文件（multipart 字段名 file）' });
    if (file.size === 0) throw new BadRequestException({ code: E.BAD_REQUEST, message: 'CSV 文件为空' });
    if (file.size > MAX_CSV_BYTES) throw new BadRequestException({ code: E.BAD_REQUEST, message: 'CSV 文件超过 5MB 上限' });

    let text: string;
    try {
      const buf = await this.readFileBuffer(file);
      text = buf.toString('utf8');
    } finally {
      if (file.path) await fs.unlink(file.path).catch(() => undefined);
    }

    // 项目权限：租户内可见 + 项目成员/负责人/租户 Admin（与 tasks 模块创建权限对齐）
    const project = await this.prisma.project.findFirst({ where: { id: projectId, tenantId: user.tenantId, deletedAt: null } });
    if (!project) throw new NotFoundException({ code: E.NOT_FOUND, message: '项目不存在或不可见' });
    const isProjectMember = await this.isProjectMember(user, projectId);
    if (!(isTenantAdmin(user) || project.ownerId === user.userId || isProjectMember)) {
      throw new ForbiddenException({ code: E.FORBIDDEN, message: '你不是该项目成员，不能导入任务' });
    }

    const rows = parseCsv(text);
    if (rows.length === 0) throw new BadRequestException({ code: E.BAD_REQUEST, message: 'CSV 无有效数据行' });
    const columnIndex = this.resolveHeader(rows[0]);
    if (!columnIndex.title) {
      throw new BadRequestException({ code: E.BAD_REQUEST, message: `CSV 表头缺少 title 列（支持列：${IMPORT_COLUMNS.join('/')}）` });
    }
    const dataRows = rows.slice(1);
    if (dataRows.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException({ code: E.BAD_REQUEST, message: `单次导入最多 ${MAX_IMPORT_ROWS} 行` });
    }

    // 租户成员邮箱 → userId 映射（assignee_email 校验）
    const memberByEmail = await this.buildMemberEmailMap(user.tenantId);

    // 逐行校验（行号 = 数据行序号 + 2：首行表头 + 1 基索引）
    const results: RowResult[] = dataRows.map((cells, idx) => this.validateRow(cells, columnIndex, idx + 2, memberByEmail));
    const errors: ImportError[] = results.filter(r => !r.ok).map(r => ({ line: r.line, reason: r.reason! }));
    const validRows = results.filter((r): r is RowResult & { ok: true; data: NonNullable<RowResult['data']> } => r.ok && !!r.data);

    let created: Task[] = [];
    if (validRows.length > 0) {
      created = await this.prisma.$transaction(async tx => {
        const list: Task[] = [];
        for (const row of validRows) {
          const task = await tx.task.create({
            data: {
              tenantId: user.tenantId,
              projectId,
              title: row.data.title,
              description: row.data.description,
              status: 'todo',
              priority: row.data.priority,
              assigneeId: row.data.assigneeId,
              dueAt: row.data.dueAt,
              estimatedHours: row.data.estimatedHours,
              tags: row.data.tags,
              createdBy: user.userId,
              version: 0,
            },
          });
          await this.audit.record(
            { tenantId: user.tenantId, actorId: user.userId, action: 'task.import', resourceType: 'task', resourceId: task.id, after: task },
            tx,
          );
          list.push(task);
        }
        return list;
      });
      this.logger.log(`CSV 导入完成：成功 ${created.length} 条 / 失败 ${errors.length} 条（项目 ${projectId}）`);
    }

    return {
      data: {
        imported: created.length,
        failed: errors.length,
        errors,
        created,
      },
      meta: {},
    };
  }

  // ===================== 导出 =====================

  /** 导出任务（CSV/JSON；project_id 缺省 = 可导出范围全部任务；§3.4 权限矩阵：Admin 全量，成员仅自己可见范围） */
  async exportTasks(user: AuthUser, query: ExportTasksQueryDto) {
    const projectId = query.project_id ?? query.projectId ?? null;
    // 非 Admin：本人参与项目（负责人/成员）的任务 + 本人创建的未分配任务
    const accessibleProjectIds = isTenantAdmin(user) ? null : await this.loadAccessibleProjectIds(user);
    if (projectId) {
      const project = await this.prisma.project.findFirst({ where: { id: projectId, tenantId: user.tenantId, deletedAt: null }, select: { id: true } });
      if (!project) throw new NotFoundException({ code: E.NOT_FOUND, message: '项目不存在或不可见' });
      if (accessibleProjectIds && !accessibleProjectIds.has(projectId)) {
        throw new ForbiddenException({ code: E.FORBIDDEN, message: '你只能导出自己参与项目的任务' });
      }
    }

    const where: Prisma.TaskWhereInput = { tenantId: user.tenantId, deletedAt: null };
    if (projectId) {
      where.projectId = projectId;
    } else if (accessibleProjectIds) {
      where.OR = [
        { projectId: { in: [...accessibleProjectIds] } },
        { createdBy: user.userId, assigneeId: null },
      ];
    }

    const tasks = await this.prisma.task.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    // assignee 邮箱解析（users 无 tenant_id，按 id 批量查）
    const assigneeIds = [...new Set(tasks.map(t => t.assigneeId).filter((id): id is string => !!id))];
    const emailById = new Map<string, string>();
    if (assigneeIds.length > 0) {
      const users = await this.prisma.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, email: true } });
      for (const u of users) emailById.set(u.id, u.email);
    }

    const rows = tasks.map(t => ({
      id: t.id,
      title: t.title,
      description: t.description ?? '',
      status: t.status,
      priority: t.priority,
      assignee_email: t.assigneeId ? (emailById.get(t.assigneeId) ?? '') : '',
      due_at: t.dueAt?.toISOString() ?? '',
      estimated_hours: t.estimatedHours?.toString() ?? '',
      actual_hours: t.actualHours?.toString() ?? '',
      completed_at: t.completedAt?.toISOString() ?? '',
      tags: t.tags.join(';'),
      created_at: t.createdAt.toISOString(),
      updated_at: t.updatedAt.toISOString(),
    }));

    // 审计（数据外发留痕，只读操作审计属于可观测性增强）
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.userId,
      action: 'task.export',
      resourceType: 'task',
      resourceId: projectId ?? null,
      after: { format: query.format, count: rows.length, projectId },
    });

    if (query.format === ExportFormat.JSON) {
      return { data: rows, meta: { total: rows.length } };
    }

    // CSV：表头 + BOM（Excel 识别 UTF-8）
    const header = ['id', 'title', 'description', 'status', 'priority', 'assignee_email', 'due_at', 'estimated_hours', 'actual_hours', 'completed_at', 'tags', 'created_at', 'updated_at'];
    const csv = '\uFEFF' + toCsv([header, ...rows.map(r => header.map(h => String(r[h as keyof typeof r] ?? '')))]);
    return { csv, total: rows.length };
  }

  // ===================== 校验工具 =====================

  /** 解析表头：列名（小写）→ 数据行下标；无 title 列返回 {title: undefined} */
  private resolveHeader(headerRow: string[]): { [key: string]: number | undefined } {
    const map: { [key: string]: number | undefined } = {};
    headerRow.forEach((name, idx) => {
      const key = name.trim().toLowerCase();
      if ((IMPORT_COLUMNS as readonly string[]).includes(key)) map[key] = idx;
    });
    return map;
  }

  /** 单行校验（§3.5.5 校验规则与 CreateTaskDto 对齐） */
  private validateRow(
    cells: string[],
    columnIndex: { [key: string]: number | undefined },
    line: number,
    memberByEmail: ReadonlyMap<string, string>,
  ): RowResult {
    const cell = (col: string): string => {
      const idx = columnIndex[col];
      return idx !== undefined && idx < cells.length ? cells[idx].trim() : '';
    };

    const title = cell('title');
    if (!title) return { line, ok: false, reason: 'title 必填' };
    if (title.length > 200) return { line, ok: false, reason: 'title 超过 200 字符' };

    const descriptionRaw = cell('description');
    const description = descriptionRaw ? descriptionRaw : null;

    const priorityRaw = cell('priority');
    let priority = 'medium';
    if (priorityRaw) {
      if (!PRIORITIES.has(priorityRaw)) return { line, ok: false, reason: `priority 必须是 urgent/high/medium/low，收到「${priorityRaw}」` };
      priority = priorityRaw;
    }

    let dueAt: Date | null = null;
    const dueRaw = cell('due_at');
    if (dueRaw) {
      const parsed = new Date(dueRaw);
      if (Number.isNaN(parsed.getTime())) return { line, ok: false, reason: `due_at 日期无法解析（建议 ISO 8601 或 YYYY-MM-DD HH:mm），收到「${dueRaw}」` };
      dueAt = parsed;
    }

    let estimatedHours: number | null = null;
    const estRaw = cell('estimated_hours');
    if (estRaw) {
      const num = Number(estRaw);
      if (!Number.isFinite(num) || num <= 0 || num > 1000) {
        return { line, ok: false, reason: `estimated_hours 必须是 0<x≤1000 的数字，收到「${estRaw}」` };
      }
      if (Math.abs(num * 10 - Math.round(num * 10)) >= 1e-9) return { line, ok: false, reason: `estimated_hours 最多 1 位小数，收到「${estRaw}」` };
      estimatedHours = num;
    }

    const tagsRaw = cell('tags');
    const tags = tagsRaw
      ? [...new Set(tagsRaw.split(/[;；]/).map(s => s.trim()).filter(Boolean))]
      : [];
    if (tags.length > 20) return { line, ok: false, reason: 'tags 最多 20 个（分号分隔）' };
    if (tags.some(t => t.length > 50)) return { line, ok: false, reason: '单个 tag 最长 50 字符' };

    let assigneeId: string | null = null;
    const emailRaw = cell('assignee_email');
    if (emailRaw) {
      const key = emailRaw.toLowerCase();
      const found = memberByEmail.get(key);
      if (!found) return { line, ok: false, reason: `assignee_email「${emailRaw}」不是本租户成员` };
      assigneeId = found;
    }

    return {
      line,
      ok: true,
      data: { title, description, priority, dueAt, estimatedHours, tags, assigneeId },
    };
  }

  /** 租户成员邮箱 → userId 映射（user_roles × users；active 用户） */
  private async buildMemberEmailMap(tenantId: string): Promise<ReadonlyMap<string, string>> {
    const roles = await this.prisma.userRole.findMany({
      where: { tenantId, user: { status: 'active' } },
      select: { userId: true, user: { select: { email: true } } },
    });
    const map = new Map<string, string>();
    for (const r of roles) {
      if (r.user?.email) map.set(r.user.email.toLowerCase(), r.userId);
    }
    return map;
  }

  /** 是否项目成员（user_roles scope_resource_id=项目 id） */
  private async isProjectMember(user: { userId: string; tenantId: string }, projectId: string): Promise<boolean> {
    const count = await this.prisma.userRole.count({
      where: { tenantId: user.tenantId, userId: user.userId, scopeResourceId: projectId },
    });
    return count > 0;
  }

  /** 本人参与的项目 id 集合（负责人 + 项目级成员，§3.4 权限矩阵） */
  private async loadAccessibleProjectIds(user: AuthUser): Promise<Set<string>> {
    const [owned, roles] = await Promise.all([
      this.prisma.project.findMany({ where: { tenantId: user.tenantId, ownerId: user.userId, deletedAt: null }, select: { id: true } }),
      this.prisma.userRole.findMany({ where: { tenantId: user.tenantId, userId: user.userId, role: { scope: 'project' } }, select: { scopeResourceId: true } }),
    ]);
    const ids = new Set<string>(owned.map(p => p.id));
    for (const r of roles) if (r.scopeResourceId) ids.add(r.scopeResourceId);
    return ids;
  }

  /** 读取文件字节：优先内存缓冲，磁盘临时文件场景读后清理 */
  private async readFileBuffer(file: UploadedCsvFile): Promise<Buffer> {
    if (file.buffer && file.buffer.length > 0) return file.buffer;
    if (file.path) {
      try {
        return await fs.readFile(file.path);
      } finally {
        await fs.unlink(file.path).catch(() => undefined);
      }
    }
    throw new BadRequestException({ code: E.BAD_REQUEST, message: '无法读取 CSV 文件内容' });
  }
}