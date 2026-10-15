/**
 * 创建提醒 DTO（§3.5.1 POST /reminders 与 POST /tasks/:id/reminders；多档提前量 leads 数组）。
 */
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDate, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateReminderDto {
  /** 关联任务（个人/团队）；从 /tasks/:id/reminders 创建时由路径参数提供 */
  @IsOptional()
  @IsUUID()
  taskId?: string;

  /** 提醒类型：due/start/custom/deadline_approach（临期偏差=触发后走 AI 应急，★D7） */
  @IsOptional()
  @IsString()
  @IsIn(['due', 'start', 'custom', 'deadline_approach'])
  reminderType?: string = 'custom';

  /** 触发时间（zset score 来源）；不得早于当前时间 */
  @Type(() => Date)
  @IsDate()
  triggerAt!: Date;

  /** "提前 N 分钟"单档（默认 0=准时） */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10080)
  leadMinutes?: number = 0;

  /** 多档提前量：一次创建多条提醒（如 [10, 60] = 提前 10 分钟 + 提前 1 小时） */
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(10080, { each: true })
  @ArrayMaxSize(10)
  leads?: number[];

  /** 自定义文案等结构化载荷 */
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
