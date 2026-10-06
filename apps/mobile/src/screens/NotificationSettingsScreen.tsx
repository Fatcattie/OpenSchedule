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
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { layout, spacing, typography, type ThemeColors } from '@/theme'
import type { AppNavigationProp, NotificationPreference } from '@/types'
import { NETWORK_OFFLINE_MESSAGE, NOTIFICATION_EVENT_LABEL, isNetworkError } from '@/types'

/** 渠道配置 */
const CHANNELS: { key: keyof NotificationPreference['channels']; label: string }[] = [
  { key: 'email', label: '邮件' },
  { key: 'push', label: '推送' },
  { key: 'im', label: '即时消息' },
]

/** 通知偏好设置页 */
export function NotificationSettingsScreen(): React.JSX.Element {
  const navigation = useNavigation<AppNavigationProp>()
  const { user } = useAuth()
  const { colors } = useTheme()
  const styles = useThemedStyles(makeStyles)
  const userId = user?.id ?? ''

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
        title="通知偏好"
        subtitle="按事件类型选择接收渠道"
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
            <EmptyState icon="bell-off" title="暂无偏好配置" description="后端未返回任何通知偏好项" />
          </Card>
        ) : (
          list.map((preference, index) => (
            <FadeIn key={preference.id} delay={staggerDelay(index)} style={styles.cardGap}>
              <Card>
                <View style={styles.headerRow}>
                  <Text style={[typography.title, styles.title]}>
                    {NOTIFICATION_EVENT_LABEL[preference.eventType] ?? preference.eventType}
                  </Text>
                  {savingId === preference.id ? (
                    <Text style={[typography.caption, styles.saving]}>保存中…</Text>
                  ) : null}
                </View>
                <Text style={[typography.caption, styles.eventType]}>{preference.eventType}</Text>

                {CHANNELS.map((channel) => (
                  <View key={channel.key} style={styles.channelRow}>
                    <Text style={[typography.body, styles.channelLabel]}>{channel.label}</Text>
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
                    免打扰：{preference.quietHours[0].start} – {preference.quietHours[0].end}
                  </Text>
                ) : null}
              </Card>
            </FadeIn>
          ))
        )}

        <Text style={[typography.caption, styles.footerNote]}>
          提示：写操作会同步到后端 notification_preferences；首版仅站内通知 + 轮询，真推送在后续版本接入。
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
