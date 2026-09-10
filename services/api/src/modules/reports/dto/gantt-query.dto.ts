import { IsOptional, IsUUID } from 'class-validator';

export class GanttQueryDto {
  @IsOptional()
  @IsUUID()
  assigneeId?: string;
}
