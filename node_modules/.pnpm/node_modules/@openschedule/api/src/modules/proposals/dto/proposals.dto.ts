/**
 * Proposals / AI 建议 DTO
 */
import { IsString, IsOptional, IsUUID, IsInt, Min, Max, IsArray, IsObject } from 'class-validator'
import { Type } from 'class-transformer'

export class DecomposeDto {
  @IsString()
  goalTitle!: string

  @IsOptional()
  @IsString()
  goalDescription?: string

  @IsOptional()
  @IsUUID()
  relatedProjectId?: string

  @IsOptional()
  @IsUUID()
  templateId?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  totalEstimatedHours?: number

  @IsOptional()
  @IsString()
  startDate?: string
}

export class RejectProposalDto {
  @IsOptional()
  @IsString()
  reason?: string
}

export interface ProposalDetail {
  id: string
  type: string
  status: string
  source: string
  relatedProjectId: string | null
  /** 生成引擎：ai = 租户模型经 AI 服务拆解；rules = 规则引擎/模板 */
  engine: 'ai' | 'rules'
  aiModel?: string
  summary: string
  tasks: any[]
  dependencies?: any[]
  warnings: string[]
  diffSummary: any
  createdAt: string
  updatedAt: string
  expiresAt: string | null
}

export interface ProposalListItem {
  id: string
  type: string
  status: string
  summary: string
  taskCount: number
  relatedProjectId: string | null
  createdAt: string
}

export interface ApplyProposalResult {
  projectId: string
  taskCount: number
  dependencyCount: number
  taskIds: string[]
}