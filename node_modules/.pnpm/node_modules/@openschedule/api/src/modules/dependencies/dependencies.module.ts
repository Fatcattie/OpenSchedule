/**
 * 依赖模块装配（B15：依赖 CRUD + CPM 计划计算）。
 * 纯模块，不依赖其他业务模块；CPM 算法为纯函数，不注入服务。
 */
import { Module } from '@nestjs/common';
import { DependenciesController } from './dependencies.controller';
import { DependenciesService } from './dependencies.service';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [TasksModule],
  controllers: [DependenciesController],
  providers: [DependenciesService],
  exports: [DependenciesService],
})
export class DependenciesModule {}
