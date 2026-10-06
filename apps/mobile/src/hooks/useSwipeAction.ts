/**
 * 职责：右滑露出操作的 PanResponder hook（ARCH §10：零原生依赖，仅用 RN 内置能力）。
 * 仅在水平位移明显大于垂直位移时才接管手势，避免与列表纵向滚动冲突（R3）。
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { Animated, PanResponder, type GestureResponderHandlers } from 'react-native'
import { motion } from '@/theme'

/** 右滑操作项（SwipeableRow 与各页面共用同一契约） */
export interface SwipeAction {
  /** 唯一标识 */
  key: string
  /** 按钮文案 */
  label: string
  /** 语义色 */
  tone: 'primary' | 'success' | 'danger' | 'warning'
  /** 点击回调 */
  onPress: () => void
}

/** useSwipeAction 入参 */
export interface UseSwipeActionOptions {
  /** 操作项列表（决定可滑出的最大宽度） */
  actions: SwipeAction[]
  /** 单个操作按钮宽度 */
  actionWidth?: number
  /** 单次操作完成后的回调（用于关闭并通知父级） */
  onActionDone?: (key: string) => void
  /** 是否禁用右滑（例如加载中） */
  disabled?: boolean
}

/** useSwipeAction 返回值 */
export interface UseSwipeActionResult {
  /** 横向位移（0 → 最大宽度） */
  translateX: Animated.Value
  /** 是否已滑开 */
  open: boolean
  /** 是否正在拖动 */
  dragging: boolean
  /** 挂到可滑动容器上 */
  panHandlers: GestureResponderHandlers
  /** 关闭 */
  close: () => void
  /** 执行某个操作并关闭 */
  runAction: (action: SwipeAction) => void
}

/** 默认单个操作按钮宽度 */
const DEFAULT_ACTION_WIDTH = 76

/** 触发滑开的最小位移比例（相对最大宽度） */
const OPEN_THRESHOLD_RATIO = 0.4

/** 右滑快操作 hook */
export function useSwipeAction(options: UseSwipeActionOptions): UseSwipeActionResult {
  const { actions, actionWidth = DEFAULT_ACTION_WIDTH, onActionDone, disabled = false } = options
  const maxOffset = Math.max(0, actions.length * actionWidth)

  const translateX = useRef(new Animated.Value(0)).current
  const currentRef = useRef(0)
  const startRef = useRef(0)
  const [open, setOpen] = useState(false)
  const [dragging, setDragging] = useState(false)

  /** 用统一缓动动画到目标位置 */
  const animateTo = useCallback(
    (value: number) => {
      currentRef.current = value
      setOpen(value > 0)
      Animated.timing(translateX, {
        toValue: value,
        duration: motion.duration.base,
        easing: motion.easing.standard,
        useNativeDriver: true,
      }).start()
    },
    [translateX],
  )

  const close = useCallback(() => {
    animateTo(0)
  }, [animateTo])

  const runAction = useCallback(
    (action: SwipeAction) => {
      animateTo(0)
      onActionDone?.(action.key)
      action.onPress()
    },
    [animateTo, onActionDone],
  )

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // 仅在水平位移显著大于垂直位移、且向右滑动时接管手势
        onMoveShouldSetPanResponder: (_event, gesture) => {
          if (disabled || maxOffset === 0) return false
          const horizontal = Math.abs(gesture.dx)
          const vertical = Math.abs(gesture.dy)
          if (horizontal < 6) return false
          if (horizontal <= vertical * 1.5) return false
          return gesture.dx > 0 || currentRef.current > 0
        },
        onPanResponderGrant: () => {
          startRef.current = currentRef.current
          setDragging(true)
        },
        onPanResponderMove: (_event, gesture) => {
          const next = Math.min(maxOffset, Math.max(0, startRef.current + gesture.dx))
          currentRef.current = next
          translateX.setValue(next)
        },
        onPanResponderRelease: (_event, gesture) => {
          setDragging(false)
          const finalOffset = Math.min(maxOffset, Math.max(0, startRef.current + gesture.dx))
          const shouldOpen = finalOffset > maxOffset * OPEN_THRESHOLD_RATIO || gesture.vx > 0.4
          animateTo(shouldOpen ? maxOffset : 0)
        },
        onPanResponderTerminate: () => {
          setDragging(false)
          animateTo(0)
        },
        onPanResponderTerminationRequest: () => true,
      }),
    [animateTo, disabled, maxOffset, translateX],
  )

  return {
    translateX,
    open,
    dragging,
    panHandlers: panResponder.panHandlers,
    close,
    runAction,
  }
}
