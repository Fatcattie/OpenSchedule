/**
 * 领取任务 DTO（§3.5.1 POST /tasks/:id/claim；T1 状态迁移 → 状态变更必须携带 version）。
 */
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class ClaimTaskDto {
  /** 乐观锁版本（必带） */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;
}
