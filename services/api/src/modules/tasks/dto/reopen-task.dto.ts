/**
 * 重开任务 DTO（§3.5.1 POST /tasks/:id/reopen；T9：原因必填 ≥4 字符，completed_at 置空、actual_hours 保留）。
 */
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { TaskStatus } from '../../../common/constants/task-status';

export class ReopenTaskDto {
  /** 乐观锁版本（必带） */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;

  /** 重开原因：必填 ≥4 字符（T9，兼作 AI 语料） */
  @IsString()
  @MinLength(4)
  @MaxLength(500)
  reason!: string;

  /** 重开目标状态：todo（默认）/ in_progress */
  @IsOptional()
  @IsIn([TaskStatus.TODO, TaskStatus.IN_PROGRESS])
  targetStatus?: TaskStatus = TaskStatus.TODO;
}
