/**
 * 职责：排期视图拖拽的**纯函数与业务常量**（ARCH §3 / §7 · PRD §7.2.1 · M2-P1-04）。
 *
 * 全部为纯函数，可独立测试；业务常量集中在此**命名导出**，禁止散落到组件里（ARCH §10 硬约束）。
 *
 * 拖拽规则（主理人裁定 ①，规则越少越好测）：
 * - 越界一律**钳制**在 08:00–20:00（保持时长不变）；
 * - **取消**只由两种情形触发：① 上滑 ≥ 56px；② 水平拖出时间轴宽度。
 */
import { startOfDay } from '@/utils/date'

/** 长按进入拖拽态的时长（ms，PRD AC1） */
export const DRAG_LONG_PRESS_MS = 300
/** 时间轴吸附粒度（分钟，PRD AC2）：08:00–20:00 共 24 格 */
export const SLOT_MINUTES = 30
/** 时间轴窗口起点：08:00（分钟，PRD AC7） */
export const AXIS_START_MIN = 8 * 60
/** 时间轴窗口终点：20:00（分钟，PRD AC7） */
export const AXIS_END_MIN = 20 * 60
/** 时间轴窗口总时长（分钟）：720 */
export const AXIS_DURATION_MIN = AXIS_END_MIN - AXIS_START_MIN
/** 上滑取消阈值（px，PRD AC6 / 主理人裁定 ①） */
export const CANCEL_UP_SLIDE_PX = 56
/** 时间轴每小时像素高度（与 focus.service.CALENDAR_HOUR_HEIGHT 同源：56px/h） */
export const HOUR_HEIGHT_PX = 56
/** 一小时分钟数 */
export const MINUTES_PER_HOUR = 60
/** 每像素对应分钟数（≈0.9333） */
export const PX_PER_MINUTE = HOUR_HEIGHT_PX / MINUTES_PER_HOUR

/** 像素位移 → 分钟（四舍五入，支持正负位移） */
export function pxToMinutes(dyPx: number): number {
  return Math.round(dyPx / PX_PER_MINUTE)
}

/** 分钟 → 像素位移（拖拽 translateY 用） */
export function minutesToPx(minutes: number): number {
  return minutes * PX_PER_MINUTE
}

/** 吸附到 30 分钟粒度（.5 向上取整） */
export function snapToSlot(minutes: number): number {
  return Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES
}

/**
 * 钳制起点分钟，使 [start, start+duration] 落在 08:00–20:00 窗口内（保持时长不变）。
 * - 早于 08:00 → 480；
 * - 晚于 20:00 − duration → 1200 − duration；
 * - 时长 ≥ 窗口（720）→ 固定为 480。
 */
export function clampStartMin(targetMin: number, durationMin: number): number {
  const maxStart = AXIS_END_MIN - durationMin
  if (maxStart <= AXIS_START_MIN) return AXIS_START_MIN
  return Math.min(Math.max(targetMin, AXIS_START_MIN), maxStart)
}

/** 放置结果（吸附 + 钳制后的起止分钟） */
export interface DropResult {
  /** 吸附并钳制后的起点（分钟） */
  startMin: number
  /** 终点（分钟，= startMin + 时长） */
  endMin: number
}

/**
 * 松手放置：把「原起点 + 垂直位移」吸附到 30 分钟粒度后钳制在窗口内。
 * 时长恒定不变（块高不随拖拽变化）。
 */
export function resolveDrop(origStartMin: number, dyPx: number, durationMin: number): DropResult {
  const target = origStartMin + pxToMinutes(dyPx)
  const startMin = clampStartMin(snapToSlot(target), durationMin)
  return { startMin, endMin: startMin + durationMin }
}

/** 取消判定上下文（水平拖出时间轴） */
export interface DragCancelContext {
  /** 水平位移（px，右为正） */
  dxPx?: number
  /** 时间轴可视宽度（px），用于判定「水平拖出时间轴宽度」 */
  timelineWidthPx?: number
}

/**
 * 是否取消本次拖拽（**不落库**）。
 * 仅两种情形触发取消（主理人裁定 ①）：
 * ① 上滑 ≥ `CANCEL_UP_SLIDE_PX`（56px）；
 * ② 水平拖出时间轴宽度（|dx| > 时间轴宽度）。
 *
 * 注：`origStartMin` / `durationMin` 保留以对齐 ARCH §3 的签名（越界由 `clampStartMin` 钳制，
 * 不参与取消判定，避免双规则）。
 */
export function isCancelDrag(
  origStartMin: number,
  dyPx: number,
  durationMin: number,
  context: DragCancelContext = {},
): boolean {
  void origStartMin
  void durationMin
  // ① 上滑取消
  if (dyPx <= -CANCEL_UP_SLIDE_PX) return true
  // ② 水平拖出时间轴宽度
  const { dxPx = 0, timelineWidthPx = 0 } = context
  if (timelineWidthPx > 0 && Math.abs(dxPx) > timelineWidthPx) return true
  return false
}

/**
 * 把「某天 00:00 + 分钟偏移」换算为目标时区下的 ISO8601 UTC 字符串。
 * 必须按 user.timezone 换算，避免设备时区 ≠ 目标时区时时间轴错位（ARCH R6）。
 */
export function minutesToIso(dayDate: Date, minutes: number, timezone?: string | null): string {
  const base = startOfDay(dayDate, timezone)
  return new Date(base.getTime() + minutes * 60_000).toISOString()
}
