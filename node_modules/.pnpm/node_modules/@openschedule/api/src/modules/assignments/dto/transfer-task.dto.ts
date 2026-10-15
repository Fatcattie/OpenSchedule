/**
 * 转移任务 DTO（§3.5.1 POST /tasks/:id/transfer：{目标人/原因}；免审批但审计（A5 默认））。
 */
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class TransferTaskDto {
  /** 目标人：必须是本项目成员（service 校验；跨项目直接 40001） */
  @IsUUID()
  targetUserId!: string;

  /** 转移原因（可选，落审计；免审批但审计 A5 默认） */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /** 乐观锁版本（可选；携带则校验，冲突 40901） */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version?: number;
}
