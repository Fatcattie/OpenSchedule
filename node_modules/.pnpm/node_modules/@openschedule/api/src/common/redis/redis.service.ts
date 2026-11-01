/**
 * RedisService：Redis 客户端封装（§3.7 Redis 组：BullMQ 队列 + zset 延迟提醒 + WS 广播 + 生产态幂等/refresh 吊销）。
 * Phase 1 提供懒连接 getClient()（node-redis v4.7+，自带类型）；
 * 不可用时 getClient() 抛错——调用方（reminders 等）已按"Redis 宕机降级 DB 兜底扫描"策略容错（工程决策 4）。
 * 快速失败语义：node-redis 默认 reconnectStrategy 无限重试会导致 connect() 永不 settle，
 * 于是每个 HTTP 请求（全局 RateLimitGuard）都会挂死；这里改为「有界重连 + 冷却窗口」，
 * 使 Redis 宕机时 getClient() 在有限时间内 reject，调用方走既定的降级分支（限流进程内 Map / reminders DB 兜底扫描）。
 * 可调参数：REDIS_CONNECT_TIMEOUT_MS（套接字连接超时）、REDIS_CONNECT_MAX_RETRIES（重连上限）、REDIS_RETRY_COOLDOWN_MS（失败后冷却）。
 * R9：进入降级冷却时递增 `openschedule_system_events_total{event="redis_degraded"}`（每次冷却窗口至多一次，可告警）。
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import { recordSystemEvent } from '../observability/metrics';

/** createClient 返回带内置模块泛型的客户端类型（裸 RedisClientType 与其实例不匹配，Prisma/redis 类型坑） */
type RedisClient = ReturnType<typeof createClient>;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly url: string;
  private readonly prefix: string;
  private client: RedisClient | null = null;
  private connecting: Promise<RedisClient> | null = null;
  /** 连接失败的冷却截止时间戳：冷却期内 getClient() 立即抛错，避免每个请求都触发重连风暴 */
  private cooldownUntil = 0;
  private readonly connectTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryCooldownMs: number;

  constructor(private readonly config: ConfigService) {
    this.url = this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379/0';
    this.prefix = this.config.get<string>('REDIS_PREFIX') ?? 'os:';
    this.connectTimeoutMs = this.readNonNegativeInt('REDIS_CONNECT_TIMEOUT_MS', 2000);
    this.maxRetries = this.readNonNegativeInt('REDIS_CONNECT_MAX_RETRIES', 2);
    this.retryCooldownMs = this.readNonNegativeInt('REDIS_RETRY_COOLDOWN_MS', 15_000);
  }

  private readNonNegativeInt(key: string, fallback: number): number {
    const raw = Number(this.config.get<string | number>(key));
    return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
  }

  /** key 前缀（多环境隔离：REDIS_PREFIX，§3.7） */
  key(name: string): string {
    return `${this.prefix}${name}`;
  }

  /**
   * 获取客户端（懒连接 + 并发去重）。Redis 不可用时抛错，由调用方降级处理。
   */
  async getClient(): Promise<RedisClient> {
    if (this.client?.isOpen) return this.client;
    if (Date.now() < this.cooldownUntil) {
      throw new Error(`Redis 降级冷却中（${this.retryCooldownMs}ms 内不重连）`);
    }
    if (this.connecting) return this.connecting;

    const attempt = (async () => {
      const client = createClient({
        url: this.url,
        socket: {
          connectTimeout: this.connectTimeoutMs,
          // 有界重连：超过 maxRetries 返回 Error → connect() reject（默认无限重试会挂起调用方）
          reconnectStrategy: retries =>
            retries >= this.maxRetries ? new Error('Redis 重连次数超限') : Math.min(retries * 200, 1000),
        },
      });
      client.on('error', err => this.logger.warn(`Redis 连接错误：${err.message}`));
      try {
        await client.connect();
      } catch (err) {
        // 释放失败客户端并进入冷却窗口：调用方走降级分支（限流 Map / DB 兜底扫描），不再逐请求阻塞
        try {
          await client.disconnect();
        } catch {
          // 连接未建立时 disconnect 可能再次抛错，忽略
        }
        this.cooldownUntil = Date.now() + this.retryCooldownMs;
        // R9：降级事件计数（每次冷却窗口至多一次；供 /metrics 告警 `redis_degraded`）
        recordSystemEvent('redis_degraded');
        this.logger.warn(`Redis 不可用，进入 ${this.retryCooldownMs}ms 降级冷却：${(err as Error).message}`);
        throw err;
      }
      this.client = client;
      this.cooldownUntil = 0;
      this.logger.log(`Redis 已连接：${this.url.replace(/\/\/.*@/, '//***@')}`);
      return client;
    })();

    this.connecting = attempt;
    try {
      return await attempt;
    } finally {
      this.connecting = null;
    }
  }

  /** 显式断开（服务关闭钩子） */
  async onModuleDestroy(): Promise<void> {
    if (this.client?.isOpen) {
      await this.client.quit().catch(() => undefined);
      this.client = null;
    }
  }
}