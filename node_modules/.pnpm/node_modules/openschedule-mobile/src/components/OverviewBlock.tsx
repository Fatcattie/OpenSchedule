/**
 * 职责：时间容器「整周」概览视图的任务块（Task #18）—— 仅用颜色表达状态，**不显示文字**。
 * 背景：整周视图需在 390px 宽内塞下 7 列，单列约 47px，放不下标题；故块退化为纯色条。
 * 复用与日 / 周视图同源的泳道结果（assignLanes）：同列时间重叠的块按 laneIndex / laneCount
 * 水平分区并排，互不叠压（BugFix #17/#18 的核心原则）。
 * 纯展示组件：不响应点击（pointerEvents=none），点击整列由父级 Pressable 处理（切日视图）。
 */
import { StyleSheet, View } from 'react-native'
import { useTheme } from '@/store/ThemeProvider'
import { radius, spacing } from '@/theme'
import type { TaskStatus } from '@/types'
import { overviewBarColor } from '@/utils/overview'

/** OverviewBlock 入参（与 TimelineBlock 的定位口径一致，便于共用 layoutBlocks 结果） */
export interface OverviewBlockProps {
  status: TaskStatus
  /** 顶部位置比例（0..1，相对 08:00–20:00 时间带总高） */
  topRatio: number
  /** 高度比例（0..1，相对时间带总高） */
  heightRatio: number
  /** 泳道序号（0 起，0 最靠左）。默认 0 */
  laneIndex?: number
  /** 该重叠簇的泳道总数。默认 1（独占整列宽） */
  laneCount?: number
}

/** 整周视图任务块（纯色条） */
export function OverviewBlock({
  status,
  topRatio,
  heightRatio,
  laneIndex = 0,
  laneCount = 1,
}: OverviewBlockProps): React.JSX.Element {
  const { colors, statusColor } = useTheme()
  const clampedTop = Math.max(0, Math.min(1, topRatio))
  const clampedHeight = Math.max(0, Math.min(1 - clampedTop, heightRatio))

  // 泳道归一化：保证 laneCount >= 1、laneIndex 落在 [0, laneCount - 1]
  const lanes = Math.max(1, Math.floor(laneCount))
  const lane = Math.max(0, Math.min(lanes - 1, Math.floor(laneIndex)))

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.bar,
        {
          top: `${clampedTop * 100}%`,
          height: `${clampedHeight * 100}%`,
          left: `${(lane / lanes) * 100}%`,
          width: `${(1 / lanes) * 100}%`,
          backgroundColor: overviewBarColor(status, colors, statusColor),
          // 非末条泳道留出右侧缝隙，避免相邻泳道边界贴死（与 TimelineBlock 一致）
          marginRight: lane < lanes - 1 ? spacing.xxs : 0,
        },
      ]}
    />
  )
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    borderRadius: radius.sm,
  },
})
