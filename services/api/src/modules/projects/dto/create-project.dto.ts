/**
 * 创建项目 DTO（§3.5.1 POST /projects；name 上限 200 对齐 projects.name varchar(200)，deadline 不得早于当前时间在 service 校验）。
 */
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  /** 大计划截止（临期保障的根）；UTC 传输，前端按用户时区渲染 */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  deadline?: Date;

  /** Phase 2：自定义状态流配置引用（project_columns 表 Phase 2 建表，当前仅占位存储，不增删底层状态） */
  @IsOptional()
  @IsUUID()
  workflowId?: string;
}
