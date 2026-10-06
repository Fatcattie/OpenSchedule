/**
 * 职责：排期拖拽纯函数测试（ARCH §8 / PRD §7.2.1 · M2-P1-04）。
 * 覆盖：位移→分钟换算（正负 / 零）、30min 吸附边界、08:00–20:00 钳制（含时长为 0 / 超窗口）、
 * 取消（上滑 56px 上下边界、水平拖出时间轴宽度）。
 */
import {
  AXIS_END_MIN,
  AXIS_START_MIN,
  CANCEL_UP_SLIDE_PX,
  DRAG_LONG_PRESS_MS,
  HOUR_HEIGHT_PX,
  SLOT_MINUTES,
  clampStartMin,
  isCancelDrag,
  minutesToIso,
  pxToMinutes,
  resolveDrop,
  snapToSlot,
} from '@/utils/schedule'
import { startOfDay } from '@/utils/date'

describe('业务常量（集中命名导出，禁止散落）', () => {
  it('取值符合 PRD：300ms / 30min / 56px / 08:00–20:00', () => {
    expect(DRAG_LONG_PRESS_MS).toBe(300)
    expect(SLOT_MINUTES).toBe(30)
    expect(CANCEL_UP_SLIDE_PX).toBe(56)
    expect(AXIS_START_MIN).toBe(480) // 08:00
    expect(AXIS_END_MIN).toBe(1200) // 20:00
    expect(HOUR_HEIGHT_PX).toBe(56)
  })
})

describe('pxToMinutes —— 位移 → 分钟换算', () => {
  it('56px → 60min；28px → 30min（1 小时 = 56px）', () => {
    expect(pxToMinutes(56)).toBe(60)
    expect(pxToMinutes(28)).toBe(30)
  })

  it('零位移 → 0', () => {
    expect(pxToMinutes(0)).toBe(0)
  })

  it('负位移按同比例换算', () => {
    expect(pxToMinutes(-56)).toBe(-60)
    expect(pxToMinutes(-28)).toBe(-30)
  })
})

describe('snapToSlot —— 30 分钟粒度吸附（含 .5 取整）', () => {
  it.each([
    [0, 0],
    [14, 0],
    [15, 30], // .5 向上
    [29, 30],
    [30, 30],
    [44, 30],
    [45, 60], // .5 向上
    [59, 60],
    [60, 60],
  ])('snapToSlot(%i) === %i', (input, expected) => {
    expect(snapToSlot(input)).toBe(expected)
  })

  it('吸附结果恒为 30 的整数倍', () => {
    for (let m = -120; m <= 1400; m += 7) {
      // 用 === 0 比较，避免 -0 与 0 在 Object.is 下不等的干扰
      expect(snapToSlot(m) % SLOT_MINUTES === 0).toBe(true)
    }
  })
})

describe('clampStartMin —— 08:00–20:00 边界钳制（保持时长）', () => {
  it('早于 08:00 → 钳制为 480', () => {
    expect(clampStartMin(400, 60)).toBe(480)
    expect(clampStartMin(-100, 60)).toBe(480)
  })

  it('晚于 20:00 − 时长 → 钳制为 1200 − 时长', () => {
    expect(clampStartMin(1190, 60)).toBe(1140)
    expect(clampStartMin(9999, 90)).toBe(1110)
  })

  it('窗口内原样返回', () => {
    expect(clampStartMin(700, 60)).toBe(700)
    expect(clampStartMin(480, 60)).toBe(480)
    expect(clampStartMin(1140, 60)).toBe(1140)
  })

  it('时长为 0 → 起点钳制在 [480, 1200]', () => {
    expect(clampStartMin(500, 0)).toBe(500)
    expect(clampStartMin(1300, 0)).toBe(1200)
    expect(clampStartMin(100, 0)).toBe(480)
  })

  it('时长 ≥ 窗口（720min）→ 固定 480', () => {
    expect(clampStartMin(700, 720)).toBe(480)
    expect(clampStartMin(700, 800)).toBe(480)
  })
})

describe('resolveDrop —— 吸附 + 钳制后的起止分钟', () => {
  it('零位移保持原位（09:00 起 60min）', () => {
    expect(resolveDrop(540, 0, 60)).toEqual({ startMin: 540, endMin: 600 })
  })

  it('下移 56px（=60min）→ 10:00 起', () => {
    expect(resolveDrop(540, 56, 60)).toEqual({ startMin: 600, endMin: 660 })
  })

  it('下移 28px（=30min）→ 09:30 起', () => {
    expect(resolveDrop(540, 28, 60)).toEqual({ startMin: 570, endMin: 630 })
  })

  it('大幅上移越界 → 钳制为 08:00 起（保持时长）', () => {
    expect(resolveDrop(540, -1000, 60)).toEqual({ startMin: 480, endMin: 540 })
  })

  it('大幅下移越界 → 块底 ≤ 20:00（startAt ≤ 20:00 − 时长）', () => {
    const result = resolveDrop(540, 10_000, 60)
    expect(result.startMin).toBe(AXIS_END_MIN - 60)
    expect(result.endMin).toBe(AXIS_END_MIN)
  })

  it('时长恒定不变（任意 dy 下 endMin − startMin === duration）', () => {
    const duration = 90
    for (let dy = -2000; dy <= 2000; dy += 37) {
      const { startMin, endMin } = resolveDrop(600, dy, duration)
      expect(endMin - startMin).toBe(duration)
      expect(startMin).toBeGreaterThanOrEqual(AXIS_START_MIN)
      expect(endMin).toBeLessThanOrEqual(AXIS_END_MIN)
    }
  })
})

describe('isCancelDrag —— 取消仅两分支（主理人裁定 ①）', () => {
  it('上滑阈值 56px 的上下边界', () => {
    expect(isCancelDrag(540, -55, 60)).toBe(false) // 未达阈值
    expect(isCancelDrag(540, -56, 60)).toBe(true) // 恰好达阈值 → 取消
    expect(isCancelDrag(540, -57, 60)).toBe(true) // 超过阈值 → 取消
  })

  it('未上滑（下移 / 零位移）不取消', () => {
    expect(isCancelDrag(540, 0, 60)).toBe(false)
    expect(isCancelDrag(540, 100, 60)).toBe(false)
  })

  it('水平拖出时间轴宽度 → 取消', () => {
    expect(isCancelDrag(540, 0, 60, { dxPx: 300, timelineWidthPx: 300 })).toBe(false) // 恰好等于宽度不取消
    expect(isCancelDrag(540, 0, 60, { dxPx: 301, timelineWidthPx: 300 })).toBe(true) // 超出宽度 → 取消
    expect(isCancelDrag(540, 0, 60, { dxPx: -301, timelineWidthPx: 300 })).toBe(true) // 反向同理
  })

  it('越界不再作为取消条件（大幅下移由钳制处理，不取消）', () => {
    expect(isCancelDrag(540, 200, 60)).toBe(false) // 下移越界不取消
    expect(isCancelDrag(540, 10_000, 60)).toBe(false) // 大幅下移仍不取消（钳制）
  })

  it('大幅上移由「上滑 ≥56px」规则取消（而非「越界」规则）', () => {
    expect(isCancelDrag(540, -1000, 60)).toBe(true)
  })
})

describe('minutesToIso —— 分钟偏移 → ISO8601（按目标时区锚定当天）', () => {
  it('当天 08:00 对应 startOfDay + 480min', () => {
    const day = new Date()
    const iso = minutesToIso(day, AXIS_START_MIN, 'Asia/Shanghai')
    const expected = new Date(startOfDay(day, 'Asia/Shanghai').getTime() + 480 * 60_000).toISOString()
    expect(iso).toBe(expected)
  })
})
