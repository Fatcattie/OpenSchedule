import { describe, expect, it } from 'vitest'
import { inQuietHours, quietHoursEnd, QuietHourRange } from './quiet-hours';

const range = (days: number[], start: string, end: string): QuietHourRange => ({ days, start, end });

// 本地构造时刻（getDay/getHours 语义确定，不受测试机时区影响）
const local = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo, d, h, mi);
// 固定 UTC 瞬时（配合显式 timeZone 使用）
const utc = (iso: string) => new Date(iso);

describe('quiet-hours 免打扰判定（本地时区）', () => {
  it('无区间或 days 为空 → 永不安静', () => {
    const now = local(2026, 9, 5, 23, 0); // 周一 23:00
    expect(inQuietHours([], now)).toBe(false);
    expect(inQuietHours([range([], '21:00', '08:00')], now)).toBe(false);
  });

  it('区间内（普通同日区间）→ true', () => {
    const now = local(2026, 9, 5, 10, 30); // 周一 10:30
    expect(inQuietHours([range([1], '09:00', '18:00')], now)).toBe(true);
  });

  it('区间外（普通同日区间）→ false', () => {
    const now = local(2026, 9, 5, 8, 30); // 周一 08:30
    expect(inQuietHours([range([1], '09:00', '18:00')], now)).toBe(false);
  });

  it('跨午夜：午夜前段（列出起始日）→ true', () => {
    const now = local(2026, 9, 5, 22, 30); // 周一 22:30
    expect(inQuietHours([range([1], '21:00', '08:00')], now)).toBe(true);
  });

  it('跨午夜：午夜后段（当日也列出）→ true', () => {
    const now = local(2026, 9, 6, 7, 30); // 周二 07:30，days=[1,2]
    expect(inQuietHours([range([1, 2], '21:00', '08:00')], now)).toBe(true);
  });

  it('跨午夜：当日未列出 → false', () => {
    const now = local(2026, 9, 6, 7, 30); // 周二 07:30，days=[1]（周一才静默）
    expect(inQuietHours([range([1], '21:00', '08:00')], now)).toBe(false);
  });

  it('边界语义 [start, end)：起点含、终点不含', () => {
    const r = [range([1], '09:00', '18:00')];
    expect(inQuietHours(r, local(2026, 9, 5, 9, 0))).toBe(true);
    expect(inQuietHours(r, local(2026, 9, 5, 17, 59))).toBe(true);
    expect(inQuietHours(r, local(2026, 9, 5, 18, 0))).toBe(false);
  });

  it('非法 HH:mm 区间被跳过，不影响其他区间', () => {
    const now = local(2026, 9, 5, 22, 0);
    expect(inQuietHours([range([1], 'bad', '08:00'), range([1], '21:00', '23:00')], now)).toBe(true);
  });
});

describe('quiet-hours 时区感知（Intl IANA）', () => {
  it('UTC 瞬时按用户时区判定：23:30Z = 上海次日 07:30（跨午夜后段命中）', () => {
    const now = utc('2026-10-05T23:30:00Z'); // 上海：周二 07:30
    expect(inQuietHours([range([2], '22:00', '08:00')], now, 'Asia/Shanghai')).toBe(true);
  });

  it('同一瞬时在另一时区不在免打扰：23:30Z = 纽约 19:30（周一晚）', () => {
    const now = utc('2026-10-05T23:30:00Z'); // 纽约：周一 19:30（UTC-4）    expect(inQuietHours([range([1], '21:00', '08:00')], now, 'America/New_York')).toBe(false);
  });

  it('非法时区名回落服务器本地，不抛错', () => {
    const now = local(2026, 9, 5, 22, 0);
    expect(inQuietHours([range([1], '21:00', '23:00')], now, 'Not/AZone')).toBe(true);
  });
});

describe('quiet-hours 窗口结束时刻（补发时点，D-12）', () => {
  it('未在免打扰中 → null', () => {
    expect(quietHoursEnd([range([1], '09:00', '18:00')], local(2026, 9, 5, 8, 0))).toBeNull();
  });

  it('普通同日区间：结束 = 当天 end 时刻', () => {
    const now = local(2026, 9, 5, 10, 0);
    const end = quietHoursEnd([range([1], '09:00', '18:00')], now);
    expect(end).not.toBeNull();
    expect(end!.getTime()).toBe(local(2026, 9, 5, 18, 0).getTime());
  });

  it('跨午夜（午夜前段）：结束 = 次日 end 时刻', () => {
    const now = local(2026, 9, 5, 23, 30); // 周一 23:30
    const end = quietHoursEnd([range([1], '21:00', '08:00')], now);
    expect(end!.getTime()).toBe(local(2026, 9, 6, 8, 0).getTime());
  });

  it('跨午夜（午夜后段）：结束 = 当日 end 时刻', () => {
    const now = local(2026, 9, 6, 7, 30); // 周二 07:30，days=[1,2]
    const end = quietHoursEnd([range([1, 2], '21:00', '08:00')], now);
    expect(end!.getTime()).toBe(local(2026, 9, 6, 8, 0).getTime());
  });

  it('多区间重叠：取最早结束者', () => {
    const now = local(2026, 9, 5, 22, 0);
    const end = quietHoursEnd([range([1], '21:30', '08:00'), range([1], '21:00', '23:00')], now);
    expect(end!.getTime()).toBe(local(2026, 9, 5, 23, 0).getTime());
  });

  it('时区感知：上海 07:30 的结束 08:00 = 00:00Z', () => {
    const now = utc('2026-10-05T23:30:00Z'); // 上海周二 07:30
    const end = quietHoursEnd([range([2], '22:00', '08:00')], now, 'Asia/Shanghai');
    expect(end!.getTime()).toBe(utc('2026-10-06T00:00:00Z').getTime());
  });

  it('补发时刻恒在当前时刻之后', () => {
    const now = local(2026, 9, 5, 23, 59);
    const end = quietHoursEnd([range([1], '21:00', '00:00')], now);
    expect(end).not.toBeNull();
    expect(end!.getTime()).toBeGreaterThan(now.getTime());
  });
});
