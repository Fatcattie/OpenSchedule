import { describe, expect, it } from 'vitest'
import { enabledOutboundChannels } from './notification-routing';

describe('enabledOutboundChannels 偏好路由过滤', () => {
  it('三通道全开', () => {
    expect(enabledOutboundChannels({ email: true, push: true, im: true })).toEqual(['email', 'push', 'im']);
  });

  it('仅严格 true 视为启用（truthy 非 true 不开）', () => {
    expect(enabledOutboundChannels({ email: 1, push: 'yes', im: true })).toEqual(['im']);
  });

  it('false/缺省键 → 关闭', () => {
    expect(enabledOutboundChannels({ email: false, push: false })).toEqual([]);
  });

  it('非对象（null/数组/字符串）→ 空', () => {
    expect(enabledOutboundChannels(null)).toEqual([]);
    expect(enabledOutboundChannels(['email'])).toEqual([]);
    expect(enabledOutboundChannels('email')).toEqual([]);
  });

  it('未知通道键被忽略', () => {
    expect(enabledOutboundChannels({ email: true, sms: true, wechat: true })).toEqual(['email']);
  });
});
