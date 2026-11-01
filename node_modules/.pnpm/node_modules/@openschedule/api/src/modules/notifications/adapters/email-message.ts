/**
 * 邮件消息纯函数（D-04 定案：SMTP 中继抽象，nodemailer 发送；供应商可换）。
 * SMTP 配置缺失时 parseSmtpConfig 返回 null，适配器据此抛 EMAIL_ADAPTER_NOT_CONFIGURED（落 delivery.lastError）。
 */

export interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
}

export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
}

const DEFAULT_FROM = 'OpenSchedule <no-reply@openschedule.dev>';

/** 解析 SMTP 环境变量；SMTP_HOST 缺失 → null（适配器未配置，投递失败可见） */
export function parseSmtpConfig(env: NodeJS.ProcessEnv): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  if (!host) return null;
  const portRaw = Number(env.SMTP_PORT);
  const port = Number.isFinite(portRaw) && portRaw > 0 && portRaw < 65536 ? portRaw : 587;
  return {
    host,
    port,
    user: env.SMTP_USER?.trim() || undefined,
    pass: env.SMTP_PASS || undefined,
    from: env.MAIL_FROM?.trim() || DEFAULT_FROM,
  };
}

/** 组装邮件消息（主题=标题，正文=标题+正文文本） */
export function buildEmailMessage(
  notification: { title: string; body: string | null },
  recipientEmail: string,
  from: string,
): EmailMessage {
  return {
    from,
    to: recipientEmail,
    subject: notification.title,
    text: notification.body ? `${notification.title}\n\n${notification.body}` : notification.title,
  };
}
