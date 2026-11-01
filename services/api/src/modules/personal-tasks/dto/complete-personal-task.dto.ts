/**
 * 完成个人任务 DTO（R6-2：POST /me/tasks/:id/complete；T4/T7 需 actual_hours ★D3）。
 */
import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';
import { MaxDecimalPlaces } from '../../tasks/dto/max-decimal-places.decorator';

export class CompletePersonalTaskDto {
  /** 实际工时（≥0；★D3 采集点，未计时则需显式提供） */
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100000)
  @MaxDecimalPlaces(1)
  actualHours!: number;
}