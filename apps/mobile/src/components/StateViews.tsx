/**
 * 职责：空态 / 加载态 / 错误态三态统一样式（ARCH §10）。
 * 统一内边距 xl(24)、文案 caption、错误必带「重试」；列表加载用骨架屏替代转圈。
 */
import { Feather } from '@expo/vector-icons'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { Button, type IconName } from './Button'
import { Skeleton } from './Skeleton'
import { useT } from '@/store/I18nProvider'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { layout, radius, spacing, typography, type ThemeColors } from '@/theme'

/** 加载态入参 */
export interface LoadingViewProps {
  /** spinner 用于局部加载；skeleton 用于列表首屏（默认） */
  variant?: 'spinner' | 'skeleton'
  /** 骨架屏重复的卡片数量 */
  skeletonCount?: number
}

/** 骨架卡高度 */
const SKELETON_CARD_HEIGHT = 84
/** 骨架行高 */
const SKELETON_LINE_HEIGHT = 14

/** 加载态：骨架屏（默认）或细环 */
export function LoadingView({ variant = 'skeleton', skeletonCount = 3 }: LoadingViewProps): React.JSX.Element {
  const { colors } = useTheme()
  const styles = useThemedStyles(makeStyles)
  if (variant === 'spinner') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    )
  }

  return (
    <View style={styles.skeletonList}>
      {Array.from({ length: Math.max(1, skeletonCount) }).map((_, index) => (
        <View key={`skeleton-${index}`} style={styles.skeletonCard}>
          <View style={styles.skeletonRow}>
            <Skeleton width="55%" height={SKELETON_LINE_HEIGHT} />
            <Skeleton width={56} height={SKELETON_LINE_HEIGHT} radius={radius.pill} />
          </View>
          <Skeleton width="80%" height={SKELETON_LINE_HEIGHT} style={styles.skeletonGap} />
          <Skeleton width="35%" height={SKELETON_LINE_HEIGHT} style={styles.skeletonGap} />
        </View>
      ))}
    </View>
  )
}

/** 空态入参 */
export interface EmptyStateProps {
  icon?: IconName
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

/** 空态 */
export function EmptyState({
  icon = 'inbox',
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps): React.JSX.Element {
  const { colors } = useTheme()
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.center}>
      <View style={styles.iconCircle}>
        <Feather name={icon} size={layout.icon.lg} color={colors.text.tertiary} />
      </View>
      <Text style={[typography.title, styles.title]}>{title}</Text>
      {description ? (
        <Text style={[typography.caption, styles.description]}>{description}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <Button label={actionLabel} variant="secondary" onPress={onAction} />
        </View>
      ) : null}
    </View>
  )
}

/** 错误态入参 */
export interface ErrorStateProps {
  message?: string
  onRetry: () => void
}

/** 错误态 */
export function ErrorState({ message, onRetry }: ErrorStateProps): React.JSX.Element {
  const { colors } = useTheme()
  const t = useT()
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.center}>
      <View style={[styles.iconCircle, styles.iconCircleDanger]}>
        <Feather name="alert-circle" size={layout.icon.lg} color={colors.danger} />
      </View>
      <Text style={[typography.title, styles.title]}>{t('component.error.title')}</Text>
      <Text style={[typography.caption, styles.description]}>
        {message ?? t('component.error.description')}
      </Text>
      <View style={styles.action}>
        <Button label={t('common.retry')} variant="secondary" icon="refresh-cw" onPress={onRetry} />
      </View>
    </View>
  )
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    center: {
      paddingVertical: spacing.xxl,
      paddingHorizontal: spacing.xl,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconCircle: {
      width: spacing.xxxl + spacing.xs,
      height: spacing.xxxl + spacing.xs,
      borderRadius: radius.pill,
      backgroundColor: colors.bg.subtle,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    iconCircleDanger: {
      // 危险色 8% 淡底：由模块级常量移入工厂，随当前 colors 求值（C9）
      backgroundColor: `${colors.danger}14`,
    },
    title: {
      color: colors.text.primary,
      textAlign: 'center',
    },
    description: {
      color: colors.text.secondary,
      textAlign: 'center',
      marginTop: spacing.xs,
    },
    action: {
      marginTop: spacing.md,
    },
    skeletonList: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xs,
    },
    skeletonCard: {
      backgroundColor: colors.bg.surface,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: colors.border,
      padding: layout.cardPadding,
      marginBottom: layout.cardGap,
      minHeight: SKELETON_CARD_HEIGHT,
      justifyContent: 'center',
    },
    skeletonRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    skeletonGap: {
      marginTop: spacing.sm,
    },
  })
