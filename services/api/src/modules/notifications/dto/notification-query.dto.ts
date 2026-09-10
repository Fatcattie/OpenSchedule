/**
 * 通知收件箱查询 DTO（§3.5.1 GET /notifications：按类型/状态筛选 + 分页）。
 */
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class NotificationQueryDto {
  /** 事件类型（task.assigned/mention/deadline_approaching/...） */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  type?: string;

  /** 通知状态（notifications.status：pending/sent/failed/read） */
  @IsOptional()
  @IsString()
  @IsIn(['pending', 'sent', 'failed', 'read'])
  status?: string;

  /** 仅未读 */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unreadOnly?: boolean = false;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}
