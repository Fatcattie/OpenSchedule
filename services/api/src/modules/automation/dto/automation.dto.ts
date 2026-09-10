/**
 * 自动化规则 DTO
 */
import { IsString, IsOptional, IsBoolean, IsArray, IsObject, MaxLength, IsUUID } from 'class-validator'

export class CreateRuleDto {
  @IsString()
  @MaxLength(200)
  name!: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsUUID()
  projectId?: string

  @IsString()
  triggerType!: string

  @IsOptional()
  @IsObject()
  triggerConfig?: any

  @IsOptional()
  @IsObject()
  conditionConfig?: any

  @IsArray()
  actions!: any[]

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean
}

export class UpdateRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsString()
  triggerType?: string

  @IsOptional()
  @IsObject()
  triggerConfig?: any

  @IsOptional()
  @IsObject()
  conditionConfig?: any

  @IsOptional()
  @IsArray()
  actions?: any[]

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean
}

export class ListRulesQueryDto {
  @IsOptional()
  @IsUUID()
  projectId?: string

  @IsOptional()
  @IsString()
  triggerType?: string

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean
}

export class ToggleRuleDto {
  @IsBoolean()
  isEnabled!: boolean
}
