/**
 * 职责：「已刷新」轻提示（增量 8 · Q8）—— 复用 `UndoToast` 的定位与动画手法，**无操作按钮**，
 * 默认 ~2s 自动消失；**不改 `UndoToast.tsx` 本体**。
 *
 * 自动消失：`visible` 为真后启动 `durationMs` 定时器，到点回调 `onHide`（由父级把 `visible` 置回假），
 * 从而支持「重复恢复」场景（`visible` 假 → 真 可再次触发）。
 */
import { Feather } from '@expo/vector-icons'
import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { layout, motion, radius, shadow, spacing, typography, type ThemeColors } from '@/theme'

/** RefreshToast 入参 */
export interface RefreshToastProps {
  /** 是否展示 */
  visible: boolean
  /** 文案（默认「网络已恢复，已刷新」） */
  message?: string
  /** 自动消失时长（毫秒，默认 2000） */
  durationMs?: number
  /** 到点回调（父级据此把 `visible` 置回假） */
  onHide?: () => void
}

/** 默认自动消失时长 */
const DEFAULT_DURATION_MS = 2000
/** 入场纵向位移 */
const ENTER_OFFSET = 24

/** 「已刷新」轻提示 */
export function RefreshToast({
  visible,
  message = '网络已恢复，已刷新',
  durationMs = DEFAULT_DURATION_MS,
  onHide,
}: RefreshToastProps): React.JSX.Element | null {
  const { colors } = useTheme()
  const styles = useThemedStyles(makeStyles)
  const translateY = useRef(new Animated.Value(ENTER_OFFSET)).current
  const opacity = useRef(new Animated.Value(0)).current
  const hideRef = useRef(onHide)
  hideRef.current = onHide

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null

    if (!visible) {
      animation = Animated.parallel([
        Animated.timing(translateY, {
          toValue: ENTER_OFFSET,
          duration: motion.duration.fast,
          easing: motion.easing.standard,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: motion.duration.fast,
          easing: motion.easing.standard,
          useNativeDriver: true,
        }),
      ])
      animation.start()
      return () => {
        animation?.stop()
      }
    }

    translateY.setValue(ENTER_OFFSET)
    opacity.setValue(0)
    animation = Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: motion.duration.base,
        easing: motion.easing.decelerate,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: motion.duration.base,
        easing: motion.easing.standard,
        useNativeDriver: true,
      }),
    ])
    animation.start()

    const timer = setTimeout(() => hideRef.current?.(), durationMs)
    return () => {
      animation?.stop()
      clearTimeout(timer)
    }
  }, [visible, durationMs, opacity, translateY])

  if (!visible) return null

  return (
    <Animated.View
      style={[styles.container, { opacity, transform: [{ translateY }] }]}
      pointerEvents="none"
    >
      <View style={styles.toast}>
        <Feather name="check-circle" size={layout.icon.sm} color={colors.text.inverse} />
        <Text style={[typography.caption, styles.message]} numberOfLines={2}>
          {message}
        </Text>
      </View>
    </Animated.View>
  )
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      position: 'absolute',
      left: layout.screenPadding,
      right: layout.screenPadding,
      bottom: spacing.lg,
    },
    toast: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: radius.card,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      ...shadow.floating,
    },
    message: {
      flex: 1,
      color: colors.text.inverse,
      marginLeft: spacing.xs,
    },
  })
