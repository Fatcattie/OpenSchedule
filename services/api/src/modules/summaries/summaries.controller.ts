/**
 * 总结控制器（A6 完成总结粒度：GET /me/summaries 聚合 + POST /me/summaries 手动保存草稿）。
 * 个人端点，仅限当前用户自己数据（userId + tenantId 双谓词，防跨用户访问）。
 */
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { SaveSummaryDto, SummaryQueryDto } from './dto/summary.dto';
import { SummariesService } from './summaries.service';

@Controller()
export class SummariesController {
  constructor(private readonly summaries: SummariesService) {}

  /** GET /api/v1/me/summaries?period=week 个人完成总结（聚合统计 + 延期清单 + 已保存草稿） */
  @Get('me/summaries')
  getSummary(@CurrentUser() user: AuthUser, @Query() query: SummaryQueryDto) {
    return this.summaries.getSummary(user, query.period);
  }

  /** POST /api/v1/me/summaries {period, content} 手动编辑保存总结草稿 */
  @Post('me/summaries')
  saveSummary(@CurrentUser() user: AuthUser, @Body() dto: SaveSummaryDto) {
    return this.summaries.saveSummary(user, dto);
  }
}