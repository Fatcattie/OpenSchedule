/**
 * 搜索模块装配（§2 §3：search ★Phase 1 收尾模块，只读无审计写入）。
 * PrismaService 由 CommonModule(@Global) 提供。
 */
import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}