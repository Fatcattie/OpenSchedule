/**
 * 更新提醒 DTO（§3.5.1 PATCH /reminders/:id；改触发时间会同步 zset score；status 支持手动取消/恢复）。
 */
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateReminderDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  triggerAt?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10080)
  leadMinutes?: number;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  /** scheduled=恢复已取消；cancelled=取消 */
  @IsOptional()
  @IsString()
  @IsIn(['scheduled', 'cancelled'])
  status?: 'scheduled' | 'cancelled';
}
