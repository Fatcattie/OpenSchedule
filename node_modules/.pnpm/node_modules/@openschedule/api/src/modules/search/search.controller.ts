/**
 * 搜索控制器（§3.5.1 搜索/审计/报表域：GET /search?q=&type= 全局搜索）。
 */
import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchService } from './search.service';

@Controller()
export class SearchController {
  constructor(private readonly search: SearchService) {}

  /** GET /api/v1/search?q=&type=&page=&pageSize= 全局搜索（任务/项目/评论，租户隔离） */
  @Get('search')
  async globalSearch(@CurrentUser() user: AuthUser, @Query() query: SearchQueryDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.search.search(user, query);
    res.setHeader('X-Total-Count', String(result.meta.total));
    return result;
  }
}