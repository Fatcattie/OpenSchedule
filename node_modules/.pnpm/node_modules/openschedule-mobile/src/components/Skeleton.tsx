/**
 * 职责：骨架块 —— shimmer 1200ms 循环，替代 loading 转圈（ARCH §3.6 / §10）。
 */
import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { useThemedStyles } from '@/store/ThemeProvider'
import { motion, radius, type ThemeColors } from '@/theme'

/** Skeleton 入参 */
export interface SkeletonProps {
  width?: number | `${number}%`
  height?: number
  radius?: number
  style?: StyleProp<ViewStyle>
}

/** 默认尺寸 */
const DEFAULT_HEIGHT = 14
/** shimmer 透明度区间 */
const SHIMMER_MIN = 0.45
const SHIMMER_MAX = 1

/** 骨架块 */
export function Skeleton({
  width = '100%',
  height = DEFAULT_HEIGHT,
  radius: radiusValue = radius.sm,
  style,
}: SkeletonProps): React.JSX.Element {
  const styles = useThemedStyles(makeStyles)
  const opacity = useRef(new Animated.Value(SHIMMER_MIN)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: SHIMMER_MAX,
          duration: motion.skeletonShimmer / 2,
          easing: motion.easing.standard,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: SHIMMER_MIN,
          duration: motion.skeletonShimmer / 2,
          easing: motion.easing.standard,
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [opacity])

  return (
    <Animated.View
      style={[
        styles.base,
        { width, height, borderRadius: radiusValue, opacity },
        style,
      ]}
    />
  )
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    base: {
      backgroundColor: colors.bg.subtle,
    },
  })
