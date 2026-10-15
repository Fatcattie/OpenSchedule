/**
 * 职责：排期视图块的**拖拽重排** hook —— 零原生依赖，仅用 RN 内置 Animated / PanResponder
 * （PRD §7.2.1 / ARCH §10 铁律：禁用一切第三方手势 / 动画库）。
 *
 * 结构照抄 useSwipeAction：useMemo + PanResponder.create + useRef 同步最新值 + useCallback 动画函数。
 *
 * 手势语义（主理人裁定 ①）：
 * - 长按进入拖拽态（组件在块长按时调用 beginDrag）；
 * - 绝不抢初始触摸（onStartShouldSetPanResponder 恒 false），仅在已进入拖拽态后接管移动；
 * - 越界一律钳制（resolveDrop），取消只由 isCancelDrag 两情形触发（上滑 ≥ 56px / 水平拖出时间轴）；
 * - translateY / scale 走 useNativeDriver；阴影切换交由组件用 dragging 布尔切静态样式（native driver 不支持阴影动画）。
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { Animated, PanResponder, type GestureResponderHandlers } from 'react-native'
import { motion } from '@/theme'
import { isCancelDrag, minutesToPx, resolveDrop, type DropResult } from '@/utils/schedule'

/** useDragReschedule 入参 */
export interface UseDragRescheduleOptions {
  /** 原起点（分钟，相对当天 00:00） */
  originStartMin: number
  /** 时长（分钟，恒定不变） */
  durationMin: number
  /** 时间轴可视宽度（px），用于水平越界取消判定 */
  timelineWidthPx?: number
  /** 拖拽态变化回调（页面据此控制 ScrollView scrollEnabled） */
  onDragStateChange?: (dragging: boolean) => void
  /** 松手且未取消时的回调 */
  onDrop: (result: DropResult) => void
  /** 是否可拖（团队任务块传 false） */
  enabled?: boolean
}

/** useDragReschedule 返回值 */
export interface UseDragRescheduleResult {
  /** 垂直位移（吸附后的像素） */
  translateY: Animated.Value
  /** 缩放（拖拽态 1.05） */
  scale: Animated.Value
  /** 是否处于拖拽态 */
  dragging: boolean
  /** 挂到块容器上 */
  panHandlers: GestureResponderHandlers
  /** 长按触发，进入拖拽态 */
  beginDrag: () => void
  /** 动画回原位（不落库） */
  reset: () => void
}

/** 拖拽态缩放比（PRD 视觉：块微微放大） */
const DRAG_SCALE = 1.05

/** 接管纵向拖拽的最小位移（px），避免误触发 */
const MOVE_ACTIVATE_PX = 2

/** 排期块拖拽重排 hook */
export function useDragReschedule(options: UseDragRescheduleOptions): UseDragRescheduleResult {
  const {
    originStartMin,
    durationMin,
    timelineWidthPx = 0,
    onDragStateChange,
    onDrop,
    enabled = true,
  } = options

  const translateY = useRef(new Animated.Value(0)).current
  const scale = useRef(new Animated.Value(1)).current
  const [dragging, setDragging] = useState(false)

  // PanResponder 回调闭包不随 state 更新，用 ref 同步最新值
  const draggingRef = useRef(false)
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const originStartRef = useRef(originStartMin)
  originStartRef.current = originStartMin
  const durationRef = useRef(durationMin)
  durationRef.current = durationMin
  const timelineWidthRef = useRef(timelineWidthPx)
  timelineWidthRef.current = timelineWidthPx
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop
  const onDragStateChangeRef = useRef(onDragStateChange)
  onDragStateChangeRef.current = onDragStateChange

  /** scale 弹回 1（统一 spring 参数取自 theme token） */
  const settleScale = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      ...motion.spring.sheet,
      useNativeDriver: true,
    }).start()
  }, [scale])

  /** 收尾：退出拖拽态、scale 归位、通知父级 */
  const finishDrag = useCallback(() => {
    draggingRef.current = false
    setDragging(false)
    settleScale()
    onDragStateChangeRef.current?.(false)
  }, [settleScale])

  /** 动画回原位（取消 / 手势被终止，均不落库） */
  const reset = useCallback(() => {
    Animated.timing(translateY, {
      toValue: 0,
      duration: motion.duration.base,
      easing: motion.easing.standard,
      useNativeDriver: true,
    }).start()
    finishDrag()
  }, [finishDrag, translateY])

  /** 长按进入拖拽态（enabled 为 false 时直接返回，团队任务块无响应） */
  const beginDrag = useCallback(() => {
    if (!enabledRef.current) return
    draggingRef.current = true
    setDragging(true)
    Animated.spring(scale, {
      toValue: DRAG_SCALE,
      ...motion.spring.sheet,
      useNativeDriver: true,
    }).start()
    onDragStateChangeRef.current?.(true)
  }, [scale])

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // 绝不抢初始触摸，否则长按 / 点击都会失效
        onStartShouldSetPanResponder: () => false,
        // 仅在已进入拖拽态、且垂直位移明显时才接管（用 ref 读取最新 dragging）
        onMoveShouldSetPanResponder: (_event, gesture) =>
          draggingRef.current && Math.abs(gesture.dy) > MOVE_ACTIVATE_PX,
        // 拖拽中不被父级抢走手势
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_event, gesture) => {
          // 必须用吸附后的值，视觉上块即落在 30 分钟格上
          const result = resolveDrop(originStartRef.current, gesture.dy, durationRef.current)
          translateY.setValue(minutesToPx(result.startMin - originStartRef.current))
        },
        onPanResponderRelease: (_event, gesture) => {
          const cancelled = isCancelDrag(originStartRef.current, gesture.dy, durationRef.current, {
            dxPx: gesture.dx,
            timelineWidthPx: timelineWidthRef.current,
          })
          if (cancelled) {
            reset()
            return
          }
          onDropRef.current(resolveDrop(originStartRef.current, gesture.dy, durationRef.current))
          // 父级将按新位置重渲染，位移立即复位避免叠加
          translateY.setValue(0)
          finishDrag()
        },
        onPanResponderTerminate: () => {
          reset()
        },
      }),
    [finishDrag, reset, translateY],
  )

  return {
    translateY,
    scale,
    dragging,
    panHandlers: panResponder.panHandlers,
    beginDrag,
    reset,
  }
}
