/**
 * PushAdapter 真实投递集成测试（R5-3 / D-11）：
 * 本地 HTTPS 服务器（自签 localhost 证书，test/fixtures）充当推送服务端点，
 * web-push 真实加密（aes128gcm + VAPID JWT）后经 TLS 出站 POST； * 404/410 死订阅清理；未配置 VAPID / 无订阅的失败语义。 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createECDH, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as https from 'node:https';
import type { Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import * as webpush from 'web-push';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { OutboundNotification } from './notification-adapter.interface';
import { PushAdapter } from './push.adapter';

vi.setConfig({ testTimeout: 15_000 });

const TLS_FIXTURES = join(__dirname, '../../../..', 'test/fixtures');

interface CapturedPush {
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function makeSubscriptionKeys(): { p256dh: string; auth: string } {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') };
}

function startPushService(): Promise<{ server: Server; port: number; received: CapturedPush[] }> {
  const received: CapturedPush[] = [];
  const server = https.createServer(
    {
      cert: readFileSync(join(TLS_FIXTURES, 'self-signed-localhost.crt.pem')),
      key: readFileSync(join(TLS_FIXTURES, 'self-signed-localhost.key.pem')),
    },
    (req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c.toString('utf8')));
      req.on('end', () => {
        received.push({ path: req.url ?? '', headers: req.headers, body: raw });
        if (req.url === '/push-ok') res.writeHead(201).end();
        else if (req.url === '/push-gone') res.writeHead(410).end();
        else res.writeHead(404).end();
      });
    },
  );
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as AddressInfo).port, received }));
  });
}

const vapidKeys = webpush.generateVAPIDKeys();

/** 本地推送服务在 127.0.0.1：生产 agent 会被 SSRF 守卫拦截（见 url-guard），测试换成放行自签证书的普通 agent */
function localAdapter(prisma: PrismaService): PushAdapter {
  const adapter = new PushAdapter(prisma);
  adapter.agent = new https.Agent({ rejectUnauthorized: false });
  return adapter;
}

const outbound = (overrides: Partial<OutboundNotification> = {}): OutboundNotification => ({
  id: 'n1',
  tenantId: 't1',
  userId: 'u1',
  type: 'task.assigned',
  title: 'push-title',
  body: 'push-marker-plaintext',
  data: { taskId: 'task-1' },
  channel: 'push',
  recipientEmail: 'u@example.com',
  timezone: 'Asia/Shanghai',
  ...overrides,
});

function fakePrisma(subs: Array<{ id: string; endpoint: string; p256dh: string; auth: string }>) {
  const findMany = vi.fn().mockResolvedValue(subs);
  const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
  return {
    prisma: { pushSubscription: { findMany, deleteMany } } as unknown as PrismaService,
    findMany,
    deleteMany,
  };
}

const ENV_KEYS = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'];

describe('PushAdapter 真实投递（web-push 加密出站）', () => {
  const envBackup: Record<string, string | undefined> = {};
  let originalRejectUnauthorized: boolean | undefined;

  beforeAll(() => {
    // web-push 未传 agent 时走 https.globalAgent：放行本地自签证书（仅本进程测试生效）    originalRejectUnauthorized = https.globalAgent.options.rejectUnauthorized;
    https.globalAgent.options.rejectUnauthorized = false;
  });

  afterAll(() => {
    https.globalAgent.options.rejectUnauthorized = originalRejectUnauthorized;
  });

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      envBackup[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (envBackup[key] === undefined) delete process.env[key];
      else process.env[key] = envBackup[key];
    }
  });

  it('真实加密推送：VAPID 鉴权头 + aes128gcm 密文到达推送服务', async () => {
    const pushService = await startPushService();
    try {
      process.env.VAPID_PUBLIC_KEY = vapidKeys.publicKey;
      process.env.VAPID_PRIVATE_KEY = vapidKeys.privateKey;
      const { prisma } = fakePrisma([{ id: 'sub-1', endpoint: `https://127.0.0.1:${pushService.port}/push-ok`, ...makeSubscriptionKeys() }]);
      const adapter = localAdapter(prisma);

      await adapter.send(outbound(), { id: 'd1', notificationId: 'n1', channel: 'push', attempts: 0 });

      expect(pushService.received).toHaveLength(1);
      const request = pushService.received[0];
      expect(request.headers['authorization']).toMatch(/vapid|webpush/i);
      expect(String(request.headers['content-encoding'])).toContain('aes128gcm');
      expect(request.body.length).toBeGreaterThan(0);
      expect(request.body).not.toContain('push-marker-plaintext'); // 端到端加密，明文不出现在线缆上
    } finally {
      await new Promise<void>((resolve) => pushService.server.close(() => resolve()));
    }
  });

  it('推送服务 410（订阅已注销）→ 清理死订阅并判失败', async () => {
    const pushService = await startPushService();
    try {
      process.env.VAPID_PUBLIC_KEY = vapidKeys.publicKey;
      process.env.VAPID_PRIVATE_KEY = vapidKeys.privateKey;
      const { prisma, deleteMany } = fakePrisma([{ id: 'sub-gone', endpoint: `https://127.0.0.1:${pushService.port}/push-gone`, ...makeSubscriptionKeys() }]);
      const adapter = localAdapter(prisma);

      await expect(adapter.send(outbound(), { id: 'd2', notificationId: 'n1', channel: 'push', attempts: 0 })).rejects.toThrow('PUSH_ALL_SUBSCRIPTIONS_GONE');
      expect(deleteMany).toHaveBeenCalledWith({ where: { id: 'sub-gone' } });
    } finally {
      await new Promise<void>((resolve) => pushService.server.close(() => resolve()));
    }
  });

  it('多订阅部分死链：成功投递优先，仅清理死订阅', async () => {
    const pushService = await startPushService();
    try {
      process.env.VAPID_PUBLIC_KEY = vapidKeys.publicKey;
      process.env.VAPID_PRIVATE_KEY = vapidKeys.privateKey;
      const { prisma, deleteMany } = fakePrisma([
        { id: 'sub-dead', endpoint: `https://127.0.0.1:${pushService.port}/push-missing`, ...makeSubscriptionKeys() },
        { id: 'sub-live', endpoint: `https://127.0.0.1:${pushService.port}/push-ok`, ...makeSubscriptionKeys() },
      ]);
      const adapter = localAdapter(prisma);

      await expect(adapter.send(outbound(), { id: 'd3', notificationId: 'n1', channel: 'push', attempts: 0 })).resolves.toBeUndefined();
      expect(deleteMany).toHaveBeenCalledTimes(1);
      expect(deleteMany).toHaveBeenCalledWith({ where: { id: 'sub-dead' } });
    } finally {
      await new Promise<void>((resolve) => pushService.server.close(() => resolve()));
    }
  });

  it('VAPID 未配置 → PUSH_ADAPTER_NOT_CONFIGURED（不查询订阅）', async () => {
    const { prisma, findMany } = fakePrisma([]);
    const adapter = new PushAdapter(prisma);
    await expect(adapter.send(outbound(), { id: 'd4', notificationId: 'n1', channel: 'push', attempts: 0 })).rejects.toThrow('PUSH_ADAPTER_NOT_CONFIGURED');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('无订阅 → PUSH_NO_SUBSCRIPTION（终态不可达）', async () => {
    process.env.VAPID_PUBLIC_KEY = vapidKeys.publicKey;
    process.env.VAPID_PRIVATE_KEY = vapidKeys.privateKey;
    const { prisma } = fakePrisma([]);
    const adapter = new PushAdapter(prisma);
    await expect(adapter.send(outbound(), { id: 'd5', notificationId: 'n1', channel: 'push', attempts: 0 })).rejects.toThrow('PUSH_NO_SUBSCRIPTION');
  });
});

