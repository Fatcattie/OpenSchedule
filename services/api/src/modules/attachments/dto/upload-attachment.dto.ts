/**
 * 上传附件 DTO（§3.5.1 POST /attachments：multipart 表单字段；文件本体走 FileInterceptor）。
 * 校验规则见 §3.5.5：大小 ≤20MB、类型白名单（图片/PDF/Office/zip）、resource 必须存在（service 校验）。
 */
import { IsEnum, IsUUID } from 'class-validator';

/** 附件挂载资源类型（schema attachments.resource_type：task/comment/project） */
export enum AttachmentResourceType {
  TASK = 'task',
  COMMENT = 'comment',
  PROJECT = 'project',
}

export class UploadAttachmentDto {
  /** 挂载资源类型：task/comment/project（multipart 表单字段名 resource_type，与 schema/规格一致） */
  @IsEnum(AttachmentResourceType, { message: 'resource_type 必须是 task/comment/project 之一' })
  resource_type!: AttachmentResourceType;

  /** 挂载资源 id（任务/评论/项目 id；表单字段名 resource_id） */
  @IsUUID()
  resource_id!: string;
}

/** 附件查询 DTO（GET /attachments 列表扩展端点） */
export class AttachmentListQueryDto {
  @IsEnum(AttachmentResourceType, { message: 'resource_type 必须是 task/comment/project 之一' })
  resource_type!: AttachmentResourceType;

  @IsUUID()
  resource_id!: string;
}

/** multer 上传文件对象（本地最小契约；@types/multer 未安装，不引用 Express.Multer 命名空间） */
export interface UploadedAttachmentFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
  size: number;
  /** 内存存储（FileInterceptor 未指定 storage 时 multer 默认 memoryStorage）：文件字节 */
  buffer?: Buffer;
  /** 磁盘存储时的临时路径（兼容备用；存在则服务端读取后清理） */
  path?: string;
}
