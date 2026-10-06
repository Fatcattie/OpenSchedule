/**
 * 职责：线性进度条 —— 项目完成度可视化（ARCH §6）。
 * 颜色仅取 primary / success 两档，宽度按 0..1 比例。
 */
import { StyleSheet, View } from 'react-native'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { radius, type ThemeColors } from '@/theme'

/** ProgressBar 入参 */
export interface ProgressBarProps {
  /** 0..1 */
  value: number
  height?: number
  tone?: 'primary' | 'success'
}

/** 默认条高 */
const DEFAULT_HEIGHT = 6

/** 线性进度条 */
export function ProgressBar({ value, height = DEFAULT_HEIGHT, tone = 'primary' }: ProgressBarProps): React.JSX.Element {
  const { colors } = useTheme()
  const styles = useThemedStyles(makeStyles)
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  const fillColor = tone === 'success' ? colors.success : colors.primary

  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      <View
        style={[
          styles.fill,
          {
            width: `${clamped * 100}%`,
            height,
            borderRadius: height / 2,
            backgroundColor: fillColor,
          },
        ]}
      />
    </View>
  )
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    track: {
      width: '100%',
      backgroundColor: colors.bg.subtle,
      borderRadius: radius.pill,
      overflow: 'hidden',
    },
    fill: {
      // 颜色与高度由 props 注入
    },
  })
