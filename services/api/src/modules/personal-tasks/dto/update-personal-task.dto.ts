/**
 * 更新个人任务 DTO（R6-2 / BC-04：PATCH /me/tasks/:id）。
 * 全部可选；status 变更走统一状态机（非法 40902 / 前置条件 40001）。
 */
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsDate, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';
import { TaskPriority, TaskStatus } from '../../../common/constants/task-status';
import { MaxDecimalPlaces } from '../../tasks/dto/max-decimal-places.decorator';

export class UpdatePersonalTaskDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueAt?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(1000)
  @MaxDecimalPlaces(1)
  estimatedHours?: number;

  /** 状态变更（走状态机）；非法迁移 40902，完成需 actualHours，重开需 reason */
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  /** 状态变更理由（T8 取消 / T9 重开 必填 ≥4 字符） */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /** 实际工时（完成迁移 T4/T7 时必填，★D3） */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100000)
  @MaxDecimalPlaces(1)
  actualHours?: number;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsUUID()
  linkedTaskId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  @ArrayUnique()
  tags?: string[];
}