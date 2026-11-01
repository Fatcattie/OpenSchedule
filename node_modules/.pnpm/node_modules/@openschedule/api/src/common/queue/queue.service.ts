/**
 * QueueService：BullMQ 队列/worker 封装（§3.4 后台任务队列化 / R3 可靠性骨架）。
 * - 仅当配置了 REDIS_URL 时启用；Redis 不可用时相关调用返回 false/抛错，调用方降级到 DB 兜底扫描
 *   （工程决策 4：zset/DB 双保险；队列挂了提醒不丢，DB 扫描可重放）。
 * - repeatable job 承担「周期任务主路径」，原 setInterval worker 保留为 DB 兜底（双保险）。
 * - 队列连接使用 BullMQ 内置 ioredis（url=REDIS_URL），与 RedisService 的 node-redis 客户端相互独立。
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly redisUrl: string | undefined;
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Map<string, Worker>();

  constructor(config: ConfigService) {
    this.redisUrl = config.get<string>('REDIS_URL') ?? undefined;
  }

  /** BullMQ 是否可用（有 REDIS_URL 即可；实际连接失败由调用方 try/catch 降级） */
  get enabled(): boolean {
    return Boolean(this.redisUrl);
  }

  /** 取（或惰性创建）具名队列；未配置 Redis 返回 null */
  queue(name: string): Queue | null {
    if (!this.redisUrl) return null;
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, { connection: { url: this.redisUrl } });
      this.queues.set(name, q);
    }
    return q;
  }

  /** 注册周期 job（repeatable）；同一 queue+name+间隔 重复注册幂等返回 false */
  async addRepeatable(queueName: string, jobName: string, payload: Record<string, unknown>, intervalMs: number): Promise<boolean> {
    const q = this.queue(queueName);
    if (!q) return false;
    try {
      await q.add(jobName, payload, {
        repeat: { every: intervalMs },
        removeOnComplete: true,
        removeOnFail: 100,
      });
      return true;
    } catch (err) {
      this.logger.warn(`BullMQ repeatable 注册失败 queue=${queueName} job=${jobName}（降级 DB 兜底扫描）: ${(err as Error).message}`);
      return false;
    }
  }

  /** 启动 worker 消费指定队列；同队列重复启动返回 false（防双 worker 竞争） */
  async startWorker(queueName: string, processJob: (job: Job) => Promise<void>): Promise<boolean> {
    if (!this.redisUrl || this.workers.has(queueName)) return false;
    const worker = new Worker(
      queueName,
      async (job) => {
        await processJob(job);
      },
      { connection: { url: this.redisUrl } },
    );
    worker.on('failed', (job, err) => this.logger.warn(`worker ${queueName} job ${job?.name ?? '?'} 失败: ${err.message}`));
    worker.on('error', (err) => this.logger.warn(`worker ${queueName} 连接错误: ${err.message}`));
    this.workers.set(queueName, worker);
    this.logger.log(`BullMQ worker 已启动：queue=${queueName}`);
    return true;
  }

  async onModuleDestroy(): Promise<void> {
    for (const w of this.workers.values()) await w.close().catch(() => undefined);
    for (const q of this.queues.values()) await q.close().catch(() => undefined);
  }
}
