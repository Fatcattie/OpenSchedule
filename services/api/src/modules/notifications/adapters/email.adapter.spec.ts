/**
 * EmailAdapter 真实投递集成测试（R5-1）：
 * 启动本地 SMTP sink（真实 TCP socket + SMTP 协议对话），经 nodemailer 实发并断言信封/主题/正文到达。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressInfo, createServer, Server, Socket } from 'node:net';
import { EmailAdapter } from './email.adapter';
import { OutboundNotification } from './notification-adapter.interface';

vi.setConfig({ testTimeout: 15_000 });

interface CapturedMessage {
  from: string;
  recipients: string[];
  data: string;
}

/** 最小 SMTP sink：EHLO/MAIL/RCPT/DATA/QUIT，记录报文原文*/
class SmtpSink {
  private readonly server: Server;
  readonly messages: CapturedMessage[] = [];
  private current: { from: string; recipients: string[] } | null = null;

  constructor() {
    this.server = createServer((socket) => this.handle(socket));
  }

  listen(): Promise<number> {
    return new Promise((resolve) => {
      this.server.listen(0, '127.0.0.1', () => resolve((this.server.address() as AddressInfo).port));
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.server.close(() => resolve()));
  }

  private handle(socket: Socket): void {
    socket.write('220 smtp-sink ready\r\n');
    let buffer = '';
    let dataMode = false;
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (dataMode) {
        const terminator = buffer.indexOf('\r\n.\r\n');
        if (terminator === -1) return;
        const body = buffer.slice(0, terminator);
        buffer = buffer.slice(terminator + 5);
        this.messages.push({ from: this.current?.from ?? '', recipients: this.current?.recipients ?? [], data: body });
        this.current = null;
        dataMode = false;
        socket.write('250 message accepted\r\n');
      }
      let idx: number;
      while ((idx = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const command = line.toUpperCase();
        if (command.startsWith('EHLO')) socket.write('250-smtp-sink\r\n250 SIZE 10485760\r\n');
        else if (command.startsWith('HELO')) socket.write('250 smtp-sink\r\n');
        else if (command.startsWith('MAIL FROM')) {
          this.current = { from: line.slice(9).trim(), recipients: [] };
          socket.write('250 OK\r\n');
        } else if (command.startsWith('RCPT TO')) {
          this.current?.recipients.push(line.slice(7).trim());
          socket.write('250 OK\r\n');
        } else if (command === 'DATA') {
          dataMode = true;
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
          break;
        } else if (command === 'QUIT') {
          socket.write('221 Bye\r\n');
          socket.end();
        } else {
          socket.write('250 OK\r\n');
        }
      }
    });
    socket.on('error', () => undefined);
  }
}

const outbound = (overrides: Partial<OutboundNotification> = {}): OutboundNotification => ({
  id: 'n1',
  tenantId: 't1',
  userId: 'u1',
  type: 'task.assigned',
  title: 'mail-sink-subject',
  body: 'mail-sink-body-marker',
  data: {},
  channel: 'email',
  recipientEmail: 'u@example.com',
  timezone: 'Asia/Shanghai',
  ...overrides,
});

describe('EmailAdapter 真实 SMTP 投递（本地 sink）', () => {
  const envBackup: Record<string, string | undefined> = {};
  const ENV_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'];

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

  it('经真实 SMTP 协议对话投递：信封/主题/正文到达 sink', async () => {
    const sink = new SmtpSink();
    const port = await sink.listen();
    try {
      process.env.SMTP_HOST = '127.0.0.1';
      process.env.SMTP_PORT = String(port);
      process.env.MAIL_FROM = 'OS <no-reply@os.test>';
      const adapter = new EmailAdapter();

      await adapter.send(outbound(), { id: 'd1', notificationId: 'n1', channel: 'email', attempts: 0 });

      expect(sink.messages).toHaveLength(1);
      const message = sink.messages[0];
      expect(message.from).toContain('no-reply@os.test');
      expect(message.recipients.join(',')).toContain('u@example.com');
      expect(message.data).toContain('mail-sink-subject');
      expect(message.data).toContain('mail-sink-body-marker');
      expect(message.data).toMatch(/Content-Type: text\/plain/i);
    } finally {
      await sink.close();
    }
  });

  it('SMTP_HOST 未配置 → EMAIL_ADAPTER_NOT_CONFIGURED（不发起连接）', async () => {
    const adapter = new EmailAdapter();
    await expect(adapter.send(outbound(), { id: 'd2', notificationId: 'n1', channel: 'email', attempts: 0 })).rejects.toThrow('EMAIL_ADAPTER_NOT_CONFIGURED');
  });

  it('收件邮箱缺失 → EMAIL_RECIPIENT_MISSING', async () => {
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = '1';
    const adapter = new EmailAdapter();
    await expect(
      adapter.send(outbound({ recipientEmail: null }), { id: 'd3', notificationId: 'n1', channel: 'email', attempts: 0 }),
    ).rejects.toThrow('EMAIL_RECIPIENT_MISSING');
  });
});

