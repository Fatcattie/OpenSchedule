/**
 * 职责：可点元素统一按压反馈 —— 扩展 RN `Pressable`，作为其「可直接替换」的封装。
 *
 * 设计要点（与 Card / Button 的既有手法同源，动画仅用 RN 内置 Animated，禁用第三方库）：
 * - 复用 `usePressScale` 提供缩放反馈（默认 0.97）；
 * - `pressedBg` 按下时叠加底色（可选），用于全宽行的「落点感」；
 * - 通过 `Animated.createAnimatedComponent(Pressable)` 让缩放变换**直接作用于 Pressable 自身**，
 *   从而完整保留任意布局语义（全宽行 / flex:1 栅格 / 绝对定位 FAB / 时间轴块）——
 *   若改为「外层 Animated.View 包裹」，会破坏绝对定位与 flex 主轴尺寸，故不采用。
 */
import { useCallback, useState } from 'react'
import {
  Animated,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { usePressScale } from '@/hooks/usePressScale'

/** RN 内置 Animated 包裹的 Pressable（scale 变换直接作用于 Pressable 自身） */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/** PressableScale 入参：完全兼容 Pressable（style 仅支持静态样式），另增 scale / pressedBg */
export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  /** 按下时的缩放比例（默认 0.97；全宽行传 1 表示只做底色不做缩放） */
  scale?: number
  /** 按下时叠加的底色（可选；不传则只做缩放） */
  pressedBg?: string
  /** 静态样式（布局 / 视觉），与 Pressable 的静态 style 等价 */
  style?: StyleProp<ViewStyle>
}

/**
 * 可点元素按压反馈容器（drop-in 替换 `<Pressable>`）。
 * 缩放与底色均不影响原布局：`style` 原样作用于 Pressable 自身。
 */
export function PressableScale({
  scale = 0.97,
  pressedBg,
  style,
  onPressIn,
  onPressOut,
  disabled,
  children,
  ...rest
}: PressableScaleProps): React.JSX.Element {
  const press = usePressScale(scale)
  const [pressed, setPressed] = useState(false)

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      setPressed(true)
      press.onPressIn()
      onPressIn?.(event)
    },
    [onPressIn, press],
  )

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      setPressed(false)
      press.onPressOut()
      onPressOut?.(event)
    },
    [onPressOut, press],
  )

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, pressed && pressedBg ? { backgroundColor: pressedBg } : null, press.animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  )
}
