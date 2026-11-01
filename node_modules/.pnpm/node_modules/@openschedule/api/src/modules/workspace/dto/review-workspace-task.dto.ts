/**
 * 工作台任务审核命令 DTO（D-07 二期：POST /workspace/tasks/:taskId/review）。
 * approve/reject 仅管理（owner/admin）；withdraw 允许提报人本人或管理；opinion=other 时 reason 必填。
 */
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewWorkspaceTaskDto {
  @IsIn(['approve', 'reject', 'withdraw'])
  action!: 'approve' | 'reject' | 'withdraw';

  @IsIn(['agree', 'reject', 'rework', 'other'])
  opinion!: 'agree' | 'reject' | 'rework' | 'other';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
