/**
 * 报表控制器（§4.3 Phase 2 B16：/reports 聚合 API）。
 * GET /reports/projects/:projectId/gantt     甘特数据
 * GET /reports/projects/:projectId/burndown  燃尽图
 * GET /reports/load                          成员负载热力图
 */
import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { BurndownQueryDto } from './dto/burndown-query.dto';
import { ExportQueryDto } from './dto/export-query.dto';
import { GanttQueryDto } from './dto/gantt-query.dto';
import { LoadQueryDto } from './dto/load-query.dto';
import { WeeklyReportDto } from './dto/weekly-report.dto';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /** GET /api/v1/reports/projects/:projectId/gantt */
  @Get('projects/:projectId/gantt')
  async getGantt(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Query() query: GanttQueryDto,
  ) {
    return this.reportsService.getGantt(projectId, user, query.assigneeId);
  }

  /** GET /api/v1/reports/projects/:projectId/burndown?days=14 */
  @Get('projects/:projectId/burndown')
  async getBurndown(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Query() query: BurndownQueryDto,
  ) {
    return this.reportsService.getBurndown(projectId, user, query.days ?? 14);
  }

  /** GET /api/v1/reports/load?projectId=&days=14 */
  @Get('load')
  async getLoad(
    @CurrentUser() user: AuthUser,
    @Query() query: LoadQueryDto,
  ) {
    return this.reportsService.getLoad(user, query.projectId, query.days);
  }

  // ===================== B18 周报 + 仪表盘 + 导出 =====================

  /** POST /api/v1/reports/projects/:projectId/weekly-report（确定性模板生成） */
  @Post('projects/:projectId/weekly-report')
  async generateWeeklyReport(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Body() body: WeeklyReportDto,
  ) {
    return this.reportsService.generateWeeklyReport(projectId, user, body.weekStart);
  }

  /** GET /api/v1/reports/projects/:projectId/weekly-reports?limit=10（回溯生成） */
  @Get('projects/:projectId/weekly-reports')
  async listWeeklyReports(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Query('limit') limit?: string | number,
  ) {
    const n = typeof limit === 'string' ? parseInt(limit, 10) : (limit ?? 10);
    return this.reportsService.listWeeklyReports(projectId, user, Number.isFinite(n as number) ? Math.min(Math.max(n as number, 1), 52) : 10);
  }

  /** GET /api/v1/reports/projects/:projectId/dashboard（项目仪表盘聚合） */
  @Get('projects/:projectId/dashboard')
  async getDashboard(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
  ) {
    return this.reportsService.getDashboard(projectId, user);
  }

  /** GET /api/v1/reports/projects/:projectId/export?format=csv（CSV 导出流） */
  @Get('projects/:projectId/export')
  async exportCsv(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Query() query: ExportQueryDto,
    @Res() res: Response,
  ) {
    await this.reportsService.exportCsv(projectId, user, query.format, res);
  }

  // ========== B19 重叠检测 ==========

  /** GET /api/v1/reports/projects/:projectId/overlap（重叠检测聚合） */
  @Get('projects/:projectId/overlap')
  async getOverlap(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Query('dimensions') dimensions?: string,
    @Query('threshold') threshold?: string,
  ) {
    const t = threshold != null ? Number(threshold) : undefined
    return this.reportsService.getOverlap(projectId, user, dimensions, t);
  }

  /** GET /api/v1/reports/projects/:projectId/overlap/time（时间冲突明细） */
  @Get('projects/:projectId/overlap/time')
  async getOverlapTime(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
  ) {
    return this.reportsService.getOverlapTime(projectId, user);
  }

  /** GET /api/v1/reports/projects/:projectId/overlap/resource（资源争抢明细） */
  @Get('projects/:projectId/overlap/resource')
  async getOverlapResource(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Query('threshold') threshold?: string,
  ) {
    const t = threshold != null ? Number(threshold) : undefined
    return this.reportsService.getOverlapResource(projectId, user, t);
  }

  /** GET /api/v1/reports/projects/:projectId/overlap/dependency（依赖交汇明细） */
  @Get('projects/:projectId/overlap/dependency')
  async getOverlapDependency(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
  ) {
    return this.reportsService.getOverlapDependency(projectId, user);
  }
}
