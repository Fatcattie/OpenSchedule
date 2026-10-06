/**
 * 职责：时间容器的任务块 —— 按状态着色，绝对定位于时间轴网格（ARCH §6 / PRD 6.6）。
 * done 灰显 + 删除线；in_progress 墨蓝实心；todo 墨蓝描边；blocked 警示淡底。
 *
 * BugFix #17：块高严格按时间比例（去掉固定 minHeight，避免与相邻块叠压）；
 * 支持泳道并排（laneIndex / laneCount）；块高不足时退化为紧凑条；跨 08:00–20:00
 * 边界的任务显示 ↑ / ↓ 延续提示。
 */
import { StyleSheet, Text, View } from 'react-native'
import { PressableScale } from './PressableScale'
import { useTheme } from '@/store/ThemeProvider'
import { radius, spacing, typography, type StatusStyle, type ThemeColors } from '@/theme'
import type { TaskStatus } from '@/types'

/** TimelineBlock 入参 */
export interface TimelineBlockProps {
  title: string
  status: TaskStatus
  /** 顶部位置比例（0..1，相对时间轴总高） */
  topRatio: number
  /** 高度比例（0..1，相对时间轴总高） */
  heightRatio: number
  onPress: () => void
  onLongPress?: () => void
  /** 泳道序号（0 起，0 最靠左）。默认 0 */
  laneIndex?: number
  /** 该重叠簇的泳道总数。默认 1（独占整列宽） */
  laneCount?: number
  /** 紧凑模式：块高不足一行标题时启用（单行小字号），避免内容溢出压住相邻块 */
  compact?: boolean
  /** 顶部被时间窗上边界裁剪（任务早于 08:00），显示 ↑ 延续提示 */
  continuationTop?: boolean
  /** 底部被时间窗下边界裁剪（任务晚于 20:00），显示 ↓ 延续提示 */
  continuationBottom?: boolean
  /** 长按触发时延（ms）。不传则用 RN 默认值（既有调用方行为不变） */
  delayLongPress?: number
}

/** 各状态的视觉处理 */
interface BlockVisual {
  backgroundColor: string
  borderColor: string
  textColor: string
  strike: boolean
}

/** 按状态取视觉方案（运行时传入当前色板与语义色表，随主题变化） */
function resolveVisual(
  status: TaskStatus,
  colors: ThemeColors,
  statusColor: Record<TaskStatus, StatusStyle>,
): BlockVisual {
  const style = statusColor[status]
  switch (status) {
    case 'in_progress':
      return {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
        textColor: colors.text.inverse,
        strike: false,
      }
    case 'done':
      return {
        backgroundColor: colors.bg.subtle,
        borderColor: colors.border,
        textColor: colors.text.tertiary,
        strike: true,
      }
    case 'blocked':
      return {
        backgroundColor: style.bg,
        borderColor: style.color,
        textColor: style.color,
        strike: false,
      }
    case 'cancelled':
      return {
        backgroundColor: colors.bg.subtle,
        borderColor: colors.border,
        textColor: colors.text.tertiary,
        strike: true,
      }
    default:
      return {
        backgroundColor: colors.bg.surface,
        borderColor: colors.primary,
        textColor: colors.primary,
        strike: false,
      }
  }
}

/** 时间轴任务块 */
export function TimelineBlock({
  title,
  status,
  topRatio,
  heightRatio,
  onPress,
  onLongPress,
  laneIndex = 0,
  laneCount = 1,
  compact = false,
  continuationTop = false,
  continuationBottom = false,
  delayLongPress,
}: TimelineBlockProps): React.JSX.Element {
  const { colors, statusColor } = useTheme()
  const visual = resolveVisual(status, colors, statusColor)
  const clampedTop = Math.max(0, Math.min(1, topRatio))
  const clampedHeight = Math.max(0, Math.min(1 - clampedTop, heightRatio))

  // 泳道归一化：保证 laneCount >= 1、laneIndex 落在 [0, laneCount - 1]
  const lanes = Math.max(1, Math.floor(laneCount))
  const lane = Math.max(0, Math.min(lanes - 1, Math.floor(laneIndex)))

  return (
    <View
      style={[
        styles.slot,
        {
          top: `${clampedTop * 100}%`,
          height: `${clampedHeight * 100}%`,
          left: `${(lane / lanes) * 100}%`,
          width: `${(1 / lanes) * 100}%`,
          // 非末条泳道留出右侧缝隙，避免相邻泳道边界贴死
          paddingRight: lane < lanes - 1 ? spacing.xxs : 0,
        },
      ]}
    >
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={title}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={delayLongPress}
        scale={0.96}
        style={[
          styles.block,
          { backgroundColor: visual.backgroundColor, borderColor: visual.borderColor },
        ]}
      >
        {continuationTop ? (
          <Text style={[styles.continuation, styles.continuationTop, { color: visual.textColor }]}>
            ↑
          </Text>
        ) : null}
        <View style={[styles.inner, compact ? styles.innerCompact : null]}>
          <Text
            style={[
              compact ? typography.label : typography.caption,
              styles.title,
              { color: visual.textColor },
              visual.strike ? styles.strike : null,
            ]}
            numberOfLines={compact ? 1 : 2}
          >
            {title}
          </Text>
        </View>
        {continuationBottom ? (
          <Text style={[styles.continuation, styles.continuationBottom, { color: visual.textColor }]}>
            ↓
          </Text>
        ) : null}
      </PressableScale>
    </View>
  )
}

const styles = StyleSheet.create({
  slot: {
    position: 'absolute',
  },
  block: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  inner: {
    flex: 1,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    justifyContent: 'center',
  },
  innerCompact: {
    paddingVertical: 0,
    justifyContent: 'center',
  },
  title: {
    fontWeight: '600',
  },
  strike: {
    textDecorationLine: 'line-through',
  },
  continuation: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight,
    opacity: 0.9,
  },
  continuationTop: {
    top: 0,
  },
  continuationBottom: {
    bottom: 0,
  },
})
