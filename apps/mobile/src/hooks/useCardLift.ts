/**
 * 职责：卡片「按下浮起」反馈 hook —— 按下向上位移 + 轻微放大 + 阴影增强（ARCH §3.6）。
 *
 * 设计要点（务必理解，勿改成直接动画 `shadow*`）：
 * - **只驱动 `transform` 与 `opacity` 两个属性**，二者都能走原生驱动，故可
 *   `useNativeDriver: true` 保持顺滑；`shadowOffset` 是对象、`Animated` 无法插值，
 *   且混用原生 / JS 驱动会带来兼容问题，因此**阴影本身不做插值**。
 * - 阴影增强改用「一个静态的大阴影层（`shadow.cardLift`）+ 透明度交叉淡入」表现，
 *   视觉等价且性能更好。这正是 `shadow.cardLift.shadowOffset` 必须与 `shadow.card`
 *   一致的原因：保证两个阴影同心，交叉淡入时不会看到偏移跳动。
 * - 悬停（Web）不得覆盖按下态：以 `pressedRef` 记录是否按下，悬停回调仅在未按下时生效。
 */
import { useCallback, useMemo, useRef } from 'react'
import { Animated, type ViewStyle } from 'react-native'
import { motion } from '@/theme'

/** useCardLift 返回值 */
export interface UseCardLiftResult {
  /** 挂到卡片最外层 Animated.View（位移 + 缩放） */
  wrapStyle: Animated.WithAnimatedObject<ViewStyle>
  /** 挂到「浮动阴影层」（绝对定位、位于卡片本体之后；仅透明度变化） */
  shadowStyle: Animated.WithAnimatedObject<ViewStyle>
  /** 按下：浮起 */
  onPressIn: () => void
  /** 抬起：回落 */
  onPressOut: () => void
  /** 悬停进入（Web）：未按下时浮至 hoverRatio 强度 */
  onHoverIn: () => void
  /** 悬停离开（Web）：未按下时回落 */
  onHoverOut: () => void
}

/** 禁用（enabled === false）时的恒等包裹样式（模块级常量，保持稳定引用） */
const IDENTITY_WRAP_STYLE: Animated.WithAnimatedObject<ViewStyle> = {
  transform: [{ translateY: 0 }, { scale: 1 }],
}

/** 禁用时的恒等阴影样式（模块级常量，保持稳定引用） */
const IDENTITY_SHADOW_STYLE: Animated.WithAnimatedObject<ViewStyle> = { opacity: 0 }

/** 禁用时的空回调（模块级常量，保持稳定引用） */
const NOOP = (): void => undefined

/**
 * 卡片按下浮起反馈。
 * 内部以一个 `Animated.Value`（0 = 静止，1 = 完全浮起）驱动位移 / 缩放 / 阴影透明度。
 * @param enabled 是否启用（默认 true）；为 false 时返回恒等样式与空回调，样式引用保持稳定
 */
export function useCardLift(enabled = true): UseCardLiftResult {
  const progress = useRef(new Animated.Value(0)).current
  const pressedRef = useRef(false)

  const animate = useCallback(
    (toValue: number) => {
      Animated.spring(progress, {
        toValue,
        damping: motion.lift.spring.damping,
        stiffness: motion.lift.spring.stiffness,
        mass: motion.lift.spring.mass,
        useNativeDriver: true,
      }).start()
    },
    [progress],
  )

  const wrapStyle = useMemo<Animated.WithAnimatedObject<ViewStyle>>(() => {
    const translateY = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -motion.lift.offset],
    })
    const scale = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [1, motion.lift.scale],
    })
    return { transform: [{ translateY }, { scale }] }
  }, [progress])

  const shadowStyle = useMemo<Animated.WithAnimatedObject<ViewStyle>>(() => {
    const opacity = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    })
    return { opacity }
  }, [progress])

  const onPressIn = useCallback(() => {
    pressedRef.current = true
    animate(1)
  }, [animate])

  const onPressOut = useCallback(() => {
    pressedRef.current = false
    animate(0)
  }, [animate])

  const onHoverIn = useCallback(() => {
    if (pressedRef.current) return
    animate(motion.lift.hoverRatio)
  }, [animate])

  const onHoverOut = useCallback(() => {
    if (pressedRef.current) return
    animate(0)
  }, [animate])

  if (!enabled) {
    return {
      wrapStyle: IDENTITY_WRAP_STYLE,
      shadowStyle: IDENTITY_SHADOW_STYLE,
      onPressIn: NOOP,
      onPressOut: NOOP,
      onHoverIn: NOOP,
      onHoverOut: NOOP,
    }
  }

  return { wrapStyle, shadowStyle, onPressIn, onPressOut, onHoverIn, onHoverOut }
}
