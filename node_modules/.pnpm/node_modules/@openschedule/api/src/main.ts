/**
 * 服务入口：全局前缀 /api/v1、ValidationPipe、CORS、异常过滤器装配。
 * DDL 变更唯一路径 = 版本化迁移（§3.1）：迁移由发布/开发命令显式执行，应用启动不执行任何 DDL。
 * 生产 APP_ENV=production 缺必需密钥/不安全配置时 fail-fast 拒绝启动（§7.3，startup-guard）。
 */
import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { SecurityHeadersMiddleware } from './common/middleware/security-headers.middleware';
import { initDefaultMetrics } from './common/observability/metrics';
import { AppLogger } from './common/observability/pino-logger';
import { initSentry, isSentryEnabled } from './common/observability/sentry';
import { checkProductionStartup } from './common/startup/startup-guard';

async function bootstrap(): Promise<void> {
  // R9：错误上报（Sentry Envelope）尽早初始化；SENTRY_DSN 为空则完全 no-op
  initSentry(process.env);
  // rawBody：AI 回调 HMAC 验签需要原始请求体字节（§3.3 / R4）
  // bufferLogs：先把启动期日志缓冲，`app.useLogger(AppLogger)` 后统一以 pino JSON 输出（R9）
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, rawBody: true });
  // 结构化日志接管框架日志（Bootstrap/路由映射/Nest 警告均落 JSON）
  app.useLogger(app.get(AppLogger));
  // JSON 请求体上限（默认 100kb）：工作台批量写（D-07）条目可内嵌 base64 说明图片，单条目 2MB、整批 8MB
  app.useBodyParser('json', { limit: '8mb' });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // 统一前缀（§3.5：统一前缀 /api/v1；controller 内路径不带前缀）；/health、/health/ready 排除在外（docker-compose HEALTHCHECK 探根路径，§3.4 分层探针）；
  // /metrics 亦排除（部署侧 Prometheus 抓取器直接访问 /metrics，R9）
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready', 'metrics'] });

  // CORS（§3.7 CORS_ORIGINS 逗号分隔白名单；开发默认 http://localhost:5173）
  const origins = (config.get<string>('CORS_ORIGINS') ?? 'http://localhost:5173')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true, methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS' });

  // 全局参数校验（§3.1：400x 校验失败；whitelist 剔除未声明字段）
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 剔除 DTO 未声明的字段（防注入）
      transform: true, // 自动类型转换（@Type 显式声明处生效）
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // 全局异常过滤器（统一错误信封 {code,message,details,traceId,requestId}，§3.1；分段码 400x/401x/403x/404x/409x/429x/502/503）
  app.useGlobalFilters(new AllExceptionsFilter());

  // 生产启动阻断（§7.3）：缺密钥/change-me/不安全 CORS → 报出变量名并拒绝启动
  if (config.get<string>('APP_ENV') === 'production') {
    const result = checkProductionStartup(config, logger);
    if (!result.ok) {
      process.exit(1);
    }
  }

  app.enableShutdownHooks();

  // R9：注册 Node 运行时默认指标（事件循环/GC/句柄/内存），/metrics 首次抓取前亦可就绪
  initDefaultMetrics();

  logger.log(
    `错误上报（Sentry）：${isSentryEnabled() ? '已启用（SENTRY_DSN 已配置）' : '未配置（SENTRY_DSN 为空，no-op）'}`,
  );

  const port = config.get<number>('APP_PORT') ?? 3000;
  await app.listen(port);
  logger.log(`OpenSchedule API 已启动：http://localhost:${port}/api/v1（环境 ${config.get<string>('APP_ENV') ?? 'development'}）`);
}

void bootstrap();
