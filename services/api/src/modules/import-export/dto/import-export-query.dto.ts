/**
 * 导入导出查询 DTO（§3.5.1：POST /import/tasks?project_id=、GET /export/tasks?project_id=&format=）。
 */
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

/** 导入目标项目（query 参数 project_id，规格 §3.5.1；兼容 camelCase projectId） */
export class ImportTasksQueryDto {
  /** 目标项目 id（CSV 中任务全部落入该项目）；规格字段名 project_id */
  @IsOptional()
  @IsUUID()
  project_id?: string;

  /** 兼容现有代码库 camelCase 习惯（projectId），二选一；两都缺报 40001 */
  @IsOptional()
  @IsUUID()
  projectId?: string;
}

/** 导出格式 */
export enum ExportFormat {
  CSV = 'csv',
  JSON = 'json',
}

/** 导出过滤（§3.5.1 GET /export/tasks?format=csv|json；project_id 缺省=全租户任务） */
export class ExportTasksQueryDto {
  /** 可选：按项目导出；缺省导出租户全部未删除任务（规格字段名 project_id） */
  @IsOptional()
  @IsUUID()
  project_id?: string;

  /** 兼容 camelCase projectId */
  @IsOptional()
  @IsUUID()
  projectId?: string;

  /** 导出格式：csv/json，默认 csv */
  @IsOptional()
  @IsEnum(ExportFormat)
  format: ExportFormat = ExportFormat.CSV;
}

/** multer 上传的 CSV 文件对象（本地最小契约；@types/multer 未安装） */
export interface UploadedCsvFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
  size: number;
  /** 内存存储（FileInterceptor 未指定 storage 时 multer 默认 memoryStorage）：文件字节 */
  buffer?: Buffer;
  /** 磁盘存储时的临时路径（兼容备用；存在则服务端读取后清理） */
  path?: string;
}
