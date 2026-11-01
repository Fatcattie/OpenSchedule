/**
 * 生产启动阻断检查（§7.3：APP_ENV=production 时缺密钥/不安全配置必须 fail-fast，报出变量名）。
 * 仅 production 生效；dev/staging 保持宽松（compose 默认值可用）。
 * 原则：缺失项在启动阶段报出并拒绝启动，不留到运行期炸（§3.3 凭据治理）。
 */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** 生产必需密钥：缺失即拒绝启动 */
const PRODUCTION_REQUIRED_ENV: readonly (readonly [string, string])[] = [
  ['DATABASE_URL', '数据库连接串'],
  ['JWT_ACCESS_SECRET', 'JWT access 签名密钥'],
  ['JWT_REFRESH_SECRET', 'JWT refresh 签名密钥'],
  ['ENCRYPTION_KEY', '集成凭据 AES-256 加密密钥（CalendarAccount/Webhook 密文存储依赖）'],
  ['AI_SERVICE_TOKEN', 'AI 服务互信 token（/internal/ai/results 回调鉴权）'],
];

/** 启动即拒绝的占位值（防 change-me 进生产，§7.3） */
const PLACEHOLDER_PREFIXES: readonly string[] = ['change-me'];

export interface ProductionStartupCheckResult {
  ok: boolean;
  /** 缺失/不合规的变量名（对外报出，不含值） */
  failures: string[];
}

/**
 * 校验生产启动条件。失败返回具体变量名，调用方以退出码 1 终止进程（不接流量）。
 * 安全约束：报告只含变量名与原因，绝不回显变量值。
 */
export function checkProductionStartup(config: ConfigService, logger: Logger): ProductionStartupCheckResult {
  const failures: string[] = [];

  for (const [name] of PRODUCTION_REQUIRED_ENV) {
    const value = (config.get<string>(name) ?? '').trim();
    if (!value) {
      failures.push(`missing:${name}`);
      continue;
    }
    if (PLACEHOLDER_PREFIXES.some((prefix) => value.startsWith(prefix))) {
      failures.push(`placeholder:${name}`);
    }
  }

  // 生产禁止应用启动时改 DDL（迁移由发布流水线单独执行 prisma migrate deploy，§3.1）
  if (config.get<string>('DB_AUTO_MIGRATE') === 'true') {
    failures.push('db-auto-migrate-in-production');
  }

  // 生产 CORS 白名单必须为具体域名（拒绝 * 与默认本地源，§3.3 收敛 CORS）
  const cors = (config.get<string>('CORS_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (cors.length === 0 || cors.includes('*')) {
    failures.push('cors-not-restricted');
  }

  if (failures.length > 0) {
    logger.error(`生产启动阻断（fail-fast，§7.3）：${failures.join(', ')}`);
  }
  return { ok: failures.length === 0, failures };
}
