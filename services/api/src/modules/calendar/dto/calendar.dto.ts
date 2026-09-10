/**
 * calendar.dto.ts
 */
import { IsString, IsOptional, IsBoolean, IsArray, IsDateString, IsNotEmpty, ArrayNotEmpty, IsIn } from 'class-validator'

export class BindAccountDto {
  @IsString()
  @IsNotEmpty()
  provider!: string

  @IsString()
  @IsNotEmpty()
  accountName!: string

  @IsOptional()
  @IsString()
  calendarId?: string
}

export class BusyFreeQueryDto {
  @IsString()
  @IsNotEmpty()
  userId!: string

  @IsDateString()
  @IsNotEmpty()
  startDate!: string

  @IsDateString()
  @IsNotEmpty()
  endDate!: string
}

export class BatchBusyFreeQueryDto {
  @IsArray()
  @ArrayNotEmpty()
  userIds!: string[]

  @IsDateString()
  @IsNotEmpty()
  startDate!: string

  @IsDateString()
  @IsNotEmpty()
  endDate!: string
}

export class SyncTaskDto {
  @IsOptional()
  @IsString()
  accountId?: string
}

export class SyncAccountDto {
  @IsDateString()
  startDate!: string

  @IsDateString()
  endDate!: string

  @IsOptional()
  @IsIn(['task_wins', 'calendar_wins', 'manual'])
  conflictStrategy?: 'task_wins' | 'calendar_wins' | 'manual'
}
