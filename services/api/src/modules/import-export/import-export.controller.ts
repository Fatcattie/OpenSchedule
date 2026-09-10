/**
 * 导入导出控制器（§3.5.1 导入导出与附件域：POST /import/tasks CSV 批量导入、GET /export/tasks CSV/JSON 导出）。
 * CSV 导出为文件流（不走 {data, meta} 信封）；JSON 导出走统一信封。
 */
import { Controller, Get, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ExportFormat, ExportTasksQueryDto, ImportTasksQueryDto, UploadedCsvFile } from './dto/import-export-query.dto';
import { ImportExportService } from './import-export.service';

/** CSV 上传大小上限（5MB，multer limits 给余量，service 精确校验） */
const MAX_CSV_UPLOAD_BYTES = 5 * 1024 * 1024 + 1024;

@Controller()
export class ImportExportController {
  constructor(private readonly importer: ImportExportService) {}

  /** POST /api/v1/import/tasks?project_id= CSV 批量导入（multipart file；跳过错误行，返回错误明细） */
  @Post('import/tasks')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_CSV_UPLOAD_BYTES } }))
  importTasks(
    @CurrentUser() user: AuthUser,
    @Query() query: ImportTasksQueryDto,
    @UploadedFile() file: UploadedCsvFile,
  ) {
    return this.importer.importTasks(user, query, file);
  }

  /** GET /api/v1/export/tasks?project_id=&format=csv|json 导出任务（CSV 走文件下载流，JSON 走信封） */
  @Get('export/tasks')
  async exportTasks(@CurrentUser() user: AuthUser, @Query() query: ExportTasksQueryDto, @Res() res: Response) {
    const result = await this.importer.exportTasks(user, query);
    if (query.format === ExportFormat.CSV && 'csv' in result) {
      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="tasks-${stamp}.csv"`);
      res.setHeader('X-Total-Count', String(result.total));
      res.send(result.csv);
      return;
    }
    res.json(result);
  }
}