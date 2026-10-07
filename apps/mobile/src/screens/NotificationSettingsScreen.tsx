/**
 * 职责：通知偏好（P1）—— 按事件类型配置 email / push / im 三个通道开关（PRD M-P0-15）。
 * 切换即写入 notification_preferences（乐观更新，失败回滚）。
 */
import { useNavigation } from '@react-navigation/native'
import { useCallback, useState } from 'react'
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import {
  Card,
  EmptyState,
  ErrorState,
  FadeIn,
  LoadingView,
  ScreenHeader,
  StaleBadge,
  staggerDelay,
} from '@/components'
import { useAsync, useAuth } from '@/hooks'
import { focusService } from '@/services'
import type { TranslationKey } from '@/i18n'
import { useT } from '@/store/I18nProvider'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { layout, spacing, typography, type ThemeColors } from '@/theme'
import type { AppNavigationProp, NotificationPreference } from '@/types'
import { NETWORK_OFFLINE_MESSAGE, NOTIFICATION_EVENT_LABEL, isNetworkError } from '@/types'

/** 渠道配置（文案键在渲染期经 `t()` 求值，随语言切换） */
const CHANNELS: { key: keyof NotificationPreference['channels']; labelKey: TranslationKey }[] = [
  { key: 'email', labelKey: 'screen.notificationSettings.channel.email' },
  { key: 'push', labelKey: 'screen.notificationSettings.channel.push' },
  { key: 'im', labelKey: 'screen.notificationSettings.channel.im' },
]

/** 通知事件类型 → 领域字典键（`domain.ts` 同源派生，与 `NOTIFICATION_EVENT_LABEL` 逐字一致） */
const EVENT_KEY: Record<string, TranslationKey> = {
  'task.assigned': 'notificationEvent.taskAssigned',
  mention: 'notificationEvent.mention',
  deadline_approaching: 'notificationEvent.deadlineApproaching',
  'ai.proposal': 'notificationEvent.aiProposal',
  'task.completed': 'notificationEvent.taskCompleted',
  'review.result': 'notificationEvent.reviewResult',
  'review.pending': 'notificationEvent.reviewPending',
  'review.withdrawn': 'notificationEvent.reviewWithdrawn',
}

/** 通知偏好设置页 */
export function NotificationSettingsScreen(): React.JSX.Element {
  const navigation = useNavigation<AppNavigationProp>()
  const { user } = useAuth()
  const { colors } = useTheme()
  const t = useT()
  const styles = useThemedStyles(makeStyles)
  const userId = user?.id ?? ''

  /** 事件类型文案：优先走领域字典，未知类型回落既有标签 / 原始值 */
  const eventLabel = (type: string): string => {
    const key = EVENT_KEY[type]
    return key ? t(key) : NOTIFICATION_EVENT_LABEL[type] ?? type
  }

  const preferences = useAsync<NotificationPreference[]>(
    () => focusService.getNotificationPreferences(userId),
    [userId],
    { cache: { key: 'notifications:preferences' } },
  )
  const [savingId, setSavingId] = useState<string | null>(null)

  /** 切换某个渠道开关（乐观更新 + 失败回滚） */
  const handleToggle = useCallback(
    async (preference: NotificationPreference, channel: keyof NotificationPreference['channels']) => {
      const nextChannels = { ...preference.channels, [channel]: !preference.channels[channel] }
      setSavingId(preference.id)
      preferences.setData((previous) =>
        previous
          ? previous.map((item) => (item.id === preference.id ? { ...item, channels: nextChannels } : item))
          : previous,
      )
      try {
        await focusService.updateNotificationChannels(preference.id, nextChannels)
      } catch {
        // 回滚
        await preferences.refetch()
      } finally {
        setSavingId(null)
      }
    },
    [preferences],
  )

  const list = preferences.data ?? []

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={t('screen.notificationSettings.title')}
        subtitle={t('screen.notificationSettings.subtitle')}
        onBack={() => navigation.goBack()}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {preferences.isStale && preferences.updatedAt !== null && !preferences.error ? (
          <StaleBadge updatedAt={preferences.updatedAt} />
        ) : null}
        {preferences.loading ? (
          <LoadingView variant="skeleton" skeletonCount={3} />
        ) : preferences.error ? (
          <ErrorState
            message={isNetworkError(preferences.error) ? NETWORK_OFFLINE_MESSAGE : undefined}
            onRetry={() => void preferences.retry()}
          />
        ) : list.length === 0 ? (
          <Card>
            <EmptyState
              icon="bell-off"
              title={t('screen.notificationSettings.empty.title')}
              description={t('screen.notificationSettings.empty.description')}
            />
          </Card>
        ) : (
          list.map((preference, index) => (
            <FadeIn key={preference.id} delay={staggerDelay(index)} style={styles.cardGap}>
              <Card>
                <View style={styles.headerRow}>
                  <Text style={[typography.title, styles.title]}>
                    {eventLabel(preference.eventType)}
                  </Text>
                  {savingId === preference.id ? (
                    <Text style={[typography.caption, styles.saving]}>
                      {t('screen.notificationSettings.saving')}
                    </Text>
                  ) : null}
                </View>
                <Text style={[typography.caption, styles.eventType]}>{preference.eventType}</Text>

                {CHANNELS.map((channel) => (
                  <View key={channel.key} style={styles.channelRow}>
                    <Text style={[typography.body, styles.channelLabel]}>{t(channel.labelKey)}</Text>
                    <Switch
                      value={preference.channels[channel.key]}
                      onValueChange={() => void handleToggle(preference, channel.key)}
                      disabled={savingId === preference.id}
                      trackColor={{ false: colors.borderStrong, true: colors.primarySoft }}
                      thumbColor={colors.bg.surface}
                      ios_backgroundColor={colors.borderStrong}
                    />
                  </View>
                ))}

                {preference.quietHours && preference.quietHours.length > 0 ? (
                  <Text style={[typography.caption, styles.quiet]}>
                    {t('screen.notificationSettings.quietHours', {
                      start: preference.quietHours[0].start,
                      end: preference.quietHours[0].end,
                    })}
                  </Text>
                ) : null}
              </Card>
            </FadeIn>
          ))
        )}

        <Text style={[typography.caption, styles.footerNote]}>
          {t('screen.notificationSettings.footer')}
        </Text>
      </ScrollView>
    </View>
  )
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg.base,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.xxxl,
  },
  cardGap: {
    marginBottom: layout.cardGap,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: colors.text.primary,
  },
  saving: {
    color: colors.text.tertiary,
  },
  eventType: {
    color: colors.text.tertiary,
    marginTop: spacing.xxs,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  channelLabel: {
    color: colors.text.primary,
  },
  quiet: {
    color: colors.text.secondary,
    marginTop: spacing.sm,
  },
  footerNote: {
    color: colors.text.tertiary,
    marginTop: spacing.lg,
    lineHeight: typography.caption.lineHeight,
  },
})
