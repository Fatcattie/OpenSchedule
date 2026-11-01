/**
 * 通知偏好路由纯函数（§3.2 R5：「偏好路由/免打扰单测 ≥10 例」的被测目标）。
 */
import { OutboundChannel, NOTIFICATION_CHANNELS } from './adapters/notification-adapter.interface';

/** 通道开关过滤（channels jsonb → 启用外发通道列表；仅严格 true 视为启用） */
export function enabledOutboundChannels(channels: unknown): OutboundChannel[] {
  if (!channels || typeof channels !== 'object') return [];
  const c = channels as Record<string, unknown>;
  return NOTIFICATION_CHANNELS.filter((ch) => c[ch] === true);
}
