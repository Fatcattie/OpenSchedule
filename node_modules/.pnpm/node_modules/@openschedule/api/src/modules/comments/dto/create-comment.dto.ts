/**
 * 创建评论 DTO（§3.5.1 POST /tasks/:id/comments；内容 ≤5000 字符（§3.5.5）；@提及由服务端解析，客户端传值忽略）。
 */
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @Length(1, 5000)
  content!: string;

  /** 关键决策标记（决策记录 + AI 摘要，Phase 2 AI 增强） */
  @IsOptional()
  @IsBoolean()
  isDecision?: boolean = false;
}
