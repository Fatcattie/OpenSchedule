/**
 * 职责：分段控件 —— 横向滑动指示器跟随选中项（ARCH §6 / PRD 6.3）。
 * 指示器用 Animated 位移，缓动统一 bezier(0.2,0,0,1)，220ms。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { useThemedStyles } from '@/store/ThemeProvider'
import { motion, radius, shadow, spacing, typography, type ThemeColors } from '@/theme'

/** 分段选项 */
export interface SegmentedControlOption<T extends string> {
  value: T
  label: string
  /** 可选角标数量 */
  badge?: number
}

/** SegmentedControl 入参 */
export interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[]
  value: T
  onChange: (value: T) => void
}

/** 轨道内边距 */
const TRACK_PADDING = 4
/** 分段高度 */
const SEGMENT_HEIGHT = 36

/** 分段控件 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>): React.JSX.Element {
  const styles = useThemedStyles(makeStyles)
  const [trackWidth, setTrackWidth] = useState(0)
  const indexAnim = useRef(new Animated.Value(0)).current
  const activeIndex = Math.max(0, options.findIndex((option) => option.value === value))
  const segmentWidth = trackWidth > 0 ? trackWidth / Math.max(1, options.length) : 0

  useEffect(() => {
    Animated.timing(indexAnim, {
      toValue: activeIndex,
      duration: motion.duration.base,
      easing: motion.easing.standard,
      useNativeDriver: true,
    }).start()
  }, [activeIndex, indexAnim])

  const translateX = useMemo(
    () =>
      indexAnim.interpolate({
        inputRange: [0, Math.max(1, options.length - 1)],
        outputRange: [0, segmentWidth * Math.max(0, options.length - 1)],
        extrapolate: 'clamp',
      }),
    [indexAnim, options.length, segmentWidth],
  )

  return (
    <View style={styles.container}>
      <View
        style={styles.track}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      >
        {segmentWidth > 0 ? (
          <Animated.View
            style={[
              styles.indicator,
              { width: segmentWidth, transform: [{ translateX }] },
            ]}
            pointerEvents="none"
          />
        ) : null}
        {options.map((option) => {
          const active = option.value === value
          return (
            <Pressable
              key={option.value}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(option.value)}
              style={styles.segment}
            >
              <Text
                style={[typography.caption, styles.label, active ? styles.labelActive : styles.labelIdle]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
              {typeof option.badge === 'number' && option.badge > 0 ? (
                <View style={[styles.badge, active ? styles.badgeActive : styles.badgeIdle]}>
                  <Text
                    style={[
                      typography.label,
                      styles.badgeText,
                      active ? styles.badgeTextActive : styles.badgeTextIdle,
                    ]}
                  >
                    {option.badge}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: {
    backgroundColor: colors.bg.subtle,
    borderRadius: radius.control,
    padding: TRACK_PADDING,
  },
  track: {
    flexDirection: 'row',
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.bg.surface,
    borderRadius: radius.control,
    ...shadow.card,
  },
  segment: {
    flex: 1,
    height: SEGMENT_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxs,
  },
  label: {
    fontWeight: '600',
  },
  labelActive: {
    color: colors.primary,
  },
  labelIdle: {
    color: colors.text.secondary,
  },
  badge: {
    marginLeft: spacing.xxs,
    minWidth: spacing.md,
    paddingHorizontal: spacing.xxs,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeActive: {
    backgroundColor: colors.primaryFaint,
  },
  badgeIdle: {
    backgroundColor: colors.border,
  },
  badgeText: {
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight,
  },
  badgeTextActive: {
    color: colors.primary,
  },
  badgeTextIdle: {
    color: colors.text.secondary,
  },
})
