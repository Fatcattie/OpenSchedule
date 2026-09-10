/**
 * CommonModule：基建层全局装配（@Global）。
 * - PrismaService（租户过滤扩展，工程决策 1）、TenantContextService（AsyncLocalStorage 请求上下文）；
 * - AuditService（append-only 审计写入，业务模块统一 import 自 common/audit/audit.service）；
 * - AuthUserLoader（user_roles × roles 实时展开）、JwtService（全局注册，AuthService/JwtAuthGuard 共用）；
 * - APP_GUARD → JwtAuthGuard（全局认证 + 租户上下文绑定，@Public() 跳过）；
 * - APP_INTERCEPTOR → IdempotencyInterceptor（§3.1 幂等：Idempotency-Key 24h 去重）；
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
import { RequestIdMiddleware } from './middleware/request-id.middleware';
import { TenantFilterMiddleware } from './middleware/tenant-filter.middleware';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './redis/redis.service';
import { TenantContextService } from './tenant/tenant-context.service';

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
  controllers: [HealthController],
  providers: [
    TenantContextService,
    PrismaService,
    RedisService,
    AuditService,
    AuthUserLoader,
    JwtAuthGuard,
    IdempotencyInterceptor,
    // 全局守卫：所有路由默认要求登录（@Public() 例外）
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // 全局拦截器：写操作 Idempotency-Key 幂等（§3.1）
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
  exports: [TenantContextService, PrismaService, RedisService, AuditService, AuthUserLoader, JwtModule],
})
export class CommonModule implements NestModule {
  /** 中间件顺序：RequestIdMiddleware（生成/透传 requestId）→ TenantFilterMiddleware（打开 ALS 上下文） */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, TenantFilterMiddleware).forRoutes('*');
  }
}