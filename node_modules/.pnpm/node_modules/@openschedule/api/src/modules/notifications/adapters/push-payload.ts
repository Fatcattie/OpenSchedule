/**
 * WebPush 纯函数（R5-3 / D-11）：VAPID 配置解析、推送载荷构建、死订阅判定。
 * D-11 口径：服务端能力就绪（默认关闭 —— 未配置 VAPID 即未启用；订阅流由前端 P2 接入）。
 */

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export interface PushPayload {
  title: string;
  body: string;
  /** 深链/业务上下文（浏览器 SW 消费；未知形状透传） */
  data: unknown;
}

/** 载荷体积护栏（web-push 单条 ~4KB 上限，标题/正文截断保证加密后可投递） */
const TITLE_MAX = 120;
const BODY_MAX = 1000;

/** VAPID 环境变量解析；公钥或私钥缺失 → null（适配器未配置，投递失败可见） */
export function parseVapidConfig(env: NodeJS.ProcessEnv): VapidConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    subject: env.VAPID_SUBJECT?.trim() || 'mailto:admin@openschedule.dev',
  };
}

/** 组装推送载荷（标题+正文截断；data 透传业务上下文） */
export function buildPushPayload(notification: { title: string; body: string | null; data: unknown }): PushPayload {
  return {
    title: notification.title.slice(0, TITLE_MAX),
    body: (notification.body ?? '').slice(0, BODY_MAX),
    data: notification.data ?? null,
  };
}

/** 死订阅判定（推送服务返回 404/410 表示订阅已被浏览器/服务注销，应清理） */
export function shouldPruneSubscription(statusCode: unknown): boolean {
  return statusCode === 404 || statusCode === 410;
}
