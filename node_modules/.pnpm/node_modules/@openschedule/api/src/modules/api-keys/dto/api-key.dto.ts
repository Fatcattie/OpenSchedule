/**
 * dto/api-key.dto.ts
 */
import { IsString, IsOptional, IsArray, IsDateString } from 'class-validator'

export class CreateApiKeyDto {
  @IsString()
  name!: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[]

  @IsOptional()
  @IsDateString()
  expiresAt?: string
}

export class ListApiKeysQueryDto {
  @IsOptional()
  @IsString()
  scope?: string
}
