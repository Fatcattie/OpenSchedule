/**
 * 职责：撤销 Toast —— 乐观更新后的「撤销」入口，默认 3s 自动失效（ARCH §7 链路②）。
 * 容器需为相对定位（页面根 View），Toast 自身绝对定位于底部。
 */
import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'
import { PressableScale } from './PressableScale'
import { useThemedStyles } from '@/store/ThemeProvider'
import { layout, motion, radius, shadow, spacing, typography, type ThemeColors } from '@/theme'

/** UndoToast 入参 */
export interface UndoToastProps {
  visible: boolean
  message: string
  onUndo: () => void
  /** 可撤销时长（毫秒，默认 3000） */
  durationMs?: number
  /** 超时未撤销时回调（父级据此提交乐观更新并隐藏） */
  onExpire?: () => void
}

/** 默认可撤销时长 */
const DEFAULT_DURATION_MS = 3000
/** 进度条高度 */
const PROGRESS_HEIGHT = 2

/** 撤销 Toast */
export function UndoToast({
  visible,
  message,
  onUndo,
  durationMs = DEFAULT_DURATION_MS,
  onExpire,
}: UndoToastProps): React.JSX.Element | null {
  const styles = useThemedStyles(makeStyles)
  const translateY = useRef(new Animated.Value(24)).current
  const opacity = useRef(new Animated.Value(0)).current
  const progress = useRef(new Animated.Value(1)).current
  const expireRef = useRef(onExpire)
  expireRef.current = onExpire

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null

    if (!visible) {
      animation = Animated.parallel([
        Animated.timing(translateY, {
          toValue: 24,
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

    translateY.setValue(24)
    opacity.setValue(0)
    progress.setValue(1)

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
      Animated.timing(progress, {
        toValue: 0,
        duration: durationMs,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    ])
    animation.start(({ finished }) => {
      if (finished) expireRef.current?.()
    })

    // 卸载或依赖变化（含 message 连续撤销）时停止动画，避免回调在卸载后触发 onExpire
    return () => {
      animation?.stop()
    }
  }, [durationMs, message, opacity, progress, translateY, visible])

  if (!visible) return null

  return (
    <Animated.View
      style={[styles.container, { opacity, transform: [{ translateY }] }]}
      pointerEvents="box-none"
    >
      <View style={styles.toast}>
        <Text style={[typography.caption, styles.message]} numberOfLines={2}>
          {message}
        </Text>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="撤销"
          onPress={onUndo}
          hitSlop={spacing.xs}
          scale={0.94}
          style={styles.action}
        >
          <Text style={[typography.label, styles.actionText]}>撤销</Text>
        </PressableScale>
      </View>
      <View style={styles.progressTrack}>
        <Animated.View
          style={[
            styles.progressFill,
            {
              width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            },
          ]}
        />
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
      justifyContent: 'space-between',
      backgroundColor: colors.primary,
      borderRadius: radius.card,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      ...shadow.floating,
    },
    message: {
      flex: 1,
      color: colors.text.inverse,
      marginRight: spacing.sm,
    },
    action: {
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.xxs,
      borderRadius: radius.pill,
      // hex-alpha 派生：必须在工厂内（渲染期）求值，随当前 colors 变化
      backgroundColor: `${colors.text.inverse}22`,
    },
    actionText: {
      color: colors.text.inverse,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    progressTrack: {
      height: PROGRESS_HEIGHT,
      borderRadius: radius.pill,
      // hex-alpha 派生：必须在工厂内（渲染期）求值
      backgroundColor: `${colors.text.inverse}33`,
      marginTop: spacing.xxs,
      overflow: 'hidden',
    },
    progressFill: {
      height: PROGRESS_HEIGHT,
      backgroundColor: colors.text.inverse,
      borderRadius: radius.pill,
    },
  })
