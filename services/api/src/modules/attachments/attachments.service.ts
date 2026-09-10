/**
 * 附件服务：multipart 上传到 S3 兼容存储（MinIO，object_key 带 tenant_id 前缀隔离）
 * + 下载临时签名 URL + 资源附件列表。写操作事务 + 审计；文件白名单/大小上限见 §3.5.5。
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth-user.interface';
import { isTenantAdmin } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { S3Service } from '../../common/storage/s3.service';
import { AttachmentResourceType, UploadAttachmentDto, UploadedAttachmentFile } from './dto/upload-attachment.dto';
import { MAX_ATTACHMENT_BYTES, validateAttachmentMetadata } from './attachment-policy';

// 保持 controller 的既有导入路径兼容。
export { MAX_ATTACHMENT_BYTES } from './attachment-policy';

/** 附件模块错误码（§3.1 分段码表） */
const E = { BAD_REQUEST: 40001, FORBIDDEN: 40301, NOT_FOUND: 40401 } as const;

/** 单文件大小上限：20MB（§3.5.5；multer limits 与 service 双重校验） */

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: S3Service,
  ) {}

  /** 上传附件：校验 → 资源存在性+项目成员权限 → S3 PUT → 落库（含审计，同事务） */
  async upload(user: AuthUser, dto: UploadAttachmentDto, file: UploadedAttachmentFile | undefined) {
    if (!file) throw new BadRequestException({ code: E.BAD_REQUEST, message: '缺少上传文件（multipart 字段名 file）' });
    const mime = file.mimetype?.toLowerCase() ?? 'application/octet-stream';
    const policyError = validateAttachmentMetadata(file.size, mime);
    if (policyError) throw new BadRequestException({ code: E.BAD_REQUEST, message: policyError });
    // §3.4 权限矩阵：附件上传=项目成员（含只读）+ 项目负责人/租户 Admin；资源不存在/软删按 40401
    const projectId = await this.resolveResourceProject(user.tenantId, dto.resource_type, dto.resource_id);
    await this.assertAttachmentAccess(user, projectId);

    // 读取文件字节：优先内存缓冲（multer 默认 memoryStorage），磁盘临时文件场景读后清理
    const buffer = await this.readFileBuffer(file);

    const objectKey = S3Service.buildObjectKey(user.tenantId, dto.resource_type, dto.resource_id, file.originalname);
    const putResult = await this.storage.putObject(objectKey, buffer, mime);

    const checksum = createHash('sha256').update(buffer).digest('hex');
    const attachment = await this.prisma.$transaction(async tx => {
      const created = await tx.attachment.create({
        data: {
          tenantId: user.tenantId,
          resourceType: dto.resource_type,
          resourceId: dto.resource_id,
          objectKey,
          fileName: file.originalname.substring(0, 255),
          mimeType: mime,
          sizeBytes: buffer.length,
          uploaderId: user.userId,
          checksum,
        },
      });
      await this.audit.record(
        {
          tenantId: user.tenantId,
          actorId: user.userId,
          action: 'attachment.upload',
          resourceType: 'attachment',
          resourceId: created.id,
          after: { objectKey, fileName: created.fileName, mimeType: mime, sizeBytes: created.sizeBytes, targetResource: `${dto.resource_type}/${dto.resource_id}` },
        },
        tx,
      );
      return created;
    });
    this.logger.log(`附件上传成功 ${attachment.id}（${putResult.location}）`);
    return {
      data: {
        id: attachment.id,
        resourceType: attachment.resourceType,
        resourceId: attachment.resourceId,
        objectKey: attachment.objectKey,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        createdAt: attachment.createdAt,
      },
      meta: {},
    };
  }

  /** 下载：返回临时签名 URL（§3.5.1 GET /attachments/:id；跨租户猜 id 返回 40401 防探测） */
  async getDownloadUrl(id: string, user: AuthUser) {
    const attachment = await this.prisma.attachment.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!attachment) throw new NotFoundException({ code: E.NOT_FOUND, message: '附件不存在或不可见' });
    // §3.4 权限矩阵：下载=项目成员（含只读）+ 负责人/Admin；同时校验挂载资源未软删（resolve 内部 404）
    const projectId = await this.resolveResourceProject(user.tenantId, attachment.resourceType as AttachmentResourceType, attachment.resourceId);
    await this.assertAttachmentAccess(user, projectId);
    const expiresIn = 300; // 5 分钟临时链接
    const downloadUrl = this.storage.presignGetUrl(attachment.objectKey, expiresIn);
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.userId,
      action: 'attachment.download',
      resourceType: 'attachment',
      resourceId: attachment.id,
      after: { fileName: attachment.fileName, expiresIn },
    });
    return {
      data: {
        attachment: {
          id: attachment.id,
          resourceType: attachment.resourceType,
          resourceId: attachment.resourceId,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          createdAt: attachment.createdAt,
        },
        downloadUrl,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
      },
      meta: {},
    };
  }

  /** 资源附件列表（§3.5.1 之外的扩展端点，供任务详情页附件 tab 使用；同样校验成员权限） */
  async listByResource(user: AuthUser, resourceType: AttachmentResourceType, resourceId: string, query: { page?: number; pageSize?: number }) {
    const projectId = await this.resolveResourceProject(user.tenantId, resourceType, resourceId);
    await this.assertAttachmentAccess(user, projectId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where: Prisma.AttachmentWhereInput = { tenantId: user.tenantId, resourceType, resourceId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.attachment.findMany({ where, orderBy: { createdAt: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.attachment.count({ where }),
    ]);
    return { data: items, meta: { page, pageSize, total } };
  }

  /** 挂载资源 → 归属项目 id 解析（task/comment 经所属任务取 projectId；不存在/软删一律 40401 防探测） */
  private async resolveResourceProject(tenantId: string, resourceType: AttachmentResourceType, resourceId: string): Promise<string | null> {
    if (resourceType === AttachmentResourceType.TASK) {
      const task = await this.prisma.task.findFirst({ where: { id: resourceId, tenantId, deletedAt: null }, select: { projectId: true } });
      if (!task) throw new NotFoundException({ code: E.NOT_FOUND, message: '挂载资源不存在或不可见' });
      return task.projectId;
    }
    if (resourceType === AttachmentResourceType.COMMENT) {
      const comment = await this.prisma.taskComment.findFirst({ where: { id: resourceId, tenantId, deletedAt: null }, select: { taskId: true } });
      if (!comment) throw new NotFoundException({ code: E.NOT_FOUND, message: '挂载资源不存在或不可见' });
      const task = await this.prisma.task.findFirst({ where: { id: comment.taskId, tenantId, deletedAt: null }, select: { projectId: true } });
      if (!task) throw new NotFoundException({ code: E.NOT_FOUND, message: '挂载资源不存在或不可见' });
      return task.projectId;
    }
    const project = await this.prisma.project.findFirst({ where: { id: resourceId, tenantId, deletedAt: null }, select: { id: true } });
    if (!project) throw new NotFoundException({ code: E.NOT_FOUND, message: '挂载资源不存在或不可见' });
    return project.id;
  }

  /**
   * 附件访问权限（§3.4 权限矩阵：上传/下载=项目成员+只读；项目负责人/租户 Admin 放行）。
   * 模式复用 tasks.service 的 assertProjectAccess：userRole 项目级成员判定（scopeResourceId=项目 id）。
   * 无归属项目（个人任务等）仅租户 Admin 可访问，其余 403 防越权。
   */
  private async assertAttachmentAccess(user: AuthUser, projectId: string | null): Promise<void> {
    if (isTenantAdmin(user)) return;
    if (!projectId) throw new ForbiddenException({ code: E.FORBIDDEN, message: '非项目成员，无权操作附件' });
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId: user.tenantId, deletedAt: null },
      select: { ownerId: true },
    });
    if (!project) throw new NotFoundException({ code: E.NOT_FOUND, message: '挂载资源不存在或不可见' });
    if (project.ownerId === user.userId) return;
    const member = await this.prisma.userRole.findFirst({
      where: { tenantId: user.tenantId, userId: user.userId, scopeResourceId: projectId, role: { scope: 'project' } },
      select: { id: true },
    });
    if (!member) throw new ForbiddenException({ code: E.FORBIDDEN, message: '非项目成员，无权操作附件' });
  }

  /** 读取文件字节：优先内存缓冲（multer 默认 memoryStorage），磁盘临时文件场景读后清理 */
  private async readFileBuffer(file: UploadedAttachmentFile): Promise<Buffer> {
    if (file.buffer && file.buffer.length > 0) return file.buffer;
    if (file.path) {
      try {
        return await fs.readFile(file.path);
      } finally {
        await fs.unlink(file.path).catch(() => undefined);
      }
    }
    throw new BadRequestException({ code: E.BAD_REQUEST, message: '无法读取上传文件内容' });
  }
}
