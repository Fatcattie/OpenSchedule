/**
 * llm.controller.ts —— 租户 AI 模型配置（管理员）+ AI 状态 / 文本生成（成员）
 */
import { Body, Controller, Delete, Get, Post, Put, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../../common/auth/auth.guard'
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator'
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator'
import { LlmConfigService } from './llm-config.service'
import { AiCompleteDto, SaveLlmConfigDto, TestLlmConfigDto } from './dto/llm.dto'

@Controller()
@UseGuards(JwtAuthGuard)
export class LlmController {
  constructor(private readonly llm: LlmConfigService) {}

  /** GET /settings/llm/providers —— 厂商预设（地址 + 推荐模型） */
  @Get('settings/llm/providers')
  providers() {
    return this.llm.listProviders()
  }

  /** GET /settings/llm —— 当前配置（仅管理员；key 只返回末 4 位） */
  @Get('settings/llm')
  get(@CurrentUser() user: AuthUser) {
    return this.llm.getConfig(user)
  }

  /** PUT /settings/llm —— 保存配置（apiKey 留空 = 保留原 key） */
  @Put('settings/llm')
  save(@CurrentUser() user: AuthUser, @Body() dto: SaveLlmConfigDto) {
    return this.llm.saveConfig(user, dto)
  }

  /** DELETE /settings/llm —— 清除配置（AI 功能回落本地规则引擎） */
  @Delete('settings/llm')
  remove(@CurrentUser() user: AuthUser) {
    return this.llm.removeConfig(user)
  }

  /** POST /settings/llm/test —— 测试连接（每分钟 10 次，防刷厂商额度） */
  @Post('settings/llm/test')
  @RateLimit({ limit: 10, windowMs: 60_000, keyBy: 'tenant_ip' })
  test(@CurrentUser() user: AuthUser, @Body() dto: TestLlmConfigDto) {
    return this.llm.testConfig(user, dto)
  }

  /** GET /ai/status —— 是否已接入真实模型（全体成员可见，不含 key） */
  @Get('ai/status')
  status(@CurrentUser() user: AuthUser) {
    return this.llm.getStatus(user)
  }

  /** POST /ai/complete —— 文本生成（AI 规则页 / 智能协助；key 不出服务端） */
  @Post('ai/complete')
  @RateLimit({ limit: 30, windowMs: 60_000, keyBy: 'tenant_ip' })
  complete(@CurrentUser() user: AuthUser, @Body() dto: AiCompleteDto) {
    return this.llm.complete(user, dto)
  }
}
