/**
 * 职责：utils/format.ts 单元测试 —— 工时格式化、时长、相对时间、字节、首字母、截断。
 */
import {
  EMPTY_PLACEHOLDER,
  formatBytes,
  formatDurationShort,
  formatHours,
  formatHoursLong,
  formatRelativeTime,
  formatTimer,
  initialsOf,
  orPlaceholder,
  truncate,
} from '@/utils/format'

describe('formatHours —— 工时格式化（紧凑）', () => {
  it('整数 / 一位小数', () => {
    expect(formatHours(4)).toBe('4h')
    expect(formatHours(1.5)).toBe('1.5h')
    expect(formatHours(0)).toBe('0h')
  })

  it('四舍五入到 1 位小数', () => {
    expect(formatHours(4.04)).toBe('4h')
    expect(formatHours(3.96)).toBe('4h')
  })

  it('空值 / NaN 返回占位符', () => {
    expect(formatHours(null)).toBe(EMPTY_PLACEHOLDER)
    expect(formatHours(undefined)).toBe(EMPTY_PLACEHOLDER)
    expect(formatHours(Number.NaN)).toBe(EMPTY_PLACEHOLDER)
  })
})

describe('formatHoursLong', () => {
  it('完整中文工时', () => {
    expect(formatHoursLong(4)).toBe('4 小时')
    expect(formatHoursLong(1.5)).toBe('1.5 小时')
    expect(formatHoursLong(null)).toBe(EMPTY_PLACEHOLDER)
  })
})

describe('formatTimer —— HH:MM:SS', () => {
  it('常规与边界', () => {
    expect(formatTimer(0)).toBe('00:00:00')
    expect(formatTimer(59)).toBe('00:00:59')
    expect(formatTimer(60)).toBe('00:01:00')
    expect(formatTimer(3661)).toBe('01:01:01')
    expect(formatTimer(86399)).toBe('23:59:59')
  })

  it('负数与小数向下取整', () => {
    expect(formatTimer(-5)).toBe('00:00:00')
    expect(formatTimer(59.9)).toBe('00:00:59')
  })
})

describe('formatDurationShort', () => {
  it('时 / 分 / 秒', () => {
    expect(formatDurationShort(4980)).toBe('1h23m')
    expect(formatDurationShort(3600)).toBe('1h')
    expect(formatDurationShort(1380)).toBe('23m')
    expect(formatDurationShort(45)).toBe('45s')
  })

  it('空值占位', () => {
    expect(formatDurationShort(null)).toBe(EMPTY_PLACEHOLDER)
    expect(formatDurationShort(undefined)).toBe(EMPTY_PLACEHOLDER)
  })
})

describe('formatBytes', () => {
  it('B / KB / MB 分级', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(1_240_000)).toBe('1.2 MB')
    expect(formatBytes(null)).toBe(EMPTY_PLACEHOLDER)
  })
})

describe('truncate / initialsOf / orPlaceholder', () => {
  it('truncate 超长补省略号', () => {
    expect(truncate('hello world', 5)).toBe('hell…')
    expect(truncate('abc', 5)).toBe('abc')
  })

  it('initialsOf 中文取末字 / 英文取首字母 / 空值 ?', () => {
    expect(initialsOf('张伟')).toBe('伟')
    expect(initialsOf('Alice Wang')).toBe('A')
    expect(initialsOf('')).toBe('?')
    expect(initialsOf('   ')).toBe('?')
  })

  it('orPlaceholder 空串/空白兜底', () => {
    expect(orPlaceholder('')).toBe(EMPTY_PLACEHOLDER)
    expect(orPlaceholder('   ')).toBe(EMPTY_PLACEHOLDER)
    expect(orPlaceholder(null)).toBe(EMPTY_PLACEHOLDER)
    expect(orPlaceholder('值班')).toBe('值班')
  })
})

describe('formatRelativeTime —— 相对时间', () => {
  const SH = 'Asia/Shanghai'
  // 固定系统时间为 2026-09-12 12:00（Asia/Shanghai），使「同日 / 跨日」判定确定
  const BASE = new Date('2026-09-12T04:00:00.000Z').getTime()

  beforeAll(() => {
    jest.useFakeTimers({ now: new Date(BASE) })
  })
  afterAll(() => {
    jest.useRealTimers()
  })

  it('刚刚（< 1 分钟）', () => {
    expect(formatRelativeTime(new Date(BASE - 10_000), SH)).toBe('刚刚')
  })

  it('N 分钟前（< 1 小时）', () => {
    expect(formatRelativeTime(new Date(BASE - 5 * 60_000), SH)).toBe('5 分钟前')
  })

  it('N 小时前（同日）', () => {
    expect(formatRelativeTime(new Date(BASE - 2 * 3600_000), SH)).toBe('2 小时前')
  })

  it('昨天带时刻（跨日）', () => {
    expect(formatRelativeTime(new Date(BASE - 30 * 3600_000), SH)).toMatch(/^昨天 \d{2}:\d{2}$/)
  })

  it('N 天前（2–6 天）', () => {
    expect(formatRelativeTime(new Date(BASE - 3 * 86_400_000), SH)).toBe('3 天前')
  })

  it('超过 7 天回落为日期', () => {
    expect(formatRelativeTime(new Date(BASE - 30 * 86_400_000), SH)).toMatch(/^\d{1,2}月\d{1,2}日$/)
  })
})
