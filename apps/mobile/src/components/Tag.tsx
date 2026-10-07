/**
 * 职责：标签胶囊 —— 状态 / 优先级 / 中性三种语义，统一「8% 淡底 + 同色系深字」（ARCH §3.1 / §3.7-10）。
 */
import { StyleSheet, Text, View } from 'react-native'
import type { TranslationKey } from '@/i18n'
import { useTheme } from '@/store/ThemeProvider'
import { useT } from '@/store/I18nProvider'
import { getPriorityColorFor, radius, spacing, typography } from '@/theme'
import type { TaskPriority, TaskStatus } from '@/types'

/** Tag 入参 */
export interface TagProps {
  text: string
  /** 语义色调：状态 / 优先级 / 中性 / 警告（增量 8 新增 `warning`，additive） */
  tone?: 'status' | 'priority' | 'neutral' | 'warning'
  status?: TaskStatus
  priority?: TaskPriority
}

/** 8% 透明度后缀（#RRGGBB + 14 ≈ 8%） */
const ALPHA_8_PERCENT = '14'

/** 标签胶囊 */
export function Tag({ text, tone = 'neutral', status, priority }: TagProps): React.JSX.Element {
  // 运行时取色：状态 / 优先级语义色表随主题切换（否则深色下标签漏白，D8）
  const { colors, statusColor, priorityColor } = useTheme()
  const t = useT()
  let background = colors.bg.subtle
  let foreground = colors.text.secondary
  let label = text

  if (tone === 'status' && status) {
    const style = statusColor[status]
    background = style.bg
    foreground = style.color
    // 回退走 i18n 字典：zh 值与 `statusColor[].label` 同源派生 ⇒ zh 逐字不变；en 取英文
    label = text || t(`taskStatus.${status}` as TranslationKey)
  } else if (tone === 'priority' && priority) {
    const base = getPriorityColorFor(priority, priorityColor)
    background = `${base}${ALPHA_8_PERCENT}`
    foreground = base
    // 同上去字典取词（修 QA-D2：英文态优先级徽标曾显示中文「高」）
    label = text || t(`priority.${priority}` as TranslationKey)
  } else if (tone === 'warning') {
    // 警告 / 缓存标记：浅琥珀底 + 琥珀字（与离线横幅同色系）
    background = colors.warningFaint
    foreground = colors.warning
  }

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      <Text style={[typography.label, styles.text, { color: foreground }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  text: {
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight,
  },
})
