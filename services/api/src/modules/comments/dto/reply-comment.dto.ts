/**
 * 回复评论 DTO（§3.5.1 POST /comments/:id/reply 讨论串；内容 ≤5000 字符；@提及重新解析）。
 */
import { IsString, Length } from 'class-validator';

export class ReplyCommentDto {
  @IsString()
  @Length(1, 5000)
  content!: string;
}
