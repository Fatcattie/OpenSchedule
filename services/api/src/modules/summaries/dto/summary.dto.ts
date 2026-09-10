/**
 * 个人完成总结 DTO（A6：任务级自动摘要 + 周级手动触发；Phase 1 收尾端点 /me/summaries）。
 */
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';

/** 总结周期：week=最近 7 天，month=最近 30 天（滚动窗口，Phase 1 口径） */
export enum SummaryPeriod {
  WEEK = 'week',
  MONTH = 'month',
}

/** GET /me/summaries 查询 DTO */
export class SummaryQueryDto {
  /** 总结周期：默认 week */
  @IsOptional()
  @IsEnum(SummaryPeriod)
  period: SummaryPeriod = SummaryPeriod.WEEK;
}

/** POST /me/summaries 保存 DTO（手动编辑保存总结草稿） */
export class SaveSummaryDto {
  /** 总结周期 */
  @IsEnum(SummaryPeriod)
  period!: SummaryPeriod;

  /** 总结内容：1–20000 字符 */
  @IsString()
  @Length(1, 20000)
  content!: string;
}
