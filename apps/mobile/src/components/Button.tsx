/**
 * 职责：统一按钮 —— 主 / 次 / 危险 / 警告 / 幽灵五种语义，内嵌细环 loading，按压 scale 0.97（ARCH §6 / §3.6）。
 */
import { Feather } from '@expo/vector-icons'
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { usePressScale } from '@/hooks/usePressScale'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { layout, radius, spacing, typography, type ThemeColors } from '@/theme'

/** 图标名（Feather 线性图标集） */
export type IconName = keyof typeof Feather.glyphMap

/** 按钮语义 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'warning' | 'ghost'

/** Button 入参 */
export interface ButtonProps {
  variant?: ButtonVariant
  size?: 'md' | 'lg'
  label: string
  onPress: () => void
  loading?: boolean
  disabled?: boolean
  icon?: IconName
  fullWidth?: boolean
}

/** 禁用态透明度 */
const DISABLED_OPACITY = 0.45
/** 按钮高度（md / lg） */
const HEIGHT_MD = 44
const HEIGHT_LG = 52

/** 统一按钮组件 */
export function Button({
  variant = 'primary',
  size = 'md',
  label,
  onPress,
  loading = false,
  disabled = false,
  icon,
  fullWidth = false,
}: ButtonProps): React.JSX.Element {
  const { colors } = useTheme()
  const styles = useThemedStyles(makeStyles)
  const variantStyles = useThemedStyles(makeVariantStyles)
  const press = usePressScale(0.97)
  const isDisabled = disabled || loading
  const isPrimaryLike = variant === 'primary' || variant === 'danger' || variant === 'warning'

  const labelColor = isPrimaryLike ? colors.text.inverse : variant === 'ghost' ? colors.primary : colors.text.primary
  const indicatorColor = isPrimaryLike ? colors.text.inverse : colors.primary

  return (
    <Animated.View
      style={[fullWidth ? styles.fullWidth : styles.autoWidth, press.animatedStyle]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        accessibilityLabel={label}
        onPress={onPress}
        onPressIn={isDisabled ? undefined : press.onPressIn}
        onPressOut={isDisabled ? undefined : press.onPressOut}
        disabled={isDisabled}
        style={[
          styles.base,
          size === 'lg' ? styles.heightLg : styles.heightMd,
          variantStyles[variant],
          isDisabled ? { opacity: DISABLED_OPACITY } : null,
        ]}
      >
        <View style={styles.content}>
          {loading ? (
            <ActivityIndicator size="small" color={indicatorColor} />
          ) : icon ? (
            <Feather name={icon} size={layout.icon.md} color={labelColor} style={styles.icon} />
          ) : null}
          <Text style={[typography.title, styles.label, { color: labelColor }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  )
}

/** 五种语义的容器样式（强调色面积克制：仅主/危险/警告用实底） */
const makeVariantStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    primary: {
      backgroundColor: colors.primary,
    },
    secondary: {
      backgroundColor: colors.bg.surface,
      borderWidth: 1,
      borderColor: colors.borderStrong,
    },
    danger: {
      backgroundColor: colors.danger,
    },
    warning: {
      backgroundColor: colors.warning,
    },
    ghost: {
      backgroundColor: 'transparent',
    },
  })

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    base: {
      borderRadius: radius.control,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    heightMd: {
      height: HEIGHT_MD,
    },
    heightLg: {
      height: HEIGHT_LG,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    icon: {
      marginRight: spacing.xs,
    },
    label: {
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
      fontWeight: '600',
    },
    fullWidth: {
      width: '100%',
    },
    autoWidth: {
      alignSelf: 'flex-start',
    },
  })
