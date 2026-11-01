/**
 * CommonModule：基建层全局装配（@Global）。
 * - PrismaService（租户过滤扩展，工程决策 1）、TenantContextService（AsyncLocalStorage 请求上下文）；
 * - AuditService（append-only 审计写入，业务模块统一 import 自 common/audit/audit.service）；
 * - AuthUserLoader（user_roles × roles 实时展开）、JwtService（全局注册，AuthService/JwtAuthGuard 共用）；
 * - APP_GUARD → JwtAuthGuard（全局认证 + 租户上下文绑定，@Public() 跳过）；
 * - APP_INTERCEPTOR → IdempotencyInterceptor（§3.1 幂等：Idempotency-Key 24h 去重）；
 * - QueueService（BullMQ 队列/worker 封装，§3.4 后台任务队列化；REDIS_URL 缺失时自动降级）；
 * - 中间件：RequestIdMiddleware → TenantFilterMiddleware（forRoutes('*')，先溯源后开租户上下文）；
 * - HealthController（/health，docker-compose HEALTHCHECK 探活）。
 */
import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { AuditService } from './audit/audit.service';
import { AuthUserLoader } from './auth/auth-user.loader';
import { JwtAuthGuard } from './auth/auth.guard';
import { HealthController } from './health/health.controller';
import { IdempotencyInterceptor } from './interceptors/idempotency.interceptor';
import { HttpObservabilityMiddleware } from './middleware/http-observability.middleware';
import { RequestIdMiddleware } from './middleware/request-id.middleware';
import { SecurityHeadersMiddleware } from './middleware/security-headers.middleware';
import { TenantFilterMiddleware } from './middleware/tenant-filter.middleware';
import { MetricsController } from './observability/metrics.controller';
import { AppLogger, PINO_LOGGER, obsLogger } from './observability/pino-logger';
import { PrismaService } from './prisma/prisma.service';
import { OutboxService } from './outbox/outbox.service';
import { OutboxDispatcher } from './outbox/outbox.dispatcher';
import { QueueService } from './queue/queue.service';
import { RateLimitGuard } from './rate-limit/rate-limit.guard';
import { RateLimitService } from './rate-limit/rate-limit.service';
import { CredentialCipher } from './security/credential-cipher';
import { RedisService } from './redis/redis.service';
import { TenantContextService } from './tenant/tenant-context.service';
import { WsGateway } from './ws/ws.gateway';

@Global()
@Module({
  imports: [
    // JwtModule 全局注册：sign/verify 均按 token 类型显式传 secret（access/refresh 分离，§3.7）
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.get<string>('JWT_ACCESS_SECRET'),
        // expiresIn 需 ms.StringValue 字面量类型（环境变量为 string，运行时由 ms 解析，此处类型断言）
        signOptions: { expiresIn: (config.get<string>('JWT_ACCESS_TTL') ?? '15m') as `${number}${'s' | 'm' | 'h' | 'd' | 'w' | 'y'}` },
      }),
    }),
  ],
  controllers: [HealthController, MetricsController],
  providers: [
    TenantContextService,
    PrismaService,
    RedisService,
    QueueService,
    OutboxService,
    // Outbox 分发器（BullMQ repeatable 主路径 + DB 兜底扫描，随 app bootstrap 启动一次，§3.4 / R3）
    OutboxDispatcher,
    AuditService,
    AuthUserLoader,
    JwtAuthGuard,
    RateLimitService,
    RateLimitGuard,
    // R6-4：WS 实时刷新网关（socket.io，房间=tenantId；握手鉴权复用 Bearer access token + AuthUserLoader，§3.2 / §3.3）
    WsGateway,
    // R4 凭据列内加密（§3.3）：Webhook.secret / CalendarAccount token 密文落库；@Global 供业务模块注入
    CredentialCipher,
    IdempotencyInterceptor,
    // R9 可观测性：进程级 pino 单例（显式 token 注入）+ Nest LoggerService 适配（main.ts `app.useLogger`）
    { provide: PINO_LOGGER, useFactory: () => obsLogger() },
    AppLogger,
    // 全局守卫：所有路由默认要求登录（@Public() 例外）
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // 全局守卫：限流（§3.3 / R4）。必须在 JwtAuthGuard 之后注册（tenant_ip 分档依赖 req.user）
    { provide: APP_GUARD, useClass: RateLimitGuard },
    // 全局拦截器：写操作 Idempotency-Key 幂等（§3.1）
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
  exports: [TenantContextService, PrismaService, RedisService, QueueService, OutboxService, AuditService, AuthUserLoader, JwtModule, RateLimitService, CredentialCipher],
})
export class CommonModule implements NestModule {
  /** 中间件顺序：RequestIdMiddleware（生成/透传 requestId）→ HttpObservabilityMiddleware（访问日志 + RED 指标，
   *  需 requestId 已就绪）→ SecurityHeadersMiddleware（安全响应头，§3.3 / R4）→ TenantFilterMiddleware（打开 ALS 上下文）。 */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware, HttpObservabilityMiddleware, SecurityHeadersMiddleware, TenantFilterMiddleware)
      .forRoutes('*');
  }
}