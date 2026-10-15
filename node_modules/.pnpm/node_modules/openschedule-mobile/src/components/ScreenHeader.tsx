/**
 * 职责：页头 —— 标题 / 副标题 / 返回 / 右侧动作（ARCH §6）。
 * 顶部内边距包含安全区，左边缘对齐页面 lg(20)。
 * 返回按钮接入按压反馈：缩小 0.92 + 按下淡色圆底，让点击有落点感。
 */
import { Feather } from '@expo/vector-icons'
import type { ReactNode } from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePressScale } from '@/hooks/usePressScale'
import { useT } from '@/store/I18nProvider'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { layout, radius, spacing, typography, type ThemeColors } from '@/theme'
/** ScreenHeader 入参 */
export interface ScreenHeaderProps {
  title: string
  subtitle?: string
  onBack?: () => void
  right?: ReactNode
  /** 大标题模式（一级页用 display 字号） */
  large?: boolean
}

/** 返回按钮点击热区 */
const BACK_HIT_SIZE = 36
/** 返回按钮按压缩放（图标按钮体积小，缩放略强以强化反馈） */
const BACK_PRESS_SCALE = 0.92

/** 页头组件 */
export function ScreenHeader({ title, subtitle, onBack, right, large = false }: ScreenHeaderProps): React.JSX.Element {
  const { colors } = useTheme()
  const t = useT()
  const styles = useThemedStyles(makeStyles)
  const insets = useSafeAreaInsets()
  const backPress = usePressScale(BACK_PRESS_SCALE)

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.row}>
        {onBack ? (
          <Animated.View style={[styles.backWrap, backPress.animatedStyle]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              onPress={onBack}
              onPressIn={backPress.onPressIn}
              onPressOut={backPress.onPressOut}
              style={({ pressed }) => [styles.backButton, pressed ? styles.backButtonPressed : null]}
              hitSlop={spacing.xs}
            >
              <Feather name="chevron-left" size={layout.icon.lg} color={colors.text.primary} />
            </Pressable>
          </Animated.View>
        ) : null}
        <View style={styles.titleBlock}>
          <Text
            style={[large ? typography.display : typography.title, styles.title]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text style={[typography.caption, styles.subtitle]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  )
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: layout.screenPadding,
      paddingBottom: spacing.sm,
      backgroundColor: colors.bg.base,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: layout.icon.lg + spacing.md,
    },
    backWrap: {
      marginLeft: -spacing.xs,
      marginRight: spacing.xxs,
    },
    backButton: {
      width: BACK_HIT_SIZE,
      height: BACK_HIT_SIZE,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backButtonPressed: {
      backgroundColor: colors.primaryFaint,
    },
    titleBlock: {
      flex: 1,
      justifyContent: 'center',
    },
    title: {
      color: colors.text.primary,
    },
    subtitle: {
      color: colors.text.secondary,
      marginTop: spacing.xxs,
    },
    right: {
      marginLeft: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
    },
  })
