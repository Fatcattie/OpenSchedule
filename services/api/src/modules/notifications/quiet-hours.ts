/**
 * 免打扰判定纯函数（§3.2 R5）：时区感知（Intl，用户 timezone），支持多区间与跨午夜。
 * 补发口径（设计文档 §6 D-12）：免打扰期间外发挂起，窗口结束补发 —— quietHoursEnd 给出补发时刻。
 */

/** 免打扰时段（notification_preferences.quiet_hours jsonb 形状） */
export interface QuietHourRange {
  days: number[]; // 0-6（周日=0，与 JS getDay 对齐）
  start: string; // 'HH:mm'
  end: string; // 'HH:mm'
}

interface ZonedParts {
  /** 0-6（周日=0） */
  day: number;
  /** 当日分钟数 */
  minutes: number;
  /** 墙钟时刻按 UTC 编码的毫秒数（用于偏移换算） */
  wallMs: number;
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function toMinutes(hhmm: string): number {
  const [h, m] = String(hhmm).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return (h % 24) * 60 + m;
}

/** 取指定时区下的星期/分钟/墙钟毫秒；timeZone 缺失或非法时回落服务器本地时区 */
function zonedParts(date: Date, timeZone?: string | null): ZonedParts {
  if (timeZone) {
    try {
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        weekday: 'short',
        hourCycle: 'h23',
      });
      const parts: Record<string, string> = {};
      for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
      const hour = Number(parts.hour) % 24;
      return {
        day: WEEKDAY_INDEX[parts.weekday] ?? date.getDay(),
        minutes: hour * 60 + Number(parts.minute),
        wallMs: Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, Number(parts.minute), Number(parts.second)),
      };
    } catch {
      // 非法时区名回落本地，不阻断投递
    }
  }
  return {
    day: date.getDay(),
    minutes: date.getHours() * 60 + date.getMinutes(),
    wallMs: Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()),
  };
}

/** 墙钟超前 UTC 的偏移（本地/时区；如 +08:00 → +8h）。DST 场景由 wallToInstant 迭代校正 */
function offsetMs(date: Date, timeZone?: string | null): number {
  return zonedParts(date, timeZone).wallMs - date.getTime();
}

/** 墙钟毫秒 → 瞬时（以 reference 的偏移为初值，再用目标时刻偏移校正一次） */
function wallToInstant(targetWallMs: number, reference: Date, timeZone?: string | null): Date {
  const first = new Date(targetWallMs - offsetMs(reference, timeZone));
  return new Date(targetWallMs - offsetMs(first, timeZone));
}

function matchesWindow(r: QuietHourRange, day: number, minutes: number): boolean {
  if (!r?.days?.length || !r.days.includes(day)) return false;
  const s = toMinutes(r.start);
  const e = toMinutes(r.end);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return false;
  if (s <= e) return minutes >= s && minutes < e;
  return minutes >= s || minutes < e; // 跨午夜（如 21:00-08:00）
}

/** 当前是否处于任一免打扰区间 */
export function inQuietHours(ranges: QuietHourRange[], now: Date, timeZone?: string | null): boolean {
  if (!ranges?.length) return false;
  const { day, minutes } = zonedParts(now, timeZone);
  return ranges.some((r) => matchesWindow(r, day, minutes));
}

/**
 * 当前免打扰窗口的结束时刻（补发时刻，D-12）。
 * 不在免打扰中 → null；多区间重叠时取最早结束者。结束时刻恒在 now 之后。
 */
export function quietHoursEnd(ranges: QuietHourRange[], now: Date, timeZone?: string | null): Date | null {
  if (!ranges?.length) return null;
  const { day, minutes, wallMs } = zonedParts(now, timeZone);
  const dayStartWall = wallMs - minutes * 60_000;
  let best: Date | null = null;
  for (const r of ranges) {
    if (!matchesWindow(r, day, minutes)) continue;
    const e = toMinutes(r.end);
    if (!Number.isFinite(e)) continue;
    // 窗口终点在墙钟上要么是今天、要么是明天（活动窗口必包含 now，终点最多 24h 内）
    let endWall = dayStartWall + e * 60_000;
    if (endWall <= wallMs) endWall += 86_400_000;
    let instant = wallToInstant(endWall, now, timeZone);
    if (instant.getTime() <= now.getTime()) instant = new Date(instant.getTime() + 86_400_000);
    if (!best || instant.getTime() < best.getTime()) best = instant;
  }
  return best;
}
