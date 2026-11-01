/**
 * recurrence.spec.ts —— 定期/循环重复规则纯函数单测（R8-2 覆盖率锚点）
 *
 * 覆盖 computeOccurrenceStarts / materializeRecurrence / nextCyclicChild 三条导出：
 * 定期 daily/weekly/monthly 步进、时刻解析与钳制、maxCount 截断、
 * 循环 date/completion 锚点、以及 nextCyclicChild 的全部 guard 分支。
 */
import { describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import type { RecurrenceRule, WorkspaceTask } from '@/types'
import {
  computeOccurrenceStarts,
  materializeRecurrence,
  nextCyclicChild,
} from './recurrence'

/** 构造最小可用 WorkspaceTask（仅 recurrence 链路读取的字段有真实值，其余 cast） */
function makeBase(overrides: Partial<WorkspaceTask> = {}): WorkspaceTask {
  return {
    id: 'task-base',
    kind: 'task',
    startAt: '2026-01-01T09:00:00.000Z',
    endAt: '2026-01-01T10:30:00.000Z',
    recurrenceGroupId: 'rec-group-1',
    ...overrides,
  } as WorkspaceTask
}

function dailyRule(overrides: Partial<RecurrenceRule> = {}): RecurrenceRule {
  return {
    kind: 'scheduled',
    freq: 'daily',
    startDate: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('computeOccurrenceStarts', () => {
  it('定期 daily：按天步进并套用固定时刻（默认 09:00）', () => {
    const starts = computeOccurrenceStarts(
      dailyRule(),
      '2026-01-01T00:00:00.000Z',
      '2026-01-05T00:00:00.000Z',
      10,
    )
    expect(starts).toHaveLength(4)
    expect(dayjs(starts[0]).format('YYYY-MM-DD HH:mm')).toBe('2026-01-01 09:00')
    expect(dayjs(starts[3]).format('YYYY-MM-DD HH:mm')).toBe('2026-01-04 09:00')
  })

  it('时刻解析：合法 HH:mm 生效；越界时/分被钳制到 23:59；非法值回落 09:00', () => {
    const at = (time?: string) =>
      computeOccurrenceStarts(
        dailyRule({ time }),
        '2026-01-01T00:00:00.000Z',
        '2026-01-02T00:00:00.000Z',
        5,
      )[0]
    expect(dayjs(at('14:30')).format('HH:mm')).toBe('14:30')
    expect(dayjs(at('25:99')).format('HH:mm')).toBe('23:59')
    expect(dayjs(at('not-a-time')).format('HH:mm')).toBe('09:00')
  })

  it('weekly：只保留 weekdays 命中的星期', () => {
    // 2026-01-01 是周四（day=4）
    const starts = computeOccurrenceStarts(
      dailyRule({ freq: 'weekly', weekdays: [4] }),
      '2026-01-01T00:00:00.000Z',
      '2026-01-15T00:00:00.000Z',
      10,
    )
    expect(starts).toHaveLength(2)
    expect(starts.every((s) => dayjs(s).day() === 4)).toBe(true)
  })

  it('monthly：monthDay 超过当月天数时钳制到当月最后一天', () => {
    const starts = computeOccurrenceStarts(
      dailyRule({ freq: 'monthly', interval: 1, monthDay: 31, time: '10:00' }),
      '2026-02-01T00:00:00.000Z',
      '2026-05-01T00:00:00.000Z',
      10,
    )
    expect(starts).toHaveLength(3)
    expect(starts.map((s) => dayjs(s).format('YYYY-MM-DD'))).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })

  it('interval 小于 1 时按 1 处理；maxCount 截断发生次数', () => {
    const starts = computeOccurrenceStarts(
      dailyRule({ interval: 0 }),
      '2026-01-01T00:00:00.000Z',
      '2026-02-01T00:00:00.000Z',
      3,
    )
    expect(starts).toHaveLength(3)
  })

  it('循环 date 锚点：按 everyValue/everyUnit 步进', () => {
    const starts = computeOccurrenceStarts(
      {
        kind: 'cyclic',
        anchor: 'date',
        everyValue: 2,
        everyUnit: 'hour',
        startDate: '2026-01-01T00:00:00.000Z',
      },
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T08:00:00.000Z',
      10,
    )
    expect(starts).toHaveLength(4)
    expect(dayjs(starts[1]).format('HH:mm')).toBe('02:00')
  })

  it('循环 completion 锚点：不预生成发生点（返回空数组）', () => {
    const starts = computeOccurrenceStarts(
      {
        kind: 'cyclic',
        anchor: 'completion',
        everyValue: 1,
        everyUnit: 'day',
        startDate: '2026-01-01T00:00:00.000Z',
      },
      '2026-01-01T00:00:00.000Z',
      '2026-02-01T00:00:00.000Z',
      10,
    )
    expect(starts).toEqual([])
  })
})

describe('materializeRecurrence', () => {
  it('定期规则：实体复制出全部子任务，共享 recurrenceGroupId，index 0 保留原 id', () => {
    const children = materializeRecurrence(
      makeBase(),
      dailyRule({ count: 3 }),
      { now: dayjs('2026-01-01T00:00:00.000Z'), windowDays: 7 },
    )
    expect(children).toHaveLength(3)
    expect(children[0].id).toBe('task-base')
    expect(children.map((c) => c.occurrenceIndex)).toEqual([0, 1, 2])
    expect(children.every((c) => c.recurrenceGroupId === 'rec-group-1')).toBe(true)
    expect(children.every((c) => c.status === 'todo')).toBe(true)
    // 时长继承基准任务（90 分钟）
    expect(dayjs(children[1].endAt!).diff(dayjs(children[1].startAt!), 'minute')).toBe(90)
  })

  it('无 recurrenceGroupId 时生成新组 id；基准无排期时默认 60 分钟时长', () => {
    const children = materializeRecurrence(
      makeBase({ recurrenceGroupId: null, startAt: null, endAt: null }),
      dailyRule({ count: 2 }),
      { now: dayjs('2026-01-01T00:00:00.000Z'), windowDays: 3 },
    )
    expect(children[0].recurrenceGroupId).toBeTruthy()
    expect(dayjs(children[0].endAt!).diff(dayjs(children[0].startAt!), 'minute')).toBe(60)
  })

  it('循环 completion 锚点：只生成首次实例', () => {
    const children = materializeRecurrence(
      makeBase(),
      {
        kind: 'cyclic',
        anchor: 'completion',
        everyValue: 1,
        everyUnit: 'day',
        startDate: '2026-01-01T09:00:00.000Z',
      },
      { now: dayjs('2026-01-01T00:00:00.000Z') },
    )
    expect(children).toHaveLength(1)
    expect(children[0].occurrenceIndex).toBe(0)
  })

  it('count 上限被钳制到 200（防爆炸）', () => {
    const children = materializeRecurrence(
      makeBase(),
      dailyRule({ count: 9999 }),
      { now: dayjs('2026-01-01T00:00:00.000Z'), windowDays: 400, maxCount: 500 },
    )
    expect(children.length).toBeLessThanOrEqual(200)
  })
})

describe('nextCyclicChild', () => {
  const completionRule: RecurrenceRule = {
    kind: 'cyclic',
    anchor: 'completion',
    everyValue: 1,
    everyUnit: 'day',
    startDate: '2026-01-01T09:00:00.000Z',
  }

  function completedChild(overrides: Partial<WorkspaceTask> = {}): WorkspaceTask {
    return makeBase({
      recurrence: completionRule,
      occurrenceIndex: 0,
      completedAt: '2026-01-02T09:00:00.000Z',
      ...overrides,
    })
  }

  it('完成锚点：由 completedAt 顺延生成下一次实例', () => {
    const next = nextCyclicChild(completedChild(), [completedChild()])
    expect(next).not.toBeNull()
    expect(next!.occurrenceIndex).toBe(1)
    expect(next!.status).toBe('todo')
    expect(next!.completedAt).toBeNull()
    // 2026-01-02 完成 + 1 天 = 2026-01-03 09:00 开始
    expect(dayjs(next!.startAt!).format('YYYY-MM-DD HH:mm')).toBe('2026-01-03 09:00')
  })

  it('guard：非循环完成锚点规则返回 null', () => {
    const child = completedChild({ recurrence: dailyRule() })
    expect(nextCyclicChild(child, [child])).toBeNull()
    const noRule = completedChild({ recurrence: null })
    expect(nextCyclicChild(noRule, [noRule])).toBeNull()
  })

  it('guard：超过 endDate 不再生成', () => {
    const rule: RecurrenceRule = { ...completionRule, endDate: '2026-01-02T12:00:00.000Z' }
    const child = completedChild({ recurrence: rule })
    expect(nextCyclicChild(child, [child])).toBeNull()
  })

  it('guard：达到 count 上限不再生成', () => {
    const rule: RecurrenceRule = { ...completionRule, count: 1 }
    const child = completedChild({ recurrence: rule })
    expect(nextCyclicChild(child, [child])).toBeNull()
  })

  it('guard：组内已有更高 index 时返回 null（防重复顺延）', () => {
    const child = completedChild()
    const already = completedChild({ occurrenceIndex: 1 })
    expect(nextCyclicChild(child, [child, already])).toBeNull()
  })
})
