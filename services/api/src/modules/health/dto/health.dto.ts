/**
 * health.dto.ts —— 项目健康度 & 临期保障 DTO
 */
import { IsString, IsOptional, IsEnum, IsArray, IsNumber, Min, Max } from 'class-validator'
import { Type } from 'class-transformer'

// ========== 请求 DTO ==========

export class HealthScoreQueryDto {
  @IsOptional()
  @IsString()
  projectId?: string
}

export class HealthListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  pageSize?: number = 20
}

export class EmergencyGenerateDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  focusAreas?: string[]
}

// ========== 响应 DTO ==========

export interface HealthDimensionDto {
  progress: number
  schedule: number
  workload: number
  quality: number
}

export interface HealthRiskDto {
  id: string
  type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string
  relatedTaskIds: string[]
  metric?: {
    name: string
    value: number
    threshold: number
    unit: string
  }
}

export interface HealthScoreDto {
  projectId: string
  score: number
  level: 'green' | 'yellow' | 'red'
  dimensions: HealthDimensionDto
  risks: HealthRiskDto[]
  suggestions: string[]
  computedAt: string
  taskStats: {
    total: number
    done: number
    inProgress: number
    blocked: number
    todo: number
    overdue: number
    nearDue: number
  }
}

export interface PortfolioHealthItemDto {
  projectId: string
  projectName: string
  score: number
  level: 'green' | 'yellow' | 'red'
  riskCount: number
  taskCount: number
  progress: number
  endDate?: string
}

export interface PortfolioHealthDto {
  items: PortfolioHealthItemDto[]
  total: number
  greenCount: number
  yellowCount: number
  redCount: number
  averageScore: number
}

export interface EmergencyActionDto {
  id: string
  actionType: string
  title: string
  rationale: string
  impact: string
  targetTaskIds: string[]
  targetAssigneeIds?: string[]
  effortHours?: number
  riskReductionEstimate?: number
}

export interface EmergencySuggestionDto {
  proposalId?: string
  projectId: string
  actions: EmergencyActionDto[]
  riskScoreBefore: number
  riskScoreAfterEstimate: number
  summary: string
  generatedAt: string
}