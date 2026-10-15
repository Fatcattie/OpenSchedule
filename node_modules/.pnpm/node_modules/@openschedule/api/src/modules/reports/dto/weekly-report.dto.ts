import { IsOptional, IsString, Matches } from 'class-validator';

export class WeeklyReportDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'weekStart 必须为 YYYY-MM-DD 格式' })
  weekStart?: string;
}
