/**
 * 承接控制器（§3.5.1：POST /tasks/:id/claim、POST /tasks/:id/transfer；与 tasks 控制器同前缀不同路径，无冲突）。
 */
import { Body, Controller, Param, Post } from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import { AuthUser, CurrentUser } from './current-user.decorator';
import { ClaimTaskDto } from './dto/claim-task.dto';
import { TransferTaskDto } from './dto/transfer-task.dto';

@Controller('tasks')
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  /** POST /api/v1/tasks/:id/claim 领取（先到先得 A5；T1 迁移） */
  @Post(':id/claim')
  claim(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ClaimTaskDto) {
    return this.assignments.claim(id, user, dto);
  }

  /** POST /api/v1/tasks/:id/transfer 转移（免审批但审计 A5 默认） */
  @Post(':id/transfer')
  transfer(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TransferTaskDto) {
    return this.assignments.transfer(id, user, dto);
  }
}
