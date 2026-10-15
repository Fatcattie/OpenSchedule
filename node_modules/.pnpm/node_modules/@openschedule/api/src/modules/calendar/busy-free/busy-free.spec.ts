/**
 * busy-free.spec.ts
 */
import {
  findFreeSlotsForDay,
  findFreeSlots,
  findCommonFreeSlots,
  computeDayLoad,
  computeDayLoads,
  type Interval,
} from './busy-free'

const WORK_HOURS = { startHour: 9, endHour: 18 }

function mkDate(y: number, m: number, d: number, h = 0, min = 0): Date {
  return new Date(y, m - 1, d, h, min, 0, 0)
}

function mkInterval(start: Date, end: Date, summary?: string): Interval {
  return { start, end, summary, status: 'busy' }
}

describe('busy-free', () => {
  describe('findFreeSlotsForDay', () => {
    it('整天空闲 → 返回整个工作时段', () => {
      const day = mkDate(2026, 8, 25)
      const slots = findFreeSlotsForDay([], WORK_HOURS, day, 30)
      expect(slots.length).toBe(1)
      expect(slots[0].start.getHours()).toBe(9)
      expect(slots[0].end.getHours()).toBe(18)
    })

    it('整天忙 → 无空闲', () => {
      const day = mkDate(2026, 8, 25)
      const busy = [mkInterval(mkDate(2026, 8, 25, 9, 0), mkDate(2026, 8, 25, 18, 0))]
      const slots = findFreeSlotsForDay(busy, WORK_HOURS, day, 30)
      expect(slots.length).toBe(0)
    })

    it('上午忙下午闲 → 下午整段空闲', () => {
      const day = mkDate(2026, 8, 25)
      const busy = [mkInterval(mkDate(2026, 8, 25, 9, 0), mkDate(2026, 8, 25, 12, 0))]
      const slots = findFreeSlotsForDay(busy, WORK_HOURS, day, 30)
      expect(slots.length).toBe(1)
      expect(slots[0].start.getHours()).toBe(12)
      expect(slots[0].end.getHours()).toBe(18)
    })

    it('中间有一段会议 → 分成两段空闲', () => {
      const day = mkDate(2026, 8, 25)
      const busy = [mkInterval(mkDate(2026, 8, 25, 14, 0), mkDate(2026, 8, 25, 15, 0))]
      const slots = findFreeSlotsForDay(busy, WORK_HOURS, day, 30)
      expect(slots.length).toBe(2)
      expect(slots[0].start.getHours()).toBe(9)
      expect(slots[0].end.getHours()).toBe(14)
      expect(slots[1].start.getHours()).toBe(15)
      expect(slots[1].end.getHours()).toBe(18)
    })

    it('重叠的忙时段会被合并', () => {
      const day = mkDate(2026, 8, 25)
      const busy = [
        mkInterval(mkDate(2026, 8, 25, 10, 0), mkDate(2026, 8, 25, 12, 0)),
        mkInterval(mkDate(2026, 8, 25, 11, 0), mkDate(2026, 8, 25, 14, 0)),
      ]
      const slots = findFreeSlotsForDay(busy, WORK_HOURS, day, 30)
      expect(slots.length).toBe(2)
      // 09-10 + 14-18
    })

    it('跨天的忙碌时段会被裁剪到当天', () => {
      const day = mkDate(2026, 8, 25)
      const busy = [mkInterval(
        mkDate(2026, 8, 24, 20, 0),
        mkDate(2026, 8, 26, 2, 0)
      )]
      const slots = findFreeSlotsForDay(busy, WORK_HOURS, day, 30)
      expect(slots.length).toBe(0)  // 当天工作时间全被占了
    })

    it('最小时长过滤：20 分钟空档被过滤掉', () => {
      const day = mkDate(2026, 8, 25)
      const busy = [
        mkInterval(mkDate(2026, 8, 25, 9, 0), mkDate(2026, 8, 25, 11, 40)),
        mkInterval(mkDate(2026, 8, 25, 12, 0), mkDate(2026, 8, 25, 18, 0)),
      ]
      const slots = findFreeSlotsForDay(busy, WORK_HOURS, day, 30)
      // 中间只有 20 分钟，不够 30 分钟
      expect(slots.length).toBe(0)
    })

    it('最小时长过滤：31 分钟空档保留', () => {
      const day = mkDate(2026, 8, 25)
      const busy = [
        mkInterval(mkDate(2026, 8, 25, 9, 0), mkDate(2026, 8, 25, 11, 29)),
        mkInterval(mkDate(2026, 8, 25, 12, 0), mkDate(2026, 8, 25, 18, 0)),
      ]
      const slots = findFreeSlotsForDay(busy, WORK_HOURS, day, 30)
      expect(slots.length).toBe(1)
      expect(slots[0].start.getMinutes()).toBe(29)
    })
  })

  describe('findCommonFreeSlots', () => {
    it('两人都有空 → 全天空闲', () => {
      const usersBusy: Record<string, Interval[]> = {
        user1: [],
        user2: [],
      }
      const range = { start: mkDate(2026, 8, 25), end: mkDate(2026, 8, 25) }
      const result = findCommonFreeSlots(usersBusy, WORK_HOURS, range, 30)
      expect(result[0].slots.length).toBe(1)
      expect(result[0].slots[0].start.getHours()).toBe(9)
    })

    it('一人全天忙 → 无共同空闲', () => {
      const usersBusy: Record<string, Interval[]> = {
        user1: [mkInterval(mkDate(2026, 8, 25, 9, 0), mkDate(2026, 8, 25, 18, 0))],
        user2: [],
      }
      const range = { start: mkDate(2026, 8, 25), end: mkDate(2026, 8, 25) }
      const result = findCommonFreeSlots(usersBusy, WORK_HOURS, range, 30)
      expect(result[0].slots.length).toBe(0)
    })

    it('两人错开 → 交集就是共同空闲', () => {
      const usersBusy: Record<string, Interval[]> = {
        user1: [mkInterval(mkDate(2026, 8, 25, 9, 0), mkDate(2026, 8, 25, 12, 0))],
        user2: [mkInterval(mkDate(2026, 8, 25, 14, 0), mkDate(2026, 8, 25, 18, 0))],
      }
      const range = { start: mkDate(2026, 8, 25), end: mkDate(2026, 8, 25) }
      const result = findCommonFreeSlots(usersBusy, WORK_HOURS, range, 30)
      // 共同空闲：12:00-14:00
      expect(result[0].slots.length).toBe(1)
      expect(result[0].slots[0].start.getHours()).toBe(12)
      expect(result[0].slots[0].end.getHours()).toBe(14)
    })
  })

  describe('computeDayLoad', () => {
    it('0% 负载（全天空闲）', () => {
      const day = mkDate(2026, 8, 25)
      const result = computeDayLoad([], day, WORK_HOURS)
      expect(result.loadRatio).toBe(0)
      expect(result.busyMinutes).toBe(0)
      expect(result.totalWorkMinutes).toBe(9 * 60)
    })

    it('50% 负载', () => {
      const day = mkDate(2026, 8, 25)
      // 4.5 小时 = 50%
      const busy = [mkInterval(mkDate(2026, 8, 25, 9, 0), mkDate(2026, 8, 25, 13, 30))]
      const result = computeDayLoad(busy, day, WORK_HOURS)
      expect(result.loadRatio).toBeCloseTo(0.5, 2)
    })

    it('100% 负载', () => {
      const day = mkDate(2026, 8, 25)
      const busy = [mkInterval(mkDate(2026, 8, 25, 9, 0), mkDate(2026, 8, 25, 18, 0))]
      const result = computeDayLoad(busy, day, WORK_HOURS)
      expect(result.loadRatio).toBe(1)
    })

    it('重叠时段不重复计算', () => {
      const day = mkDate(2026, 8, 25)
      const busy = [
        mkInterval(mkDate(2026, 8, 25, 9, 0), mkDate(2026, 8, 25, 12, 0)),
        mkInterval(mkDate(2026, 8, 25, 11, 0), mkDate(2026, 8, 25, 13, 30)),
      ]
      const result = computeDayLoad(busy, day, WORK_HOURS)
      // 合并后 4.5 小时 = 50%
      expect(result.loadRatio).toBeCloseTo(0.5, 2)
    })
  })
})
