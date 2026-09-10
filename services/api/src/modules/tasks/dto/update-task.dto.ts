/**
 * 更新任务 DTO（§3.5.1 PATCH /tasks/:id 更新（含状态流转）；status 变更走迁移表，必须携带 version 乐观锁）。
 */
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsDate, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min, MinLength } from 'class-validator';
import { TaskPriority, TaskStatus } from '../../../common/constants/task-status';
import { MaxDecimalPlaces } from './max-decimal-places.decorator';

export class UpdateTaskDto {
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
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1000)
  @MaxDecimalPlaces(1)
  estimatedHours?: number;

  /** 实际工时（★D3：完成流程/计时落库；此处支持手动覆盖） */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1000)
  @MaxDecimalPlaces(1)
  actualHours?: number;

  /** 传 null 表示清空截止 */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueAt?: Date | null;

  /** 任务开始时间（Phase4：管理员编辑未承接任务时间窗；传 null 清空） */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startAt?: Date | null;

  /** 分配（指定 assignee）：仅项目负责人、租户 Admin 可改；成员只能自领（§3.4） */
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  /** 状态流转（含状态流转的更新必须携带 version） */
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  /** 状态流转原因（T2/T8 blocked/cancelled 必填 ≥4 字符） */
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(500)
  statusReason?: string;

  /** 父任务变更（同项目；深度≤4；防环；传 null 清除父级） */
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  @ArrayUnique()
  tags?: string[];

  /** 乐观锁版本（状态变更必带；普通编辑可选，携带则校验） */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version?: number;
}
