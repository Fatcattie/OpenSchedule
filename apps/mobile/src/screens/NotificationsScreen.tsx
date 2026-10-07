/**
 * 职责：通知列表（P1）—— 倒序列表 + 已读标记 + 点击深链到任务详情（PRD M-P1-05）。
 */
import { Feather } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useCallback, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  Card,
  EmptyState,
  ErrorState,
  FadeIn,
  LoadingView,
  PressableScale,
  ScreenHeader,
  StaleBadge,
  staggerDelay,
} from '@/components'
import { useAsync, useAuth } from '@/hooks'
import { focusService } from '@/services'
import { useT } from '@/store/I18nProvider'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { layout, radius, spacing, typography, type ThemeColors } from '@/theme'
import type { AppNavigationProp, NotificationItem } from '@/types'
import { isNetworkError } from '@/types'
import { formatRelativeTime } from '@/utils/format'
import { goBackOrHome } from '@/utils/navigation'

/** 通知类型 → 图标 */
const NOTIFICATION_ICON: Record<string, keyof typeof Feather.glyphMap> = {
  'task.assigned': 'user-check',
  mention: 'at-sign',
  deadline_approaching: 'clock',
  'ai.proposal': 'cpu',
  'task.completed': 'check-circle',
  'review.result': 'award',
  'review.pending': 'inbox',
  'review.withdrawn': 'corner-up-left',
}

/** 通知列表 */
export function NotificationsScreen(): React.JSX.Element {
  const navigation = useNavigation<AppNavigationProp>()
  const { user } = useAuth()
  const { colors } = useTheme()
  const t = useT()
  const styles = useThemedStyles(makeStyles)
  const timezone = user?.timezone ?? 'Asia/Shanghai'
  const userId = user?.id ?? ''

  const [refreshing, setRefreshing] = useState(false)
  const notifications = useAsync<NotificationItem[]>(
    () => focusService.listNotifications(userId),
    [userId],
    { cache: { key: 'notifications:list' } },
  )

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await notifications.refetch()
    setRefreshing(false)
  }, [notifications])

  const handleOpen = useCallback(
    async (notification: NotificationItem) => {
      try {
        if (notification.readAt === null) {
          await focusService.markNotificationRead(notification.id)
          await notifications.refetch()
        }
      } catch {
        // 忽略：已读标记失败不阻断跳转
      }
      const taskId = notification.data?.taskId
      if (taskId) navigation.navigate('TaskDetail', { taskId, from: 'notification' })
    },
    [navigation, notifications],
  )

  const handleMarkAll = useCallback(async () => {
    await focusService.markAllNotificationsRead(userId)
    await notifications.refetch()
  }, [notifications, userId])

  const list = notifications.data ?? []
  const unreadCount = list.filter((item) => item.readAt === null).length

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={t('screen.notifications.title')}
        subtitle={
          unreadCount > 0
            ? t('screen.notifications.unreadCount', { count: unreadCount })
            : t('screen.notifications.allRead')
        }
        onBack={() => goBackOrHome(navigation)}
        right={
          unreadCount > 0 ? (
            <PressableScale
              accessibilityRole="button"
              onPress={() => void handleMarkAll()}
              hitSlop={spacing.xs}
              scale={0.94}
              pressedBg={colors.bg.subtle}
              style={styles.markAllButton}
            >
              <Text style={[typography.label, styles.markAll]}>{t('screen.notifications.allRead')}</Text>
            </PressableScale>
          ) : undefined
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {notifications.isStale && notifications.updatedAt !== null && !notifications.error ? (
          <StaleBadge updatedAt={notifications.updatedAt} />
        ) : null}
        {notifications.loading ? (
          <LoadingView variant="skeleton" skeletonCount={4} />
        ) : notifications.error ? (
          <ErrorState
            message={isNetworkError(notifications.error) ? t('networkOffline') : undefined}
            onRetry={() => void notifications.retry()}
          />
        ) : list.length === 0 ? (
          <Card>
            <EmptyState
              icon="bell"
              title={t('screen.notifications.empty.title')}
              description={t('screen.notifications.empty.description')}
            />
          </Card>
        ) : (
          list.map((item, index) => (
            <FadeIn key={item.id} delay={staggerDelay(index)} style={styles.cardGap}>
              <Card onPress={() => void handleOpen(item)}>
                <View style={styles.row}>
                  <View
                    style={[
                      styles.iconBox,
                      item.readAt === null ? styles.iconBoxUnread : styles.iconBoxRead,
                    ]}
                  >
                    <Feather
                      name={NOTIFICATION_ICON[item.type] ?? 'bell'}
                      size={layout.icon.md}
                      color={item.readAt === null ? colors.primary : colors.text.tertiary}
                    />
                  </View>
                  <View style={styles.body}>
                    <View style={styles.titleRow}>
                      <Text
                        style={[
                          typography.title,
                          styles.title,
                          item.readAt === null ? null : styles.titleRead,
                        ]}
                        numberOfLines={2}
                      >
                        {item.title}
                      </Text>
                      {item.readAt === null ? <View style={styles.unreadDot} /> : null}
                    </View>
                    {item.body ? (
                      <Text style={[typography.caption, styles.bodyText]} numberOfLines={2}>
                        {item.body}
                      </Text>
                    ) : null}
                    <Text style={[typography.caption, styles.meta]}>
                      {formatRelativeTime(item.createdAt, timezone)}
                      {item.data?.taskId ? t('screen.notifications.tapToView') : ''}
                    </Text>
                  </View>
                </View>
              </Card>
            </FadeIn>
          ))
        )}
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
  markAll: {
    color: colors.primary,
  },
  markAllButton: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radius.sm,
    marginRight: -spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconBox: {
    width: spacing.xxl + spacing.xxs,
    height: spacing.xxl + spacing.xxs,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxUnread: {
    backgroundColor: colors.primaryFaint,
  },
  iconBoxRead: {
    backgroundColor: colors.bg.subtle,
  },
  body: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  title: {
    flex: 1,
    color: colors.text.primary,
  },
  titleRead: {
    color: colors.text.secondary,
    fontWeight: '400',
  },
  unreadDot: {
    width: spacing.xs,
    height: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    marginLeft: spacing.xs,
    marginTop: spacing.xxs,
  },
  bodyText: {
    color: colors.text.secondary,
    marginTop: spacing.xxs,
  },
  meta: {
    color: colors.text.tertiary,
    marginTop: spacing.xs,
  },
})
