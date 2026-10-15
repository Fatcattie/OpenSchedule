/**
 * 通知偏好 DTO（§3.5.1 PUT /notifications/preferences：三通道开关 + 免打扰时段；缺省 eventType 用通配 '*'）。
 */
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

/** 通道开关 {email, push, im}（notification_preferences.channels jsonb） */
export class ChannelSettingsDto {
  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @IsOptional()
  @IsBoolean()
  push?: boolean;

  @IsOptional()
  @IsBoolean()
  im?: boolean;
}

/** 免打扰时段 [{days: 0-6（周日=0，JS getDay 对齐）, start: 'HH:mm', end: 'HH:mm'}]（支持跨午夜） */
export class QuietHourRangeDto {
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  days!: number[];

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'start 格式必须为 HH:mm' })
  start!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'end 格式必须为 HH:mm' })
  end!: string;
}

export class UpdatePreferencesDto {
  /** 事件类型；支持通配默认项 '*'（UNIQUE(user_id, event_type)） */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  eventType?: string = '*';

  @IsOptional()
  @ValidateNested()
  @Type(() => ChannelSettingsDto)
  channels?: ChannelSettingsDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => QuietHourRangeDto)
  quietHours?: QuietHourRangeDto[];
}
