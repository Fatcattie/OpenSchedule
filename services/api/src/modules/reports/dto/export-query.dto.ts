import { IsOptional, IsIn } from 'class-validator';

export class ExportQueryDto {
  @IsOptional()
  @IsIn(['csv'])
  format?: 'csv' = 'csv';
}
