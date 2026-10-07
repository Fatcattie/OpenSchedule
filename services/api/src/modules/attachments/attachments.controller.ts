/**
 * 附件控制器（§3.5.1 导入导出与附件域：POST /attachments 上传 + GET /attachments/:id 下载）。
 * 扩展：GET /attachments?resource_type=&resource_id= 资源附件列表。
 */
import { Body, Controller, Get, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { AttachmentsService, MAX_ATTACHMENT_BYTES } from './attachments.service';
import { AttachmentListQueryDto, UploadAttachmentDto, UploadedAttachmentFile } from './dto/upload-attachment.dto';

@Controller()
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  /** POST /api/v1/attachments 上传（multipart；file=文件本体 + resource_type/resource_id 表单字段） */
  @Post('attachments')
  @UseInterceptors(FileInterceptor('file', {
    // defParamCharset: busboy 默认用 latin1 解码 multipart 的 filename ⇒ 中文文件名乱码（如「现场照.heic」）。
    // 浏览器 / RN 客户端均以 UTF-8 发送（RFC 7578 建议）⇒ 显式指定 utf8 解码。
    defParamCharset: 'utf8',
    limits: { fileSize: MAX_ATTACHMENT_BYTES + 1024 * 1024 /* 给 multer 1MB 余量，service 精确校验 20MB */ },
  }))
  async upload(
    @CurrentUser() user: AuthUser,
    @Body() dto: UploadAttachmentDto,
    @UploadedFile() file: UploadedAttachmentFile,
  ) {
    return this.attachments.upload(user, dto, file);
  }

  /** GET /api/v1/attachments/:id 下载（返回临时签名 URL，前端跳转下载） */
  @Get('attachments/:id')
  getDownloadUrl(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.attachments.getDownloadUrl(id, user);
  }

  /** GET /api/v1/attachments?resource_type=&resource_id= 资源附件列表（扩展端点，供任务详情页附件 tab） */
  @Get('attachments')
  async listByResource(
    @CurrentUser() user: AuthUser,
    @Query() query: AttachmentListQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.attachments.listByResource(user, query.resource_type, query.resource_id, { page: 1, pageSize: 100 });
    res.setHeader('X-Total-Count', String(result.meta.total));
    return result;
  }
}