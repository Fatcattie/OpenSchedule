import { describe, expect, it } from 'vitest'
import { buildEmailMessage, parseSmtpConfig } from './email-message';

describe('parseSmtpConfig SMTP 配置解析', () => {
  it('SMTP_HOST 缺失 → null（适配器未配置）', () => {
    expect(parseSmtpConfig({})).toBeNull();
    expect(parseSmtpConfig({ SMTP_HOST: '  ' })).toBeNull();
  });

  it('完整配置解析（含默认发件人）', () => {
    const cfg = parseSmtpConfig({ SMTP_HOST: 'smtp.example.com', SMTP_PORT: '465', SMTP_USER: 'u', SMTP_PASS: 'p', MAIL_FROM: 'OS <a@b.c>' });
    expect(cfg).toEqual({ host: 'smtp.example.com', port: 465, user: 'u', pass: 'p', from: 'OS <a@b.c>' });
  });

  it('端口非法/缺失 → 回落 587；无认证不携带 user/pass', () => {
    const cfg = parseSmtpConfig({ SMTP_HOST: 'localhost', SMTP_PORT: 'not-a-port' });
    expect(cfg).toMatchObject({ host: 'localhost', port: 587 });
    expect(cfg?.user).toBeUndefined();
    expect(cfg?.pass).toBeUndefined();
  });
});

describe('buildEmailMessage 邮件消息构建', () => {
  it('主题=标题，正文=标题+正文', () => {
    const msg = buildEmailMessage({ title: '任务已分配给你', body: '请于周五前完成' }, 'u@example.com', 'OS <no-reply@os.dev>');
    expect(msg).toEqual({
      from: 'OS <no-reply@os.dev>',
      to: 'u@example.com',
      subject: '任务已分配给你',
      text: '任务已分配给你\n\n请于周五前完成',
    });
  });

  it('body 为 null → 正文仅标题', () => {
    const msg = buildEmailMessage({ title: '提醒到点', body: null }, 'u@example.com', 'f');
    expect(msg.text).toBe('提醒到点');
  });
});
