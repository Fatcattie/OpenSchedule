/**
 * 完成任务 DTO（§3.5.1 POST /tasks/:id/complete；T4/T7：actual_hours 必填（未提供则取计时累计），状态变更必须携带 version）。
 */
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MaxDecimalPlaces } from './max-decimal-places.decorator';

export class CompleteTaskDto {
  /** 乐观锁版本（必带） */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;

  /** 完成摘要（可选） */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;

  /** 实际工时（T4 必填；缺省时服务端从 time_entries 累计，仍为空则 40001） */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1000)
  @MaxDecimalPlaces(1)
  actualHours?: number;
}
