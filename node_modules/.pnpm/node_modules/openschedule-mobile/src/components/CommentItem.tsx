/**
 * 职责：评论条目 —— 作者 / 内容 / @提及 / 决策标记（ARCH §6 / PRD 6.5）。
 */
import { Feather } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'
import { Avatar } from './Avatar'
import { useT } from '@/store/I18nProvider'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { layout, radius, spacing, typography, type ThemeColors } from '@/theme'
import type { TaskComment, User } from '@/types'
import { formatRelativeTime } from '@/utils/format'

/** CommentItem 入参 */
export interface CommentItemProps {
  comment: TaskComment
  author?: User | null
  /** 是否为我发的评论（用于弱化他人 / 强调自己） */
  isMine: boolean
  /** 时区（相对时间渲染用） */
  timezone?: string
}

/** 评论条目 */
export function CommentItem({
  comment,
  author,
  isMine,
  timezone = 'Asia/Shanghai',
}: CommentItemProps): React.JSX.Element {
  const { colors } = useTheme()
  const t = useT()
  const styles = useThemedStyles(makeStyles)
  const displayName = author?.displayName ?? t('business.comment.unknownMember')

  return (
    <View style={styles.container}>
      <Avatar name={displayName} uri={author?.avatarUrl ?? null} size={32} ring={isMine} />
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Text style={[typography.label, styles.author]} numberOfLines={1}>
            {displayName}
          </Text>
          {isMine ? <Text style={[typography.label, styles.mineBadge]}>{t('business.comment.mine')}</Text> : null}
          {comment.isDecision ? (
            <View style={styles.decisionBadge}>
              <Feather name="check-circle" size={layout.icon.sm - 2} color={colors.success} />
              <Text style={[typography.label, styles.decisionText]}>{t('business.comment.decision')}</Text>
            </View>
          ) : null}
          <Text style={[typography.caption, styles.time]} numberOfLines={1}>
            {formatRelativeTime(comment.createdAt, timezone)}
          </Text>
        </View>
        <Text style={[typography.body, styles.content]}>{comment.content}</Text>
      </View>
    </View>
  )
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: spacing.sm,
    },
    body: {
      flex: 1,
      marginLeft: spacing.sm,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
    },
    author: {
      color: colors.text.primary,
    },
    mineBadge: {
      marginLeft: spacing.xxs,
      color: colors.primary,
      backgroundColor: colors.primaryFaint,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.xs,
      overflow: 'hidden',
    },
    decisionBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: spacing.xs,
      // 成功色 8% 淡底：由模块级常量移入工厂，随当前 colors 求值（C8）
      backgroundColor: `${colors.success}14`,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.xxs,
    },
    decisionText: {
      marginLeft: spacing.xxs,
      color: colors.success,
      fontSize: typography.label.fontSize,
      lineHeight: typography.label.lineHeight,
    },
    time: {
      marginLeft: 'auto',
      color: colors.text.tertiary,
    },
    content: {
      color: colors.text.primary,
      marginTop: spacing.xxs,
    },
  })
