/**
 * 职责：缓存标记（增量 8 · M-P1-06-06 / A3）—— 各屏数据区顶部、仅在「离线且有缓存」时出现。
 *
 * - 形态：`Tag('缓存', tone='warning')` + `caption`「上次更新 {相对时间}」；
 * - 相对时间随挂载期 **60s 定时器** 重算（仅可见时运行，卸载清理，零依赖）；
 * - 在线时**不渲染**（由调用方按 `isStale` 决定是否渲染本组件）。
 */
import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Tag } from './Tag'
import { useThemedStyles } from '@/store/ThemeProvider'
import { spacing, typography, type ThemeColors } from '@/theme'
import { formatRelativeTime } from '@/utils/date'

/** StaleBadge 入参 */
export interface StaleBadgeProps {
  /** 缓存写入时刻（epoch ms） */
  updatedAt: number
}

/** 相对时间刷新间隔（毫秒，A3：60s 足够） */
const RELATIVE_REFRESH_MS = 60_000

/** 缓存标记 */
export function StaleBadge({ updatedAt }: StaleBadgeProps): React.JSX.Element {
  const styles = useThemedStyles(makeStyles)
  // 仅用于触发重渲染以刷新相对时间（值本身不参与渲染）
  const [, setTick] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setTick((previous) => previous + 1), RELATIVE_REFRESH_MS)
    return () => clearInterval(timer)
  }, [])

  return (
    <View style={styles.container}>
      <Tag text="缓存" tone="warning" />
      <Text style={[typography.caption, styles.caption]} numberOfLines={1}>
        上次更新 {formatRelativeTime(updatedAt)}
      </Text>
    </View>
  )
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    caption: {
      color: colors.text.secondary,
      marginLeft: spacing.xs,
    },
  })
