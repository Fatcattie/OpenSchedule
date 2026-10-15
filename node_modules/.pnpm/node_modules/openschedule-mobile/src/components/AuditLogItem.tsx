/**
 * 职责：「撤回审核」栏日志条目卡片（增量 7）—— 任务标题 + 意见标签 + 动作标签 + 操作人 + 时间。
 * 点击进入任务详情（对齐 web `AuditPage.tsx:476-503` 的日志流条目）。
 *
 * 增量 10（C2）：意见配色由 `opinionMeta(colors)` 运行时取色；样式工厂化（参数名 `colors`，L3）。
 */
import { StyleSheet, Text, View } from 'react-native'
import { Card } from './Card'
import { Tag } from './Tag'
import type { TranslationKey } from '@/i18n'
import { useT } from '@/store/I18nProvider'
import { useThemeColors, useThemedStyles } from '@/store/ThemeProvider'
import { radius, spacing, typography, type ThemeColors } from '@/theme'
import type { AuditAction, AuditLog, AuditOpinion, Task } from '@/types'
import { opinionMeta } from '@/utils/audit'
import { formatRelativeTime } from '@/utils/format'

/** 8% 透明度后缀（#RRGGBB + 14 ≈ 8%，与 Tag / MySubmissionsScreen 同构） */
const ALPHA_8_PERCENT = '14'

/** 审核意见 → 领域字典键（`domain.ts` 同源派生，与 `OPINION_OPTIONS` 逐字一致） */
const OPINION_KEY: Record<AuditOpinion, TranslationKey> = {
  agree: 'auditOpinion.agree',
  reject: 'auditOpinion.reject',
  rework: 'auditOpinion.rework',
  other: 'auditOpinion.other',
}

/** 审核动作 → 领域字典键（`domain.ts` 同源派生，与 `AUDIT_ACTION_LABEL` 逐字一致） */
const ACTION_KEY: Record<AuditAction, TranslationKey> = {
  approve: 'auditAction.approve',
  reject: 'auditAction.reject',
  withdraw: 'auditAction.withdraw',
}

/** AuditLogItem 入参 */
export interface AuditLogItemProps {
  log: AuditLog & { task: Task }
  onPress: () => void
  timezone?: string
}

/** 「撤回审核」栏日志条目 */
export function AuditLogItem({
  log,
  onPress,
  timezone = 'Asia/Shanghai',
}: AuditLogItemProps): React.JSX.Element {
  const colors = useThemeColors()
  const t = useT()
  const styles = useThemedStyles(makeStyles)
  const opinion = opinionMeta(colors)[log.opinion]
  return (
    <Card onPress={onPress}>
      <Text style={[typography.title, styles.title]} numberOfLines={2}>
        {log.task.title}
      </Text>

      <View style={styles.metaRow}>
        <View style={[styles.pill, { backgroundColor: `${opinion.color}${ALPHA_8_PERCENT}` }]}>
          <Text style={[typography.label, { color: opinion.color }]}>{t(OPINION_KEY[log.opinion])}</Text>
        </View>
        <View style={styles.gap} />
        <Tag text={t(ACTION_KEY[log.action])} tone="neutral" />
        <Text style={[typography.caption, styles.operator]} numberOfLines={1}>
          {log.operatorName}
        </Text>
      </View>

      {log.reason ? (
        <Text style={[typography.caption, styles.reason]} numberOfLines={2}>
          {log.reason}
        </Text>
      ) : null}

      <Text style={[typography.caption, styles.time]}>
        {formatRelativeTime(log.createdAt, timezone)}
      </Text>
    </Card>
  )
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    title: {
      color: colors.text.primary,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    pill: {
      borderRadius: radius.pill,
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.xxs,
    },
    gap: {
      width: spacing.xs,
    },
    operator: {
      color: colors.text.secondary,
      marginLeft: spacing.xs,
      flex: 1,
    },
    reason: {
      color: colors.text.secondary,
      marginTop: spacing.xs,
    },
    time: {
      color: colors.text.tertiary,
      marginTop: spacing.xs,
    },
  })
