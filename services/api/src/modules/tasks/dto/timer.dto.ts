/**
 * 计时 DTO（§3.5.1 POST /tasks/:id/start-timer；stop 无需 body，累计 actual_hours ★D3）。
 */
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class StartTimerDto {
  /** 计时备注（可选） */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
