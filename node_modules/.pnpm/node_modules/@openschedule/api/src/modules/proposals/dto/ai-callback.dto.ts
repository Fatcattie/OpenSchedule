import { IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class AiCallbackDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  run_id!: string

  @IsOptional()
  @IsString()
  proposal_id?: string | null

  @IsIn(['succeeded', 'failed'])
  status!: 'succeeded' | 'failed'

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>

  @IsOptional()
  @IsObject()
  error?: Record<string, unknown>
}
