/**
 * 已读标记 DTO（§3.5.1 PATCH /notifications/:id/read；read=false 支持标回未读）。
 */
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  read?: boolean = true;
}
