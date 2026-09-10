/**
 * 项目模块装配（§2 §3 模块划分：projects ★Phase 1）。
 * 注：模块间只经 service 层交互；本项目模块不依赖其他业务模块。
 */
import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
