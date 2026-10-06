/**
 * 职责：头像 —— 首字母兜底 + 可选品牌渐变环（ARCH §6 / §3.7-6：渐变仅用于头像环与登录头）。
 */
import { Image, StyleSheet, Text, View } from 'react-native'
import { BrandGradient } from './BrandGradient'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { radius, typography, type ThemeColors } from '@/theme'
import { initialsOf } from '@/utils/format'

/** Avatar 入参 */
export interface AvatarProps {
  name: string
  uri?: string | null
  size?: 32 | 40 | 56
  /** 是否显示品牌渐变环 */
  ring?: boolean
}

/** 品牌环宽度 */
const RING_WIDTH = 2

/** 头像组件 */
export function Avatar({ name, uri, size = 40, ring = false }: AvatarProps): React.JSX.Element {
  const { colors } = useTheme()
  const styles = useThemedStyles(makeStyles)
  const fontSize = Math.round(size * 0.4)

  const inner = (
    <View
      style={[
        styles.inner,
        {
          width: ring ? size - RING_WIDTH * 2 : size,
          height: ring ? size - RING_WIDTH * 2 : size,
          borderRadius: radius.pill,
        },
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={[
            styles.image,
            {
              width: ring ? size - RING_WIDTH * 2 : size,
              height: ring ? size - RING_WIDTH * 2 : size,
              borderRadius: radius.pill,
            },
          ]}
        />
      ) : (
        <Text style={[typography.title, { fontSize, lineHeight: fontSize + 4, color: colors.primary }]}>
          {initialsOf(name)}
        </Text>
      )}
    </View>
  )

  if (!ring) return inner

  return (
    <BrandGradient
      direction="horizontal"
      steps={12}
      style={[styles.ring, { width: size, height: size, borderRadius: radius.pill }]}
    >
      <View style={styles.ringCenter}>{inner}</View>
    </BrandGradient>
  )
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    inner: {
      backgroundColor: colors.primaryFaint,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    image: {
      resizeMode: 'cover',
    },
    ring: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    ringCenter: {
      backgroundColor: colors.bg.surface,
      borderRadius: radius.pill,
      padding: RING_WIDTH,
    },
  })
