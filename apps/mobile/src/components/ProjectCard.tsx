/**
 * 职责：项目卡片 —— 名称 / 负责人 / 截止 / 进度条 / 任务数（ARCH §6 / PRD 6.4）。
 */
import { Feather } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'
import { Avatar } from './Avatar'
import { Card } from './Card'
import { ProgressBar } from './ProgressBar'
import { Tag } from './Tag'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { layout, spacing, typography, type ThemeColors } from '@/theme'
import type { Project, User } from '@/types'
import { PROJECT_STATUS_LABEL } from '@/types'
import { daysUntil, formatDate } from '@/utils/date'

/** ProjectCard 入参 */
export interface ProjectCardProps {
  project: Project
  /** 完成率 0..1 */
  progress: number
  taskCount: number
  owner?: User | null
  onPress: () => void
  /** 时区（按用户时区渲染截止时间） */
  timezone?: string
}

/** 截止时间文案与语义色（运行时传入当前色板，随主题变化） */
function buildDeadlineMeta(
  project: Project,
  timezone: string,
  colors: ThemeColors,
): { text: string; color: string } | null {
  if (!project.deadline) return null
  if (project.status !== 'active') {
    return { text: `截止 ${formatDate(project.deadline, timezone)}`, color: colors.text.tertiary }
  }
  const diff = daysUntil(project.deadline, timezone)
  if (diff < 0) return { text: `已逾期 ${Math.abs(diff)} 天`, color: colors.danger }
  if (diff <= 7) return { text: `剩 ${diff} 天`, color: colors.warning }
  return { text: `剩 ${diff} 天`, color: colors.text.secondary }
}

/** 项目卡片 */
export function ProjectCard({
  project,
  progress,
  taskCount,
  owner,
  onPress,
  timezone = 'Asia/Shanghai',
}: ProjectCardProps): React.JSX.Element {
  const { colors } = useTheme()
  const styles = useThemedStyles(makeStyles)
  const deadline = buildDeadlineMeta(project, timezone, colors)
  const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100)

  return (
    <Card onPress={onPress}>
      <View style={styles.headerRow}>
        <View style={styles.titleBlock}>
          <Text style={[typography.title, styles.title]} numberOfLines={1}>
            {project.name}
          </Text>
          {project.description ? (
            <Text style={[typography.caption, styles.description]} numberOfLines={2}>
              {project.description}
            </Text>
          ) : null}
        </View>
        <Tag text={PROJECT_STATUS_LABEL[project.status]} tone="neutral" />
      </View>

      <View style={styles.metaRow}>
        {owner ? (
          <View style={styles.metaItem}>
            <Avatar name={owner.displayName} uri={owner.avatarUrl} size={32} />
            <Text style={[typography.caption, styles.metaText]} numberOfLines={1}>
              {owner.displayName}
            </Text>
          </View>
        ) : (
          <View style={styles.metaItem}>
            <Feather name="user" size={layout.icon.sm} color={colors.text.tertiary} />
            <Text style={[typography.caption, styles.metaText]}>未指定负责人</Text>
          </View>
        )}
        <View style={styles.metaItem}>
          <Feather name="list" size={layout.icon.sm} color={colors.text.tertiary} />
          <Text style={[typography.caption, styles.metaText]}>{taskCount} 个任务</Text>
        </View>
        {deadline ? (
          <View style={styles.metaItem}>
            <Feather name="calendar" size={layout.icon.sm} color={deadline.color} />
            <Text style={[typography.caption, styles.metaText, { color: deadline.color }]}>
              {deadline.text}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.progressRow}>
        <View style={styles.progressBar}>
          <ProgressBar value={progress} tone={percent === 100 ? 'success' : 'primary'} />
        </View>
        <Text style={[typography.label, styles.percent]}>{percent}%</Text>
      </View>
    </Card>
  )
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    titleBlock: {
      flex: 1,
      marginRight: spacing.sm,
    },
    title: {
      color: colors.text.primary,
    },
    description: {
      color: colors.text.secondary,
      marginTop: spacing.xxs,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      marginTop: spacing.sm,
    },
    metaItem: {
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: spacing.md,
      marginTop: spacing.xxs,
    },
    metaText: {
      color: colors.text.secondary,
      marginLeft: spacing.xxs,
    },
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.md,
    },
    progressBar: {
      flex: 1,
      marginRight: spacing.sm,
    },
    percent: {
      color: colors.text.secondary,
      minWidth: spacing.xxl,
      textAlign: 'right',
    },
  })
