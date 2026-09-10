/**
 * proposals.controller.ts —— AI 建议控制器
 */
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common'
import { JwtAuthGuard } from '../../common/auth/auth.guard'
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator'
import { ProposalsService } from './proposals.service'
import { DecomposeDto, RejectProposalDto } from './dto/proposals.dto'
import { AiCallbackDto } from './dto/ai-callback.dto'
import { Public } from '../../common/auth/public.decorator'
import { ConfigService } from '@nestjs/config'
import { ApiException } from '../../common/exceptions/api.exception'
import { Request } from 'express'

@Controller()
@UseGuards(JwtAuthGuard)
export class ProposalsController {
  constructor(private readonly proposals: ProposalsService, private readonly config: ConfigService) {}

  @Public()
  @Post('internal/ai/results')
  async aiResult(@Body() body: AiCallbackDto, @Req() req: Request) {
    const expected = this.config.get<string>('AI_SERVICE_TOKEN')
    const authorization = req.headers.authorization ?? ''
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
    if (!expected || token !== expected) throw new ApiException(40101, 'AI 服务令牌无效', 401)
    return this.proposals.handleAiCallback(body)
  }

  // ============ 拆解建议 ============

  @Post('proposals/decompose')
  async decompose(@CurrentUser() user: AuthUser, @Body() dto: DecomposeDto) {
    return this.proposals.createDecompose(user, dto)
  }

  // ============ 列表 / 详情 ============

  @Get('proposals')
  async list(
    @CurrentUser() user: AuthUser,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.proposals.list(user, {
      type,
      status,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    })
  }

  @Get('proposals/:id')
  async getDetail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.proposals.getDetail(id, user)
  }

  // ============ 应用 / 拒绝 ============

  @Post('proposals/:id/apply')
  async apply(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.proposals.apply(id, user)
  }

  @Post('proposals/:id/reject')
  async reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectProposalDto,
  ) {
    return this.proposals.reject(id, user, dto.reason)
  }
}
