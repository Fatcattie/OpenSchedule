/**
 * 创建个人任务 DTO（R6-2 / BC-04：POST /me/tasks）。
 * 个人任务属主 = 当前用户（tenant_id + user_id 由 service 强制，请求体不可指定）。
 */
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsDate, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';
import { TaskPriority } from '../../../common/constants/task-status';
import { MaxDecimalPlaces } from '../../tasks/dto/max-decimal-places.decorator';

export class CreatePersonalTaskDto {
  /** 标题：必填 1–200 字符（DB varchar(300) 为容量余量） */
  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority = TaskPriority.MEDIUM;

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

  /** 父个人任务（再拆解；须为本人名下任务；防环由 service 校验） */
  @IsOptional()
  @IsUUID()
  parentId?: string;

  /** 关联团队任务（linked_task_id 预留：个人计划 ↔ 团队任务提升） */
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