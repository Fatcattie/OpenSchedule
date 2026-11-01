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
import { verifyAiSignature } from '../../common/auth/ai-callback-signature'
import { ConfigService } from '@nestjs/config'
import { ApiException } from '../../common/exceptions/api.exception'
import { Request } from 'express'

@Controller()
@UseGuards(JwtAuthGuard)
export class ProposalsController {
  constructor(private readonly proposals: ProposalsService, private readonly config: ConfigService) {}

  /**
   * AI 服务回调入口（§3.3 / R4 HMAC 双端签名）：X-AI-Timestamp + X-AI-Signature 验签（恒定时间 + 时间窗防重放）。
   * 签名契约：signature = HMAC-SHA256(AI_SERVICE_TOKEN, `${timestamp}.${rawBody}`)。AI 侧发起端签名属 R11。
   */
  @Public()
  @Post('internal/ai/results')
  async aiResult(@Body() body: AiCallbackDto, @Req() req: Request) {
    const secret = this.config.get<string>('AI_SERVICE_TOKEN') ?? ''
    if (!secret) throw new ApiException(40101, 'AI 服务互信未配置', 401)
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody
    const timestamp = req.headers['x-ai-timestamp']
    const signature = req.headers['x-ai-signature']
    const tokenStr = Array.isArray(timestamp) ? timestamp[0] : timestamp
    const sigStr = Array.isArray(signature) ? signature[0] : signature
    const error = verifyAiSignature(secret, rawBody ?? JSON.stringify(body), tokenStr, sigStr)
    if (error) throw new ApiException(40101, error, 401)
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
