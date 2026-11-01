/**
 * 创建/重开个人任务 helper DTO（重开：T9 原因必填 ≥4 字符）。
 */
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ReopenPersonalTaskDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(4, { message: '重开原因至少 4 个字符' })
  @MaxLength(500)
  reason!: string;
}