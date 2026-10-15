/**
 * 导入导出模块装配（§2 §3：import-export ★Phase 1 收尾模块）。
 * PrismaService/AuditService 由 CommonModule(@Global) 提供。
 */
import { Module } from '@nestjs/common';
import { ImportExportController } from './import-export.controller';
import { ImportExportService } from './import-export.service';

@Module({
  controllers: [ImportExportController],
  providers: [ImportExportService],
  exports: [ImportExportService],
})
export class ImportExportModule {}