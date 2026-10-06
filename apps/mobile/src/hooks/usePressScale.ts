/**
 * 职责：按压反馈 hook —— 按下缩至 0.97、spring 跟手回弹（ARCH §3.6 / §3.7-11）。
 * 供 Button / Card / 各类可点卡片复用，保证全站按压手感一致。
 */
import { useCallback, useMemo, useRef } from 'react'
import { Animated, type ViewStyle } from 'react-native'
import { motion } from '@/theme'

/** usePressScale 返回值 */
export interface UsePressScaleResult {
  /** 缩放值（1 → to） */
  scale: Animated.Value
  /** 直接挂到 Animated.View 上的样式 */
  animatedStyle: { transform: { scale: Animated.Value }[] }
  /** 按下 */
  onPressIn: () => void
  /** 抬起 */
  onPressOut: () => void
}

/**
 * 按压缩放反馈。
 * 使用 `motion.spring.press`（临界附近阻尼）驱动，按下与抬起都走 spring，
 * 手感「跟手 + 回弹自然」；因位移量极小（scale 1↔0.97），肉眼无过冲弹跳。
 * @param to 按下时的缩放比例（默认 0.97）
 */
export function usePressScale(to = 0.97): UsePressScaleResult {
  const scale = useRef(new Animated.Value(1)).current

  const animate = useCallback(
    (value: number) => {
      Animated.spring(scale, {
        toValue: value,
        damping: motion.spring.press.damping,
        stiffness: motion.spring.press.stiffness,
        mass: motion.spring.press.mass,
        useNativeDriver: true,
      }).start()
    },
    [scale],
  )

  const animatedStyle = useMemo<{ transform: { scale: Animated.Value }[] }>(
    () => ({ transform: [{ scale }] }),
    [scale],
  )

  return {
    scale,
    animatedStyle,
    onPressIn: () => animate(to),
    onPressOut: () => animate(1),
  }
}

/** 供组件内联使用的空样式常量（避免重复创建对象） */
export const EMPTY_VIEW_STYLE: ViewStyle = {}
