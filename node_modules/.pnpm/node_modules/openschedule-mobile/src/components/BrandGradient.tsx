/**
 * 职责：品牌渐变容器 —— 零依赖实现线性渐变（多层色带插值），
 * 仅用于品牌区（登录头部 / 头像环），正文与卡片禁用渐变（ARCH §3.7-6）。
 */
import { useMemo, type ReactNode } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useTheme } from '@/store/ThemeProvider'

/** 渐变方向 */
export type GradientDirection = 'vertical' | 'horizontal'

/** BrandGradient 入参 */
export interface BrandGradientProps {
  /** 渐变色列表（缺省时取当前生效色板的品牌渐变） */
  gradient?: string[]
  /** 方向（默认纵向） */
  direction?: GradientDirection
  /** 色带数量（越多越平滑，默认 24） */
  steps?: number
  /** 容器样式 */
  style?: StyleProp<ViewStyle>
  /** 内容 */
  children?: ReactNode
}

/** 解析 #RRGGBB 为 RGB 分量 */
function parseHex(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '')
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized
  const int = Number.parseInt(full, 16)
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}

/** RGB 分量转 #RRGGBB */
function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`
}

/** 在两个颜色之间线性插值 */
function lerpColor(from: string, to: string, ratio: number): string {
  const [r1, g1, b1] = parseHex(from)
  const [r2, g2, b2] = parseHex(to)
  return toHex([r1 + (r2 - r1) * ratio, g1 + (g2 - g1) * ratio, b1 + (b2 - b1) * ratio])
}

/** 按色标数量生成插值色带 */
function buildPalette(gradient: string[], steps: number): string[] {
  if (gradient.length === 0) return []
  if (gradient.length === 1) return new Array(steps).fill(gradient[0])
  const safeSteps = Math.max(2, steps)
  const segments = gradient.length - 1
  const palette: string[] = []
  for (let index = 0; index < safeSteps; index += 1) {
    const position = (index / (safeSteps - 1)) * segments
    const segmentIndex = Math.min(segments - 1, Math.floor(position))
    const ratio = position - segmentIndex
    palette.push(lerpColor(gradient[segmentIndex], gradient[segmentIndex + 1], ratio))
  }
  return palette
}

/** 品牌渐变容器 */
export function BrandGradient({
  gradient,
  direction = 'vertical',
  steps = 24,
  style,
  children,
}: BrandGradientProps): React.JSX.Element {
  // 增量 10（C4）：默认渐变改为运行时取色（浅 / 深品牌渐变随主题切换）
  const { colors } = useTheme()
  const resolvedGradient = gradient ?? colors.brandGradient
  const palette = useMemo(() => buildPalette(resolvedGradient, steps), [resolvedGradient, steps])

  return (
    <View style={[styles.root, style]}>
      <View
        style={[StyleSheet.absoluteFill, direction === 'vertical' ? styles.column : styles.row]}
        pointerEvents="none"
      >
        {palette.map((color, index) => (
          <View key={`${color}-${index}`} style={[styles.band, { backgroundColor: color }]} />
        ))}
      </View>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
  },
  band: {
    flex: 1,
  },
  column: {
    flexDirection: 'column',
  },
  row: {
    flexDirection: 'row',
  },
})
