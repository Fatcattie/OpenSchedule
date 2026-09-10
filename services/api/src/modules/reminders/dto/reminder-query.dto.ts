/**
 * 提醒列表查询 DTO（§3.1 分页约定；本人可见）。
 */
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ReminderQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['scheduled', 'fired', 'cancelled', 'failed'])
  status?: string;

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
  pageSize?: number = 50;
}
