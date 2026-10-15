/**
 * 职责：第 4 轮回归 —— 「整周」概览视图核心逻辑的**独立**边界复核（QA 严过关）。
 * 与工程师自测 `tests/overview.test.ts` 互补，聚焦其未覆盖 / 覆盖偏弱处：
 *  ① 容器宽极端值（0 / 240 / 1024）与「7 列 + 间隙严格不超容器」的全区间扫描；
 *  ② resolveDayOffset 的多时区（含负偏移 America/New_York）无关性 + 跨月/跨年/闰日 + 双向钳制；
 *  ③ formatCompactDate 跨月跨年一致性（无前导零）；
 *  ④ assignLanes 在 46px 窄列复用时的**坐标区间不相交**（不叠压）断言。
 * 仅新增测试代码，不改动任何业务源码。
 */
import { DEMO_USER_IDS, resetDatabase } from '@/data'
import * as focusService from '@/services/focus.service'
import { addDays, toDateKey, todayKey } from '@/utils/date'
import { assignLanes } from '@/utils/lane'
import {
  calendarDayDiff,
  computeOverviewColumnWidth,
  formatCompactDate,
  resolveDayOffset,
} from '@/utils/overview'

const ME = DEMO_USER_IDS.me
/** 与 CalendarScreen.DAY_NAV_RANGE 一致 */
const DAY_NAV_RANGE = 7
/** 与 CalendarScreen.OVERVIEW_COLUMN_GAP 一致（spacing.xxs = 4） */
const GAP = 4

beforeEach(() => {
  resetDatabase()
})

describe('computeOverviewColumnWidth —— 容器宽极端值边界（一屏塞下的保证）', () => {
  it('容器宽 0 → 返回 0', () => {
    expect(computeOverviewColumnWidth(0, 7, GAP)).toBe(0)
  })

  it('极窄 240 → 向下取整 30，且 7 列 + 间隙严格不超过容器', () => {
    const width = computeOverviewColumnWidth(240, 7, GAP)
    expect(width).toBe(30) // (240 - 4*6) / 7 = 30.857 → 30
    expect(width * 7 + GAP * 6).toBeLessThanOrEqual(240)
  })

  it('极宽 1024 → 向下取整 142，且 7 列 + 间隙严格不超过容器', () => {
    const width = computeOverviewColumnWidth(1024, 7, GAP)
    expect(width).toBe(142) // (1024 - 24) / 7 = 142.857 → 142
    expect(width * 7 + GAP * 6).toBeLessThanOrEqual(1024)
  })

  it('390px 屏（可用 350）→ 46（复核主理人自报口径）', () => {
    expect(computeOverviewColumnWidth(350, 7, GAP)).toBe(46)
  })

  it('有效域扫描（可用宽 >= 间隙总和 24）0..1200：7*width + 6*gap 恒 <= 容器（杜绝横向溢出）', () => {
    // 可用宽 < 间隙总和属退化域（连零宽列 + 间隙都塞不下），真实 390px 屏（可用 ~350）不可达
    for (let container = GAP * 6; container <= 1200; container += 1) {
      const width = computeOverviewColumnWidth(container, 7, GAP)
      expect(width).toBeGreaterThanOrEqual(0)
      expect(width * 7 + GAP * 6).toBeLessThanOrEqual(container)
    }
  })

  it('退化域（容器 < 间隙总和）返回 0 列宽 —— 边界观察，真实场景不可达', () => {
    expect(computeOverviewColumnWidth(10, 7, GAP)).toBe(0)
    expect(computeOverviewColumnWidth(23, 7, GAP)).toBe(0)
  })

  it('负数宽兜底为 0；NaN 宽当前实现传播为 NaN（健壮性观察，真实输入恒为有限数）', () => {
    expect(computeOverviewColumnWidth(-100, 7, GAP)).toBe(0)
    expect(computeOverviewColumnWidth(350, 7, -10)).toBeGreaterThanOrEqual(0)
    // 记录真实行为：Math.max(0, NaN) = NaN，未做 Number.isFinite 兜底（onLayout 恒传有限数，故不触发）
    expect(Number.isNaN(computeOverviewColumnWidth(Number.NaN, 7, GAP))).toBe(true)
  })
})

describe('calendarDayDiff / resolveDayOffset —— 跨月 / 跨年 / 闰日 + 时区无关 + 双向钳制', () => {
  it('跨月 / 跨年 / 闰日：自然日差均为 +1', () => {
    expect(calendarDayDiff('2026-10-01', '2026-09-30')).toBe(1) // 9/30 → 10/1
    expect(calendarDayDiff('2027-01-01', '2026-12-31')).toBe(1) // 12/31 → 1/1
    expect(calendarDayDiff('2028-03-01', '2028-02-29')).toBe(1) // 闰日 → 3/1
    expect(calendarDayDiff('2026-03-01', '2026-02-28')).toBe(1) // 平年 2/28 → 3/1
    expect(calendarDayDiff('2026-09-30', '2026-09-30')).toBe(0)
    expect(calendarDayDiff('2026-09-30', '2026-10-01')).toBe(-1)
  })

  it('列映射：首列 / 今天列 / 中间列 / 末列（跨月）均正确', () => {
    const today = '2026-09-30'
    expect(resolveDayOffset('2026-09-30', today, DAY_NAV_RANGE)).toBe(0) // 今天列
    expect(resolveDayOffset('2026-10-01', today, DAY_NAV_RANGE)).toBe(1) // 跨月首列 +1
    expect(resolveDayOffset('2026-10-03', today, DAY_NAV_RANGE)).toBe(3) // 中间列
    expect(resolveDayOffset('2026-10-06', today, DAY_NAV_RANGE)).toBe(6) // 末列
  })

  it('双向钳制：越界日期落到 ±range（必响应、不越界）', () => {
    const today = '2026-09-30'
    expect(resolveDayOffset('2026-10-20', today, DAY_NAV_RANGE)).toBe(DAY_NAV_RANGE) // +20 → +7
    expect(resolveDayOffset('2026-09-01', today, DAY_NAV_RANGE)).toBe(-DAY_NAV_RANGE) // -29 → -7
  })

  it('多时区（含负偏移 America/New_York）：7 列 dayOffset 恒为 0..6，首列 = 今天', async () => {
    const TIMEZONES = [
      'Asia/Shanghai',
      'America/New_York',
      'Europe/London',
      'Pacific/Kiritimati', // UTC+14（最早）
      'Pacific/Honolulu', // UTC-10（最晚）
    ]
    for (const tz of TIMEZONES) {
      const week = await focusService.getCalendarWeek(ME, tz)
      expect(week).toHaveLength(7)
      const today = todayKey(tz)
      expect(week[0].dateKey).toBe(today)
      const offsets = week.map((column) => resolveDayOffset(column.dateKey, today, DAY_NAV_RANGE))
      expect(offsets).toEqual([0, 1, 2, 3, 4, 5, 6])
      // 连续 7 天且跨月 / 跨年也正确（相邻列自然日差恒为 1）
      for (let i = 1; i < week.length; i += 1) {
        expect(calendarDayDiff(week[i].dateKey, week[i - 1].dateKey)).toBe(1)
      }
    }
  })

  it('钳制后必响应：越界列点击精确落到 today ± range 那一天（不跳错天）', async () => {
    const tz = 'America/New_York'
    const today = todayKey(tz)
    const far = toDateKey(addDays(new Date(), 30), tz) // 远超 +7
    const offset = resolveDayOffset(far, today, DAY_NAV_RANGE)
    expect(offset).toBe(DAY_NAV_RANGE)
    const day = await focusService.getCalendarDay(ME, tz, offset)
    expect(day.dateKey).toBe(toDateKey(addDays(new Date(), DAY_NAV_RANGE), tz))
  })
})

describe('formatCompactDate —— 跨月 / 跨年一致性（无前导零）', () => {
  it('单 / 双位月日均无前导零', () => {
    expect(formatCompactDate('2026-10-01')).toBe('10/1')
    expect(formatCompactDate('2026-12-31')).toBe('12/31')
    expect(formatCompactDate('2027-01-01')).toBe('1/1')
    expect(formatCompactDate('2026-11-30')).toBe('11/30')
    expect(formatCompactDate('2026-09-09')).toBe('9/9')
  })

  it('跨月连续 7 天序列格式一致（不出现 10/01 之类）', () => {
    const keys = [
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]
    expect(keys.map(formatCompactDate)).toEqual(['9/28', '9/29', '9/30', '10/1', '10/2', '10/3', '10/4'])
  })
})

describe('assignLanes 在 46px 窄列的复用 —— 坐标区间不叠压', () => {
  const COLUMN_WIDTH = 46

  /** 归一化水平区间 [left, right]（相对 46px 列宽） */
  const xInterval = (laneIndex: number, laneCount: number): { left: number; right: number } => {
    const lanes = Math.max(1, laneCount)
    return {
      left: (laneIndex / lanes) * COLUMN_WIDTH,
      right: ((laneIndex + 1) / lanes) * COLUMN_WIDTH,
    }
  }

  it('三块两两重叠（种子 9:00 簇）→ 3 泳道，任意两块水平区间不相交', () => {
    const items = [
      { id: 'a', start: 60, end: 150 },
      { id: 'b', start: 60, end: 240 },
      { id: 'c', start: 120, end: 210 },
    ]
    const result = assignLanes(items)
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const ia = xInterval(result[i].laneIndex, result[i].laneCount)
        const ib = xInterval(result[j].laneIndex, result[j].laneCount)
        // 半开区间不相交（允许端点相接）：right <= left
        expect(ia.right <= ib.left || ib.right <= ia.left).toBe(true)
      }
    }
    // 每块宽约 46/3 ≈ 15.3px，仍严格并排
    expect(result.every((r) => r.laneCount === 3)).toBe(true)
  })

  it('四块完全重叠 → 4 泳道，每块宽约 11.5px，逐对不相交', () => {
    const items = Array.from({ length: 4 }, (_, i) => ({ id: `t${i}`, start: 100, end: 200 }))
    const result = assignLanes(items)
    result.forEach((r) => expect(r.laneCount).toBe(4))
    for (let i = 0; i < result.length; i += 1) {
      for (let j = i + 1; j < result.length; j += 1) {
        const ia = xInterval(result[i].laneIndex, result[i].laneCount)
        const ib = xInterval(result[j].laneIndex, result[j].laneCount)
        expect(ia.right <= ib.left || ib.right <= ia.left).toBe(true)
      }
    }
  })
})
