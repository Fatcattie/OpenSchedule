/**
 * 提报审核 / 评审审批 / 评审参与人 / 子任务追加 DTO（Phase4 七项功能改动）。
 */
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDate,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { TaskPriority } from '../../../common/constants/task-status';
import { MaxDecimalPlaces } from './max-decimal-places.decorator';

/** AI 拆解/手动追加的子任务条目（发布时随父任务创建，或对未承接任务追加） */
export class SubtaskItemDto {
  @IsString()
  @Length(1, 200)
  title!: string;

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
  @Min(0.1)
  @Max(1000)
  @MaxDecimalPlaces(1)
  estimatedHours?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueAt?: Date;

  /** 该子任务是否来自 AI 拆解（审计/撤销依据） */
  @IsOptional()
  @IsBoolean()
  isAiGenerated?: boolean = false;
}

/** POST /tasks/:id/submission-review 提报审核（管理员） */
export class ReviewSubmissionDto {
  /** true=通过（进看板）；false=驳回 */
  @IsBoolean()
  approve!: boolean;

  /** 驳回原因（驳回时建议填写） */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** POST /tasks/:id/approve 评审审批通过（评审子任务完成后才允许） */
export class ApproveTaskDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version?: number;
}

/** POST /tasks/:id/reject 评审审批驳回 */
export class RejectTaskDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;

  @IsString()
  @MinLength(4)
  @MaxLength(500)
  reason!: string;
}

/** POST /tasks/:id/subtasks 对未承接任务追加（AI 拆解）子任务（管理员） */
export class CreateSubtasksDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @Type(() => SubtaskItemDto)
  subtasks!: SubtaskItemDto[];
}

/** POST /tasks/:id/review-participants 邀请/移除评审参与人（管理员） */
export class ReviewParticipantsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  add?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  remove?: string[];
}
