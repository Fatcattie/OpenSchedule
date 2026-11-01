/**
 * 工作台集合批量写 DTO（D-07 一期：PUT /workspace/:collection）。
 * 一个批次在单事务内原子生效；任一条目 baseVersion 不匹配 → 整批回滚 40901。
 * - upsert：baseVersion 为 null/缺省 = 新建（已存在则冲突）；为 n = 仅当库中 version=n 时覆盖并 +1；
 * - delete：baseVersion 为 n = 仅当库中 version=n 时删除；条目已不存在视为成功（幂等）。
 */
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDefined, IsInt, IsOptional, IsString, Matches, Min, ValidateNested } from 'class-validator';
import { ITEM_KEY_PATTERN, MAX_BATCH_OPS } from '../workspace-collections';

export class WorkspaceUpsertOpDto {
  @IsString()
  @Matches(ITEM_KEY_PATTERN)
  key!: string;

  /** 前端视图对象（任意 JSON；体积上限由 service 校验） */
  @IsDefined()
  data!: unknown;

  @IsOptional()
  @IsInt()
  @Min(1)
  baseVersion?: number | null;
}

export class WorkspaceDeleteOpDto {
  @IsString()
  @Matches(ITEM_KEY_PATTERN)
  key!: string;

  @IsInt()
  @Min(1)
  baseVersion!: number;
}

export class ApplyWorkspaceBatchDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_BATCH_OPS)
  @ValidateNested({ each: true })
  @Type(() => WorkspaceUpsertOpDto)
  upserts?: WorkspaceUpsertOpDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_BATCH_OPS)
  @ValidateNested({ each: true })
  @Type(() => WorkspaceDeleteOpDto)
  deletes?: WorkspaceDeleteOpDto[];
}
