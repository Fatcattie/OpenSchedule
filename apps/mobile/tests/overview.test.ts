/**
 * 职责：时间容器「整周」概览视图纯逻辑单测（Task #18）。
 * 覆盖：列宽等分（运行时按容器宽度）/ 紧凑日期 / 自然日差（含负偏移时区回归）/
 *       点击列定位正确日期（首列 / 今天列 / 末列，端到端校验 dayOffset → 日视图 dateKey）/ 状态配色。
 */
import { DEMO_USER_IDS, resetDatabase } from '@/data'
import * as focusService from '@/services/focus.service'
import { colors, statusColor } from '@/theme'
import { todayKey } from '@/utils/date'
import {
  calendarDayDiff,
  computeOverviewColumnWidth,
  formatCompactDate,
  overviewBarColor,
  resolveDayOffset,
} from '@/utils/overview'

const ME = DEMO_USER_IDS.me
/** 与 CalendarScreen 的 DAY_NAV_RANGE 一致（整周视图点击列时的钳制范围） */
const DAY_NAV_RANGE = 7

beforeEach(() => {
  resetDatabase()
})

describe('formatCompactDate —— 紧凑日期（窄列不换行）', () => {
  it('输出 M/D，不带前导零', () => {
    expect(formatCompactDate('2026-09-26')).toBe('9/26')
    expect(formatCompactDate('2026-12-05')).toBe('12/5')
    expect(formatCompactDate('2026-01-01')).toBe('1/1')
  })

  it('非法输入原样返回（不抛错）', () => {
    expect(formatCompactDate('bad')).toBe('bad')
  })
})

describe('computeOverviewColumnWidth —— 按容器可用宽度等分 7 列', () => {
  it('390px 屏（可用 350）：扣列间距后等分并向下取整', () => {
    // (350 - 6*4) / 7 = 46.57 → 46
    expect(computeOverviewColumnWidth(350, 7, 4)).toBe(46)
  })

  it('无间距时整除', () => {
    expect(computeOverviewColumnWidth(350, 7, 0)).toBe(50)
  })

  it('总宽（含间距）不超过可用宽度，杜绝横向溢出 / 滚动', () => {
    const width = computeOverviewColumnWidth(390, 7, 4)
    expect(width * 7 + 4 * 6).toBeLessThanOrEqual(390)
  })

  it('边界：宽度为 0 或列数 <= 0 返回 0', () => {
    expect(computeOverviewColumnWidth(0, 7, 4)).toBe(0)
    expect(computeOverviewColumnWidth(350, 0, 4)).toBe(0)
  })
})

describe('calendarDayDiff / resolveDayOffset —— 自然日差与时区无关 + 钳制', () => {
  it('自然日差只比较日历标签（跨月 / 跨年正确）', () => {
    expect(calendarDayDiff('2026-09-26', '2026-09-26')).toBe(0)
    expect(calendarDayDiff('2026-09-27', '2026-09-26')).toBe(1)
    expect(calendarDayDiff('2026-09-26', '2026-09-27')).toBe(-1)
    expect(calendarDayDiff('2026-10-01', '2026-09-30')).toBe(1)
    expect(calendarDayDiff('2027-01-01', '2026-12-31')).toBe(1)
  })

  it('范围内原样返回（当前周数据 0..6 均落在此区间）', () => {
    const today = '2026-09-26'
    expect(resolveDayOffset('2026-09-26', today, DAY_NAV_RANGE)).toBe(0)
    expect(resolveDayOffset('2026-09-29', today, DAY_NAV_RANGE)).toBe(3)
    expect(resolveDayOffset('2026-10-02', today, DAY_NAV_RANGE)).toBe(6)
  })

  it('超出 ±range 的日期被钳制（不越界、不「点了没反应」）', () => {
    const today = '2026-09-26'
    expect(resolveDayOffset('2026-10-10', today, DAY_NAV_RANGE)).toBe(DAY_NAV_RANGE) // +14 → +7
    expect(resolveDayOffset('2026-09-01', today, DAY_NAV_RANGE)).toBe(-DAY_NAV_RANGE) // -25 → -7
  })
})

describe('overviewBarColor —— 块内只显示颜色', () => {
  it('done / cancelled 统一灰显', () => {
    expect(overviewBarColor('done')).toBe(colors.text.tertiary)
    expect(overviewBarColor('cancelled')).toBe(colors.text.tertiary)
  })

  it('其余状态取 statusColor 同色系主色', () => {
    expect(overviewBarColor('todo')).toBe(statusColor.todo.color)
    expect(overviewBarColor('in_progress')).toBe(statusColor.in_progress.color)
    expect(overviewBarColor('blocked')).toBe(statusColor.blocked.color)
  })
})

describe('整周视图点击列 → 定位到正确日期（验收 6，端到端）', () => {
  // 含负偏移时区：若用 daysUntil(dateKey) 之类「经 new Date(dateKey) UTC 解析」的实现会整体差 1 天
  const TIMEZONES = ['Asia/Shanghai', 'America/New_York']

  it.each(TIMEZONES)('时区 %s：7 列 dayOffset 精确等于列下标，点击后日视图 dateKey 一致', async (tz) => {
    const week = await focusService.getCalendarWeek(ME, tz)
    expect(week).toHaveLength(7)

    const today = todayKey(tz)
    // 首列即今天（getCalendarWeek 从今天起算）
    expect(week[0].dateKey).toBe(today)

    for (let index = 0; index < week.length; index += 1) {
      const column = week[index]
      const offset = resolveDayOffset(column.dateKey, today, DAY_NAV_RANGE)
      // ① 列下标 = 相对今天的天数差（点击目标 offset 正确）
      expect(offset).toBe(index)
      // ② 模拟点击：以该 offset 拉取日视图数据，日期必须与所点列完全一致（不跳错天）
      const day = await focusService.getCalendarDay(ME, tz, offset)
      expect(day.dateKey).toBe(column.dateKey)
    }
  })

  it('显式校验首列 / 今天列 / 末列三点的点击结果', async () => {
    const tz = 'Asia/Shanghai'
    const week = await focusService.getCalendarWeek(ME, tz)
    const today = todayKey(tz)

    const first = resolveDayOffset(week[0].dateKey, today, DAY_NAV_RANGE)
    const last = resolveDayOffset(week[6].dateKey, today, DAY_NAV_RANGE)

    // 首列 = 今天列（今天列高亮即第 0 列），末列 = 今天 + 6
    expect(first).toBe(0)
    expect(last).toBe(6)

    // 点击首列 / 末列后，日视图显示日期与所点列一致
    expect((await focusService.getCalendarDay(ME, tz, first)).dateKey).toBe(week[0].dateKey)
    expect((await focusService.getCalendarDay(ME, tz, last)).dateKey).toBe(week[6].dateKey)
  })
})
