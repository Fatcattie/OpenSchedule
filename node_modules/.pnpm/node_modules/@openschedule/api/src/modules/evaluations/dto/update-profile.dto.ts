/**
 * 我的画像更新 DTO（PUT /evaluations/me/profile，upsert member_profile）。
 */
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum ProfileComplexityTier {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export class UpdateProfileDto {
  /** 技能标签（冷启动自评兜底；去重去空格，小写归一化在 service 处理） */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  skillTags?: string[];

  /** 复杂度承接档位 */
  @IsOptional()
  @IsEnum(ProfileComplexityTier)
  complexityTier?: 'low' | 'medium' | 'high';

  /** 是否自评冷启动数据 */
  @IsOptional()
  @IsBoolean()
  selfAssessed?: boolean;
}
