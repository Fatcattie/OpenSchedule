/**
 * 分页 DTO 基类与分页结果类型（§3.1：列表统一 ?page&page_size(≤100) + 响应头 X-Total-Count；sort/filter 走白名单）。
 * 业务模块列表查询 DTO 可 extends 本基类；X-Total-Count 响应头由 controller 设置（参考 projects.controller.ts 写法）。
 */
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  /** 每页条数上限 100（§3.1） */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

/** 统一列表响应体 {data, meta}（§3.5） */
export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

export function toPaginated<T>(data: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return { data, meta: { page, pageSize, total } };
}
