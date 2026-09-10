/**
 * AuditModule：审计模块（§3.1 审计约定 + §3.5.1 GET /audit-logs）。
 * AuditService（append-only 写入）在 CommonModule（@Global）提供，业务模块直接注入；
 * 本模块提供 AuditQueryService（审计查询：租户 Admin 全量 / 项目负责人本项目，§3.4）。
 */
import { Module } from '@nestjs/common';
import { AuditQueryService } from './audit-query.service';

@Module({
  providers: [AuditQueryService],
  exports: [AuditQueryService],
})
export class AuditModule {}