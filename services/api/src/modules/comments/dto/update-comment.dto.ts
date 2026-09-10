/**
 * 更新评论 DTO（§3.5.1 PATCH /comments/:id；作者本人、项目负责人、租户 Admin；内容 ≤5000 字符）。
 */
import { IsString, Length } from 'class-validator';

export class UpdateCommentDto {
  @IsString()
  @Length(1, 5000)
  content!: string;
}
