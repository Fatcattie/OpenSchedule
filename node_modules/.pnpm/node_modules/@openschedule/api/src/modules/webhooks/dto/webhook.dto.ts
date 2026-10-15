/**
 * dto/webhook.dto.ts
 */
import { IsString, IsOptional, IsArray, IsBoolean, IsUrl } from 'class-validator'

export class CreateWebhookDto {
  @IsString()
  name!: string

  @IsString()
  @IsUrl()
  url!: string

  @IsArray()
  @IsString({ each: true })
  events!: string[]

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}

export class UpdateWebhookDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  @IsUrl()
  url?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[]

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}

export class ToggleWebhookDto {
  @IsBoolean()
  isActive!: boolean
}
