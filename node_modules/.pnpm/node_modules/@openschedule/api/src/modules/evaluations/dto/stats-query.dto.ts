/**
 * 工时统计窗口查询 DTO（GET /evaluations/projects/:projectId/members/stats、GET /evaluations/me/stats）。
 * days 默认 30，上限 365。
 */
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class StatsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number = 30;
}
