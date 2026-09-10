/**
 * 模板相关 DTO
 */
import { IsString, IsOptional, IsBoolean, IsArray, IsUUID, MaxLength } from 'class-validator'

export class CreateTemplateDto {
  @IsString()
  @MaxLength(200)
  name!: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsString()
  type?: string

  @IsOptional()
  @IsString()
  category?: string

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean

  @IsOptional()
  @IsArray()
  tags?: string[]

  @IsOptional()
  taskSnapshot?: any[]

  @IsOptional()
  dependencySnapshot?: any[]
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsString()
  category?: string

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean

  @IsOptional()
  @IsArray()
  tags?: string[]

  @IsOptional()
  taskSnapshot?: any[]

  @IsOptional()
  dependencySnapshot?: any[]
}

export class SaveAsTemplateDto {
  @IsString()
  @MaxLength(200)
  name!: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean

  @IsOptional()
  @IsString()
  category?: string

  @IsOptional()
  @IsArray()
  tags?: string[]
}

export class ApplyTemplateDto {
  @IsString()
  @MaxLength(200)
  name!: string

  @IsOptional()
  @IsString()
  description?: string
}
