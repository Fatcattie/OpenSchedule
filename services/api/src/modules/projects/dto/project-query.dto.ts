/**
 * 项目列表查询 DTO（§3.1 分页约定：page/page_size≤100 + X-Total-Count；sort 走白名单）。
 */
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** 项目状态（projects.status：active/archived/completed） */
export enum ProjectStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  COMPLETED = 'completed',
}

export class ProjectQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(Object.values(ProjectStatus))
  status?: ProjectStatus;

  /** 名称模糊搜索 */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

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

  /** 排序白名单：字段名或 -字段名（如 -deadline 降序） */
  @IsOptional()
  @IsString()
  @IsIn(['createdAt', '-createdAt', 'updatedAt', '-updatedAt', 'deadline', '-deadline', 'name', '-name'])
  sort?: string;
}
