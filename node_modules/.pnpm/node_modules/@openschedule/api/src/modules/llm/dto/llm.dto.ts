/**
 * dto/llm.dto.ts —— 租户 AI 模型配置 / 文本生成
 */
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import { LLM_PROVIDER_IDS } from '../llm-providers'

export class SaveLlmConfigDto {
  @IsIn(LLM_PROVIDER_IDS as unknown as string[])
  provider!: string

  /** 留空 = 使用厂商预设地址（custom 必填） */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  baseUrl?: string

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  model!: string

  /** 留空 = 保留已保存的 key（仅改厂商/模型时不必重填） */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string
}

/** 测试连接：字段均可选，缺省项回落已保存配置（便于「先测后存」与「只测已存」） */
export class TestLlmConfigDto {
  @IsOptional()
  @IsIn(LLM_PROVIDER_IDS as unknown as string[])
  provider?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  baseUrl?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string
}

export class AiCompleteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  prompt!: string

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  system?: string
}
