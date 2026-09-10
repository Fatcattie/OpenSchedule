/**
 * 看板拖拽 DTO（§3.5.1 POST /tasks/:id/move：{column_id?, status?, sort_order?, version}；乐观锁冲突 40901）。
 * reason 为对规格的扩展：move 携带 status 到 blocked/cancelled 时需原因（T2/T8 前置条件）。
 */
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { TaskStatus } from '../../../common/constants/task-status';

export class MoveTaskDto {
  /** 乐观锁版本（必带，§3.1） */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;

  /** 自定义列（Phase 2 workflow_column_id 占位） */
  @IsOptional()
  @IsUUID()
  columnId?: string;

  /** 目标状态（选填；携带则走状态机迁移表，非法迁移 40902 + allowed_transitions） */
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  /** 看板列内排序（乐观更新版本依据之一） */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sortOrder?: number;

  /** 【规格扩展】状态迁移原因（move 到 blocked/cancelled 时必填 ≥4 字符） */
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(500)
  reason?: string;
}
