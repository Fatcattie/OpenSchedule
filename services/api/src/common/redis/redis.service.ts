/**
 * RedisService：Redis 客户端封装（§3.7 Redis 组：BullMQ 队列 + zset 延迟提醒 + WS 广播 + 生产态幂等/refresh 吊销）。
 * Phase 1 提供懒连接 getClient()（node-redis v4.7+，自带类型）；
 * 不可用时 getClient() 抛错——调用方（reminders 等）已按"Redis 宕机降级 DB 兜底扫描"策略容错（工程决策 4）。
 * TODO(Phase 2)：Redis 可用性探针 + 断线自动重连参数化（socket.reconnectStrategy 默认重试）。
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

/** createClient 返回带内置模块泛型的客户端类型（裸 RedisClientType 与其实例不匹配，Prisma/redis 类型坑） */
type RedisClient = ReturnType<typeof createClient>;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly url: string;
  private readonly prefix: string;
  private client: RedisClient | null = null;
  private connecting: Promise<RedisClient> | null = null;

  constructor(private readonly config: ConfigService) {
    this.url = this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379/0';
    this.prefix = this.config.get<string>('REDIS_PREFIX') ?? 'os:';
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
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      const client = createClient({ url: this.url });
      client.on('error', err => this.logger.warn(`Redis 连接错误：${err.message}`));
      await client.connect();
      this.client = client;
      this.logger.log(`Redis 已连接：${this.url.replace(/\/\/.*@/, '//***@')}`);
      return client;
    })();

    try {
      return await this.connecting;
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