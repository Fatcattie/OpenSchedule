/**
 * 职责：任务卡片 —— 左侧优先级色条 + 状态标签 + 截止时间 + 负责人（ARCH §6 / §3.7-1）。
 * 卡片双层（描边 + 低阴影），按下浮起（向上位移 + 阴影增强）。
 */
import { Feather } from '@expo/vector-icons'
import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Avatar } from './Avatar'
import { Card } from './Card'
import { Tag } from './Tag'
import type { TParams, TranslationKey } from '@/i18n'
import { useT } from '@/store/I18nProvider'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { getPriorityColorFor, layout, radius, spacing, typography, type ThemeColors } from '@/theme'
import type { Project, Task, User } from '@/types'
import { formatDate, daysUntil } from '@/utils/date'

/** TaskCard 入参 */
export interface TaskCardProps {
  task: Task
  assignee?: User | null
  onPress: () => void
  /** 是否展示所属项目名 */
  showProject?: boolean
  /** 紧凑模式（今日聚焦 / 看板列内用） */
  compact?: boolean
  /** 右侧附加内容 */
  right?: ReactNode
  /** 所属项目（showProject 时展示名称） */
  project?: Project | null
  /** 时区（按用户时区渲染截止时间） */
  timezone?: string
  /** 是否为乐观更新中的卡片（降低透明度） */
  dimmed?: boolean
  /** 卡片底部附加内容（仅「待我审核」分叉标签 + 提交人副文案使用） */
  footer?: ReactNode
}

/** 优先级色条宽度 */
const PRIORITY_BAR_WIDTH = layout.priorityBarWidth

/** 截止时间文案与语义色（运行时传入当前色板，随主题变化） */
function buildDueMeta(
  task: Task,
  timezone: string,
  colors: ThemeColors,
  t: (key: TranslationKey, params?: TParams) => string,
): { text: string; color: string } | null {
  if (!task.dueAt) return null
  const text = formatDate(task.dueAt, timezone)
  if (task.status === 'done' || task.status === 'cancelled') {
    return { text, color: colors.text.tertiary }
  }
  const diff = daysUntil(task.dueAt, timezone)
  if (diff < 0) {
    return { text: t('business.taskCard.overdue', { days: Math.abs(diff) }), color: colors.danger }
  }
  if (diff === 0) return { text: t('business.taskCard.dueToday'), color: colors.warning }
  if (diff === 1) return { text: t('business.taskCard.dueTomorrow'), color: colors.warning }
  return { text, color: colors.text.secondary }
}

/** 任务卡片 */
export function TaskCard({
  task,
  assignee,
  onPress,
  showProject = false,
  compact = false,
  right,
  project = null,
  timezone = 'Asia/Shanghai',
  dimmed = false,
  footer = undefined,
}: TaskCardProps): React.JSX.Element {
  // 运行时取色：状态 / 优先级语义色表随主题切换（否则深色下标签漏白，D8）
  const { colors, priorityColor } = useTheme()
  const t = useT()
  const styles = useThemedStyles(makeStyles)
  const due = buildDueMeta(task, timezone, colors, t)

  return (
    <Card onPress={onPress} padded={false} style={dimmed ? styles.dimmed : undefined}>
      <View style={styles.row}>
        <View style={[styles.priorityBar, { backgroundColor: getPriorityColorFor(task.priority, priorityColor) }]} />
        <View style={[styles.body, compact ? styles.bodyCompact : null]}>
          <View style={styles.titleRow}>
            <Text
              style={[
                compact ? typography.body : typography.title,
                styles.title,
                task.status === 'done' || task.status === 'cancelled' ? styles.titleMuted : null,
                task.status === 'done' ? styles.titleStrike : null,
              ]}
              numberOfLines={2}
            >
              {task.title}
            </Text>
            {right ? <View style={styles.rightSlot}>{right}</View> : null}
          </View>

          {showProject && project ? (
            <Text style={[typography.caption, styles.project]} numberOfLines={1}>
              {project.name}
            </Text>
          ) : null}

          <View style={styles.metaRow}>
            <Tag tone="status" status={task.status} text={t(`taskStatus.${task.status}`)} />
            {due ? (
              <View style={styles.metaItem}>
                <Feather name="clock" size={layout.icon.sm} color={due.color} />
                <Text style={[typography.caption, styles.metaText, { color: due.color }]} numberOfLines={1}>
                  {due.text}
                </Text>
              </View>
            ) : null}
            {task.estimatedHours !== null && !compact ? (
              <View style={styles.metaItem}>
                <Feather name="target" size={layout.icon.sm} color={colors.text.tertiary} />
                <Text style={[typography.caption, styles.metaText, { color: colors.text.tertiary }]}>
                  {task.estimatedHours}h
                </Text>
              </View>
            ) : null}
            {assignee ? (
              <View style={styles.assignee}>
                <Avatar name={assignee.displayName} uri={assignee.avatarUrl} size={32} />
              </View>
            ) : (
              <View style={styles.metaItem}>
                <Feather name="user-plus" size={layout.icon.sm} color={colors.text.tertiary} />
                <Text style={[typography.caption, styles.metaText, { color: colors.text.tertiary }]}>
                  {t('business.taskCard.unassigned')}
                </Text>
              </View>
            )}
          </View>

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Card>
  )
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'stretch',
    },
    priorityBar: {
      width: PRIORITY_BAR_WIDTH,
      borderTopLeftRadius: radius.card,
      borderBottomLeftRadius: radius.card,
    },
    body: {
      flex: 1,
      padding: layout.cardPadding,
    },
    bodyCompact: {
      padding: spacing.sm,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    title: {
      flex: 1,
      color: colors.text.primary,
    },
    titleMuted: {
      color: colors.text.tertiary,
    },
    titleStrike: {
      textDecorationLine: 'line-through',
    },
    rightSlot: {
      marginLeft: spacing.xs,
    },
    project: {
      color: colors.text.secondary,
      marginTop: spacing.xxs,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.sm,
      flexWrap: 'wrap',
    },
    metaItem: {
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: spacing.sm,
    },
    metaText: {
      marginLeft: spacing.xxs,
    },
    assignee: {
      marginLeft: spacing.sm,
    },
    footer: {
      marginTop: spacing.xs,
    },
    dimmed: {
      opacity: 0.5,
    },
  })
