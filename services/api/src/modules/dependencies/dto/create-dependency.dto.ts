/**
 * 创建依赖 DTO（POST /projects/:projectId/dependencies）。
 */
import { IsBoolean, IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export enum DependencyType {
  FS = 'FS',
  SS = 'SS',
  FF = 'FF',
  SF = 'SF',
}

export class CreateDependencyDto {
  @IsUUID()
  prevTaskId!: string;

  @IsUUID()
  nextTaskId!: string;

  @IsOptional()
  @IsEnum(DependencyType)
  type?: DependencyType = DependencyType.FS;

  @IsOptional()
  @IsInt()
  @Min(0)
  lagDays?: number = 0;

  @IsOptional()
  @IsBoolean()
  isShared?: boolean = false;
}
