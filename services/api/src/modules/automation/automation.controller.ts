/**
 * automation.controller.ts —— 自动化规则控制器（B20）
 */
import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards } from '@nestjs/common'
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator'
import { AutomationService } from './automation.service'
import { CreateRuleDto, UpdateRuleDto, ListRulesQueryDto, ToggleRuleDto } from './dto/automation.dto'

@Controller('automation')
export class AutomationController {
  constructor(private automationService: AutomationService) {}

  /** GET /automation/rules?projectId=&triggerType=&isEnabled= */
  @Get('rules')
  async listRules(
    @CurrentUser() user: AuthUser,
    @Query() query: ListRulesQueryDto,
  ) {
    return this.automationService.listRules(user, {
      projectId: query.projectId,
      triggerType: query.triggerType,
      isEnabled: query.isEnabled,
    })
  }

  /** GET /automation/rules/:id */
  @Get('rules/:id')
  async getRule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.automationService.getRule(id, user)
  }

  /** POST /automation/rules */
  @Post('rules')
  async createRule(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateRuleDto,
  ) {
    return this.automationService.createRule(user, body)
  }

  /** PUT /automation/rules/:id */
  @Put('rules/:id')
  async updateRule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateRuleDto,
  ) {
    return this.automationService.updateRule(id, user, body)
  }

  /** DELETE /automation/rules/:id */
  @Delete('rules/:id')
  async deleteRule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.automationService.deleteRule(id, user)
  }

  /** POST /automation/rules/:id/toggle（启停） */
  @Post('rules/:id/toggle')
  async toggleRule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: ToggleRuleDto,
  ) {
    return this.automationService.toggleRule(id, user, body.isEnabled)
  }

  /** POST /automation/rules/:id/trigger（手动触发测试） */
  @Post('rules/:id/trigger')
  async triggerRule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body('taskId') taskId: string,
  ) {
    return this.automationService.triggerRule(id, user, taskId)
  }

  /** GET /automation/templates（预设模板列表） */
  @Get('templates')
  listTemplates() {
    return this.automationService.listTemplates()
  }

  /** POST /automation/scan/overdue（手动触发逾期扫描，测试用） */
  @Post('scan/overdue')
  async scanOverdue(
    @CurrentUser() user: AuthUser,
    @Body('projectId') projectId?: string,
  ) {
    return this.automationService.scanOverdue(user, projectId)
  }
}
