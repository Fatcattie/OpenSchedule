/**
 * 更新项目 DTO（§3.5.1 PATCH /projects/:id；仅项目负责人、租户 Admin 可编辑，权限在 service 校验）。
 */
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  deadline?: Date;

  /** Phase 2：自定义工作流列配置占位 */
  @IsOptional()
  @IsUUID()
  workflowId?: string;
}
