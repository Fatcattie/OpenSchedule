/**
 * 附件模块装配（§2 §3：attachments ★Phase 1 收尾模块）。
 * 依赖 S3Service（common/storage/s3.service.ts）；PrismaService/AuditService 由 CommonModule(@Global) 提供。
 */
import { Module } from '@nestjs/common';
import { S3Service } from '../../common/storage/s3.service';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';

@Module({
  controllers: [AttachmentsController],
  providers: [AttachmentsService, S3Service],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}