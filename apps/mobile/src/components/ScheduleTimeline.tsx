/**
 * 职责：排期视图 —— 08:00–20:00 时间轴 + 任务块 + 长按拖拽重排 + 对齐参考线
 * （ARCH §6 / PRD §7.2.1 · M2-P1-04）。
 *
 * 零原生依赖：拖拽仅用 RN 内置 Animated / PanResponder（禁用第三方手势 / 动画库，铁律）。
 * 个人任务块（kind='personal'）可长按拖拽；团队任务块（kind='task'）只读（enabled=false）。
 * 所有尺寸均由 @/utils/schedule 的业务常量与 @/theme 的 token 算出，禁止内联魔法数字。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { useThemedStyles } from '@/store/ThemeProvider'
import { radius, shadow, spacing, typography, type ThemeColors } from '@/theme'
import type { TaskStatus } from '@/types'
import { minutesBetween, startOfDay } from '@/utils/date'
import {
  AXIS_DURATION_MIN,
  AXIS_END_MIN,
  AXIS_START_MIN,
  DRAG_LONG_PRESS_MS,
  HOUR_HEIGHT_PX,
  MINUTES_PER_HOUR,
  SLOT_MINUTES,
  minutesToPx,
  pxToMinutes,
  type DropResult,
} from '@/utils/schedule'
import { useDragReschedule } from '@/hooks/useDragReschedule'
// 直接相对路径导入，避免与并行任务争夺 @/components 桶文件
import { TimelineBlock } from './TimelineBlock'

/** 时间轴总高（px）＝ 窗口时长(小时) × 每小时高度（禁止写死 672） */
const AXIS_HEIGHT_PX = (AXIS_DURATION_MIN / MINUTES_PER_HOUR) * HOUR_HEIGHT_PX

/** 每小时刻度数量（含 08:00 与 20:00 两端点，共 13 条） */
const HOUR_TICK_COUNT = AXIS_DURATION_MIN / MINUTES_PER_HOUR + 1

/** 左侧时间刻度列宽度（取自间距 token，非魔法数字） */
const TIME_LABEL_WIDTH = spacing.xxxl

/** 拖拽中块的最上层 zIndex */
const DRAGGING_Z_INDEX = 10

/** 排期块（个人任务或团队任务） */
export interface ScheduleBlock {
  /** 唯一 id（PersonalTask.id 或 Task.id） */
  id: string
  title: string
  status: TaskStatus
  /** 'personal' = 个人任务（可拖）；'task' = 团队任务（只读） */
  kind: 'personal' | 'task'
  /** ISO8601 */
  startAt: string
  /** ISO8601 */
  endAt: string
}

/** ScheduleTimeline 入参 */
export interface ScheduleTimelineProps {
  blocks: ScheduleBlock[]
  /** 拖拽态变化（页面据此 scrollEnabled） */
  onDragStateChange?: (dragging: boolean) => void
  /** 松手放置（仅 kind==='personal' 触发） */
  onReschedule: (blockId: string, result: DropResult) => void
  /** 点击块 */
  onBlockPress: (blockId: string) => void
  /** 用于把 ISO 换算成时间轴分钟 */
  dayDate: Date
  timezone?: string | null
}

/** DraggableBlock 入参（同文件内部使用，不导出） */
interface DraggableBlockProps {
  block: ScheduleBlock
  /** 已钳制的顶部比例（0..1） */
  topRatio: number
  /** 已钳制的高度比例（0..1） */
  heightRatio: number
  /** 起点分钟（相对当天 00:00） */
  startMin: number
  /** 时长分钟（恒定） */
  durationMin: number
  /** 时间轴可视宽度（px），用于水平越界取消判定 */
  timelineWidthPx: number
  continuationTop: boolean
  continuationBottom: boolean
  onDragStateChange?: (dragging: boolean) => void
  onReschedule: (blockId: string, result: DropResult) => void
  onBlockPress: (blockId: string) => void
  /** 拖拽中上报吸附后起点（null 表示未拖拽），用于父级渲染参考线 */
  onGhostChange: (startMin: number | null) => void
}

/** 分钟 → HH:00 刻度文案（如 480 → '08:00'） */
function formatHourLabel(minuteOfDay: number): string {
  const hour = Math.floor(minuteOfDay / MINUTES_PER_HOUR)
  return `${String(hour).padStart(2, '0')}:00`
}

/** 可拖拽任务块（内部组件）：包裹 TimelineBlock，挂载拖拽手势与参考线联动 */
function DraggableBlock({
  block,
  topRatio,
  heightRatio,
  startMin,
  durationMin,
  timelineWidthPx,
  continuationTop,
  continuationBottom,
  onDragStateChange,
  onReschedule,
  onBlockPress,
  onGhostChange,
}: DraggableBlockProps): React.JSX.Element {
  const styles = useThemedStyles(makeStyles)
  const draggable = block.kind === 'personal'

  const handleDrop = useCallback(
    (result: DropResult): void => {
      onReschedule(block.id, result)
    },
    [block.id, onReschedule],
  )

  const { translateY, scale, dragging, panHandlers, beginDrag } = useDragReschedule({
    originStartMin: startMin,
    durationMin,
    timelineWidthPx,
    onDragStateChange,
    onDrop: handleDrop,
    enabled: draggable,
  })

  // 用 ref 读取最新拖拽态，避免监听回调在归位动画期间误报
  const draggingRef = useRef(dragging)
  draggingRef.current = dragging

  // 拖拽中把「吸附后起点」上报给父级（位移已是吸附后的像素值）
  useEffect(() => {
    const listenerId = translateY.addListener(({ value }) => {
      if (!draggingRef.current) return
      onGhostChange(startMin + pxToMinutes(value))
    })
    return () => translateY.removeListener(listenerId)
  }, [translateY, startMin, onGhostChange])

  // 进入 / 退出拖拽态时初始化或清除参考线位置
  useEffect(() => {
    onGhostChange(dragging ? startMin : null)
  }, [dragging, startMin, onGhostChange])

  const animatedStyle = useMemo(
    () => ({ transform: [{ translateY }, { scale }] }),
    [translateY, scale],
  )

  return (
    <Animated.View
      accessible={dragging}
      accessibilityRole={dragging ? 'button' : undefined}
      accessibilityLabel={dragging ? `${block.title} 拖动中` : undefined}
      style={[
        styles.blockLayer,
        { top: `${topRatio * 100}%`, height: `${heightRatio * 100}%` },
        draggable ? styles.blockLayerPersonal : null,
        dragging ? styles.blockLayerDragging : null,
        animatedStyle,
      ]}
      {...panHandlers}
    >
      <TimelineBlock
        title={block.title}
        status={block.status}
        // 外层已按块矩形定位，此处填满容器
        topRatio={0}
        heightRatio={1}
        onPress={() => onBlockPress(block.id)}
        onLongPress={draggable ? beginDrag : undefined}
        delayLongPress={DRAG_LONG_PRESS_MS}
        continuationTop={continuationTop}
        continuationBottom={continuationBottom}
      />
    </Animated.View>
  )
}

/** 排期视图：时间轴 + 块 + 拖拽 + 对齐参考线 */
export function ScheduleTimeline({
  blocks,
  onDragStateChange,
  onReschedule,
  onBlockPress,
  dayDate,
  timezone,
}: ScheduleTimelineProps): React.JSX.Element {
  const styles = useThemedStyles(makeStyles)
  const [timelineWidthPx, setTimelineWidthPx] = useState(0)
  const [ghostStartMin, setGhostStartMin] = useState<number | null>(null)

  /** 实测根容器宽度作为时间轴宽度 */
  const handleLayout = useCallback((event: LayoutChangeEvent): void => {
    setTimelineWidthPx(event.nativeEvent.layout.width)
  }, [])

  /** 组合拖拽态回调：自身用于参考线显隐，同时透传给页面 */
  const handleDragStateChange = useCallback(
    (dragging: boolean): void => {
      onDragStateChange?.(dragging)
    },
    [onDragStateChange],
  )

  /** 每小时刻度（08:00 … 20:00） */
  const hourTicks = useMemo(
    () =>
      Array.from({ length: HOUR_TICK_COUNT }, (_unused, index) => ({
        minute: AXIS_START_MIN + index * MINUTES_PER_HOUR,
        top: index * HOUR_HEIGHT_PX,
      })),
    [],
  )

  /** 参考线顶部像素（钳制在时间轴范围内） */
  const guideTopPx = useMemo(() => {
    if (ghostStartMin === null) return 0
    const raw = minutesToPx(ghostStartMin - AXIS_START_MIN)
    return Math.max(0, Math.min(AXIS_HEIGHT_PX, raw))
  }, [ghostStartMin])

  /** 当天 00:00 的 UTC 时刻，作为分钟换算基准 */
  const dayStart = useMemo(() => startOfDay(dayDate, timezone), [dayDate, timezone])

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <View style={styles.axis}>
        {/* 背景层：每小时刻度 + 横向网格线 */}
        {hourTicks.map((tick) => (
          <View key={tick.minute} style={[styles.tickRow, { top: tick.top }]} pointerEvents="none">
            <Text style={[typography.label, styles.tickLabel]}>
              {formatHourLabel(tick.minute)}
            </Text>
            <View style={styles.tickLine} />
          </View>
        ))}

        {/* 块层：位于刻度列右侧 */}
        <View style={styles.blockArea} pointerEvents="box-none">
          {blocks.map((block) => {
            // 相对 dayDate 当天 00:00 的分钟差（复用 @/utils/date）
            const startMin = minutesBetween(dayStart, block.startAt)
            const durationMin = Math.max(
              SLOT_MINUTES,
              minutesBetween(block.startAt, block.endAt),
            )
            const rawTop = (startMin - AXIS_START_MIN) / AXIS_DURATION_MIN
            const rawHeight = durationMin / AXIS_DURATION_MIN
            const clampedTop = Math.max(0, Math.min(1, rawTop))
            const clampedHeight = Math.max(0, Math.min(1 - clampedTop, rawHeight))
            const continuationTop = startMin < AXIS_START_MIN
            const continuationBottom = startMin + durationMin > AXIS_END_MIN

            return (
              <DraggableBlock
                key={block.id}
                block={block}
                topRatio={clampedTop}
                heightRatio={clampedHeight}
                startMin={startMin}
                durationMin={durationMin}
                timelineWidthPx={timelineWidthPx}
                continuationTop={continuationTop}
                continuationBottom={continuationBottom}
                onDragStateChange={handleDragStateChange}
                onReschedule={onReschedule}
                onBlockPress={onBlockPress}
                onGhostChange={setGhostStartMin}
              />
            )
          })}

          {/* 对齐参考线：拖拽时显示在吸附后的起点 */}
          {ghostStartMin !== null ? (
            <View pointerEvents="none" style={[styles.guideLine, { top: guideTopPx }]} />
          ) : null}
        </View>
      </View>
    </View>
  )
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: {
    position: 'relative',
  },
  axis: {
    height: AXIS_HEIGHT_PX,
    position: 'relative',
  },
  tickRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tickLabel: {
    width: TIME_LABEL_WIDTH,
    color: colors.text.tertiary,
    textAlign: 'right',
    paddingRight: spacing.xs,
  },
  tickLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  blockArea: {
    position: 'absolute',
    left: TIME_LABEL_WIDTH,
    right: 0,
    top: 0,
    bottom: 0,
  },
  blockLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  // 个人任务块：主色描边，与团队任务块区分
  blockLayerPersonal: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
  },
  // 拖拽中：叠加浮动阴影并提升层级（阴影用静态样式切换，非动画）
  blockLayerDragging: {
    ...shadow.floating,
    zIndex: DRAGGING_Z_INDEX,
  },
  guideLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 0,
    borderTopWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
})
