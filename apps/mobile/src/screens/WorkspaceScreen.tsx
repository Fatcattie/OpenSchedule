/**
 * 职责：② 工作台 —— 问候 + 角色切换 + 快捷入口 + 我的待办（≤5）+ 临期预警 + 团队动态分页（ARCH §6.2 / PRD 6.2）。
 * 三态齐备：骨架屏 / 空态 / 错误态；下拉刷新；列表 stagger 入场。
 */
import { Feather } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Avatar,
  Card,
  EmptyState,
  ErrorState,
  FadeIn,
  LoadingView,
  PressableScale,
  Skeleton,
  StaleBadge,
  SwipeableRow,
  TaskCard,
  staggerDelay,
  type SwipeAction,
} from '@/components'
import type { TranslationKey } from '@/i18n'
import { useAsync, useAuth } from '@/hooks'
import { focusService, summaryService, taskService } from '@/services'
import { useT } from '@/store/I18nProvider'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { layout, radius, spacing, typography, type ThemeColors } from '@/theme'
import type { AppNavigationProp, AuditFeedItem, PeriodSummary, Task } from '@/types'
import { NETWORK_OFFLINE_MESSAGE, isNetworkError } from '@/types'
import { getZonedParts } from '@/utils/date'
import { formatHours, formatRelativeTime } from '@/utils/format'
import { useCan } from '@/utils/permission'

/** 工作台待办最多展示条数 */
const TODO_LIMIT = 5
/** 团队动态每页条数 */
const FEED_PAGE_SIZE = 5
/** 快捷入口每行个数（超出换行，行数随权限自适应） */
const QUICK_ENTRY_PER_ROW = 3
/** 数据卡片骨架行高（取间距 token，避免内联魔法数字） */
const SUMMARY_SKELETON_HEIGHT = spacing.md

/**
 * 快捷入口跳转目标：
 * - `tab`：底部 Tab（`navigation.navigate('Tabs', { screen })`）
 * - `screen`：根栈共享页（`navigation.navigate(screen)`，全屏覆盖 TabBar）
 */
type QuickEntryTarget =
  | { type: 'tab'; tab: 'Today' | 'Time' | 'Project' }
  | { type: 'screen'; screen: 'Submission' | 'CreateItem' | 'PersonalPlan' }

/** 快捷入口定义 */
type QuickEntry = {
  key: string
  labelKey: TranslationKey
  icon: keyof typeof Feather.glyphMap
  target: QuickEntryTarget
}

/** 基础快捷入口（所有角色可见，保持原有 3 项不变） */
const BASE_QUICK_ENTRIES: QuickEntry[] = [
  { key: 'today', labelKey: 'screens.core.workspace.quickToday', icon: 'target', target: { type: 'tab', tab: 'Today' } },
  { key: 'time', labelKey: 'screens.core.workspace.quickTime', icon: 'clock', target: { type: 'tab', tab: 'Time' } },
  { key: 'project', labelKey: 'screens.core.workspace.quickProject', icon: 'grid', target: { type: 'tab', tab: 'Project' } },
]

/** 按小时给出问候语键 */
function greetingKey(hour: number): TranslationKey {
  if (hour < 6) return 'screens.core.workspace.greetingLateNight'
  if (hour < 12) return 'screens.core.workspace.greetingMorning'
  if (hour < 14) return 'screens.core.workspace.greetingNoon'
  if (hour < 18) return 'screens.core.workspace.greetingAfternoon'
  return 'screens.core.workspace.greetingEvening'
}

/** 工作台 */
export function WorkspaceScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<AppNavigationProp>()
  const { user, role, setRole, tenant } = useAuth()
  const { colors } = useTheme()
  const styles = useThemedStyles(makeStyles)
  const t = useT()
  const timezone = user?.timezone ?? 'Asia/Shanghai'
  const userId = user?.id ?? ''

  const [refreshing, setRefreshing] = useState(false)

  // ── 快捷入口（权限门禁：隐藏而非置灰） ─────────────────────────
  const can = useCan()

  /** 基础 3 项 + 按权限追加增量 1 入口（提报 / 创建 / 个人计划） */
  const quickEntries = useMemo<QuickEntry[]>(() => {
    const entries: QuickEntry[] = [...BASE_QUICK_ENTRIES]
    if (can('submission:create')) {
      entries.push({
        key: 'submission',
        labelKey: 'screens.core.workspace.quickSubmission',
        icon: 'send',
        target: { type: 'screen', screen: 'Submission' },
      })
    }
    if (can('project:create') || can('task:create')) {
      entries.push({
        key: 'create',
        labelKey: 'screens.core.workspace.quickCreate',
        icon: 'plus-square',
        target: { type: 'screen', screen: 'CreateItem' },
      })
    }
    if (can('personal:manage')) {
      entries.push({
        key: 'personal',
        labelKey: 'screens.core.workspace.quickPersonal',
        icon: 'calendar',
        target: { type: 'screen', screen: 'PersonalPlan' },
      })
    }
    return entries
  }, [can])

  /** 按每行 3 个切块：行内最后一项不设右边距，换行后不产生悬空间距 */
  const quickRows = useMemo<QuickEntry[][]>(() => {
    const rows: QuickEntry[][] = []
    for (let index = 0; index < quickEntries.length; index += QUICK_ENTRY_PER_ROW) {
      rows.push(quickEntries.slice(index, index + QUICK_ENTRY_PER_ROW))
    }
    return rows
  }, [quickEntries])

  // ── 数据：待办 / 临期 / 未读数 ──────────────────────────────────
  const todos = useAsync<Task[]>(() => taskService.listMyTodos(userId), [userId], {
    cache: { key: 'todos:mine' },
  })
  const approaching = useAsync<Task[]>(
    () => taskService.listDeadlineApproaching(userId, timezone),
    [userId, timezone],
    { cache: { key: 'tasks:approaching' } },
  )
  const unread = useAsync<number>(() => focusService.getUnreadCount(userId), [userId], {
    cache: { key: 'unread:count' },
  })
  // 本周完成（M-P2-04）：口径对齐 Web `GET /me/summaries?period=week`（滚动 7 天）
  const summary = useAsync<PeriodSummary>(() => summaryService.getWeekSummary(userId), [userId], {
    cache: { key: 'summary:week' },
  })

  // ── 数据：团队动态（分页累加） ──────────────────────────────────
  const [feedItems, setFeedItems] = useState<AuditFeedItem[]>([])
  const [feedLoading, setFeedLoading] = useState(true)
  const [feedLoadingMore, setFeedLoadingMore] = useState(false)
  const [feedError, setFeedError] = useState<unknown>(null)
  const [feedHasMore, setFeedHasMore] = useState(true)
  const [feedPage, setFeedPage] = useState(1)

  const loadFeed = useCallback(async (page: number) => {
    try {
      setFeedError(null)
      if (page === 1) setFeedLoading(true)
      else setFeedLoadingMore(true)
      const result = await focusService.listAuditFeed(page, FEED_PAGE_SIZE)
      setFeedItems((previous) => (page === 1 ? result.items : [...previous, ...result.items]))
      setFeedHasMore(page * result.pageSize < result.total)
      setFeedPage(page)
    } catch (error) {
      setFeedError(error)
    } finally {
      setFeedLoading(false)
      setFeedLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    void loadFeed(1)
  }, [loadFeed])

  /** 下拉刷新：重置全部分区 */
  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([
      todos.refetch(),
      approaching.refetch(),
      unread.refetch(),
      summary.refetch(),
      loadFeed(1),
    ])
    setRefreshing(false)
  }, [approaching, loadFeed, summary, todos, unread])

  /** 承接任务 */
  const handleClaim = useCallback(
    async (task: Task) => {
      try {
        await taskService.claimTask(task.id, task.version, userId)
        await Promise.all([todos.refetch(), loadFeed(1)])
      } catch {
        await todos.refetch()
      }
    },
    [loadFeed, todos, userId],
  )

  /** 完成提报（按预估工时兜底） */
  const handleComplete = useCallback(
    async (task: Task) => {
      try {
        await taskService.completeTask(task.id, {
          actualHours: task.actualHours ?? task.estimatedHours ?? 1,
          version: task.version,
        })
        await Promise.all([todos.refetch(), loadFeed(1)])
      } catch {
        await todos.refetch()
      }
    },
    [loadFeed, todos],
  )

  /** 待办卡片的右滑操作 */
  const buildActions = useCallback(
    (task: Task): SwipeAction[] => {
      const actions: SwipeAction[] = []
      if (task.status === 'todo') {
        actions.push({ key: 'claim', label: t('screens.core.swipe.claim'), tone: 'primary', onPress: () => void handleClaim(task) })
      }
      if (task.status === 'in_progress' || task.status === 'blocked') {
        actions.push({ key: 'complete', label: t('screens.core.swipe.complete'), tone: 'success', onPress: () => void handleComplete(task) })
      }
      return actions
    },
    [handleClaim, handleComplete, t],
  )

  const openTask = useCallback(
    (taskId: string) => {
      navigation.navigate('TaskDetail', { taskId, from: 'workspace' })
    },
    [navigation],
  )

  /** 快捷入口跳转：Tab 走 Tabs 容器，根栈共享页直接 push（全屏覆盖 TabBar） */
  const handleQuickEntry = useCallback(
    (entry: QuickEntry) => {
      if (entry.target.type === 'tab') {
        navigation.navigate('Tabs', { screen: entry.target.tab })
      } else {
        navigation.navigate(entry.target.screen)
      }
    },
    [navigation],
  )

  const hour = getZonedParts(new Date(), timezone).hour
  const visibleTodos = (todos.data ?? []).slice(0, TODO_LIMIT)
  const approachingList = approaching.data ?? []
  // 数据卡片数值（缺数据时兜底 0，保证不出现 NaN / null）
  const completedCount = summary.data?.stats?.completedCount ?? 0
  const actualHoursTotal = summary.data?.stats?.actualHoursTotal ?? 0

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + layout.screenTop, paddingBottom: spacing.xxxl },
        ]}
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
        {/* 顶部栏 */}
        <FadeIn>
          <View style={styles.header}>
            <Avatar name={user?.displayName ?? t('screens.core.workspace.userFallback')} uri={user?.avatarUrl} size={40} />
            <View style={styles.headerText}>
              <Text style={[typography.title, styles.greeting]}>
                {t(greetingKey(hour))}，{user?.displayName ?? t('screens.core.workspace.colleagueFallback')}
              </Text>
              <Text style={[typography.caption, styles.subGreeting]} numberOfLines={1}>
                {tenant?.name ?? t('screens.core.workspace.noTeam')} · {formatTodayLabel()}
              </Text>
            </View>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={t('screens.core.workspace.switchRoleA11y')}
              onPress={() => void setRole(role === 'manager' ? 'member' : 'manager')}
              scale={0.96}
              style={styles.roleChip}
            >
              <Feather name="user-check" size={layout.icon.sm} color={colors.primary} />
              <Text style={[typography.label, styles.roleText]}>{t(`role.${role}`)}</Text>
            </PressableScale>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={t('screens.core.workspace.notificationsA11y')}
              onPress={() => navigation.navigate('Notifications')}
              scale={0.96}
              style={styles.bell}
            >
              <Feather name="bell" size={layout.icon.lg} color={colors.text.primary} />
              {(unread.data ?? 0) > 0 ? <View style={styles.dot} /> : null}
            </PressableScale>
          </View>
        </FadeIn>

        {/* 临期预警 */}
        {approachingList.length > 0 ? (
          <FadeIn delay={staggerDelay(1)} style={styles.section}>
            <Card style={styles.warningCard}>
              <View style={styles.warningRow}>
                <Feather name="alert-triangle" size={layout.icon.md} color={colors.warning} />
                <Text style={[typography.body, styles.warningTitle]}>
                  {t('screens.core.workspace.approachingWarning', { count: approachingList.length })}
                </Text>
              </View>
              <Text style={[typography.caption, styles.warningDesc]} numberOfLines={2}>
                {t('screens.core.workspace.approachingMostUrgent', { title: approachingList[0].title })}
              </Text>
            </Card>
          </FadeIn>
        ) : null}

        {/* 快捷入口（每行 3 个，超出换行；行数随权限自适应） */}
        <FadeIn delay={staggerDelay(2)} style={styles.section}>
          {quickRows.map((row, rowIndex) => (
            <View
              key={`quick-row-${rowIndex}`}
              style={[styles.quickRow, rowIndex > 0 ? styles.quickRowSpacing : null]}
            >
              {row.map((entry, index) => (
                <PressableScale
                  key={entry.key}
                  accessibilityRole="button"
                  onPress={() => handleQuickEntry(entry)}
                  scale={0.96}
                  style={[styles.quickTile, index < row.length - 1 ? styles.quickTileGap : null]}
                >
                  <View style={styles.quickIcon}>
                    <Feather name={entry.icon} size={layout.icon.md} color={colors.primary} />
                  </View>
                  <Text style={[typography.caption, styles.quickLabel]}>{t(entry.labelKey)}</Text>
                </PressableScale>
              ))}
            </View>
          ))}
        </FadeIn>

        {/* 本周完成（M-P2-04 数据卡片；口径对齐 Web GET /me/summaries?period=week） */}
        <FadeIn delay={staggerDelay(3)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[typography.title, styles.sectionTitle]}>
              {t('screens.core.workspace.weekDoneTitle')}
            </Text>
            <Text style={[typography.caption, styles.sectionMeta]}>
              {t('screens.core.workspace.weekDoneRange')}
            </Text>
          </View>

          {summary.isStale && summary.updatedAt !== null && !summary.error ? (
            <StaleBadge updatedAt={summary.updatedAt} />
          ) : null}

          {summary.loading ? (
            <Card>
              <Skeleton width="45%" height={SUMMARY_SKELETON_HEIGHT} />
              <Skeleton
                width="70%"
                height={SUMMARY_SKELETON_HEIGHT}
                style={styles.summarySkeletonGap}
              />
            </Card>
          ) : summary.error ? (
            <Card>
              <View style={styles.summaryErrorRow}>
                <Feather name="alert-circle" size={layout.icon.md} color={colors.danger} />
                <Text style={[typography.caption, styles.summaryErrorText]} numberOfLines={2}>
                  {isNetworkError(summary.error)
                    ? NETWORK_OFFLINE_MESSAGE
                    : t('screens.core.workspace.summaryLoadFailed')}
                </Text>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={t('screens.core.workspace.retry')}
                  onPress={() => void summary.retry()}
                  scale={0.96}
                  style={styles.summaryRetry}
                >
                  <Feather name="refresh-cw" size={layout.icon.sm} color={colors.primary} />
                  <Text style={[typography.caption, styles.summaryRetryText]}>
                    {t('screens.core.workspace.retry')}
                  </Text>
                </PressableScale>
              </View>
            </Card>
          ) : (
            <Card>
              <View style={styles.summaryRow}>
                <View style={styles.summaryMetric}>
                  <Text style={[typography.mono, styles.summaryValue]}>{completedCount}</Text>
                  <Text style={[typography.caption, styles.summaryLabel]}>
                    {t('screens.core.workspace.completedCountLabel')}
                  </Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryMetric}>
                  <Text style={[typography.mono, styles.summaryValue]}>
                    {formatHours(actualHoursTotal)}
                  </Text>
                  <Text style={[typography.caption, styles.summaryLabel]}>
                    {t('screens.core.workspace.actualHoursLabel')}
                  </Text>
                </View>
              </View>
            </Card>
          )}
        </FadeIn>

        {/* 我的待办 */}
        <FadeIn delay={staggerDelay(4)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[typography.title, styles.sectionTitle]}>
              {t('screens.core.workspace.myTodosTitle')}
            </Text>
            <Text style={[typography.caption, styles.sectionMeta]}>
              {t('screens.core.workspace.todosCount', { count: (todos.data ?? []).length })}
            </Text>
          </View>

          {todos.isStale && todos.updatedAt !== null && !todos.error ? (
            <StaleBadge updatedAt={todos.updatedAt} />
          ) : null}
          {todos.loading ? (
            <LoadingView variant="skeleton" skeletonCount={3} />
          ) : todos.error ? (
            <ErrorState
              message={isNetworkError(todos.error) ? NETWORK_OFFLINE_MESSAGE : undefined}
              onRetry={() => void todos.retry()}
            />
          ) : visibleTodos.length === 0 ? (
            <Card>
              <EmptyState
                icon="check-circle"
                title={t('screens.core.workspace.todosEmptyTitle')}
                description={t('screens.core.workspace.todosEmptyDesc')}
                actionLabel={t('screens.core.workspace.todosEmptyAction')}
                onAction={() => navigation.navigate('Tabs', { screen: 'Today' })}
              />
            </Card>
          ) : (
            visibleTodos.map((task, index) => (
              <FadeIn key={task.id} delay={staggerDelay(index)} style={styles.cardGap}>
                <SwipeableRow actions={buildActions(task)}>
                  <TaskCard
                    task={task}
                    timezone={timezone}
                    onPress={() => openTask(task.id)}
                  />
                </SwipeableRow>
              </FadeIn>
            ))
          )}
        </FadeIn>

        {/* 团队动态 */}
        <FadeIn delay={staggerDelay(5)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[typography.title, styles.sectionTitle]}>
              {t('screens.core.workspace.feedTitle')}
            </Text>
          </View>

          {feedLoading ? (
            <LoadingView variant="skeleton" skeletonCount={2} />
          ) : feedError ? (
            <ErrorState onRetry={() => void loadFeed(1)} />
          ) : feedItems.length === 0 ? (
            <Card>
              <EmptyState
                icon="activity"
                title={t('screens.core.workspace.feedEmptyTitle')}
                description={t('screens.core.workspace.feedEmptyDesc')}
              />
            </Card>
          ) : (
            <Card padded={false} style={styles.feedCard}>
              {feedItems.map((item, index) => (
                <FadeIn key={item.id} delay={staggerDelay(index)}>
                  <PressableScale
                    accessibilityRole="button"
                    onPress={() => {
                      const taskId = focusService.resolveFeedTaskId(item)
                      if (taskId) openTask(taskId)
                    }}
                    scale={1}
                    pressedBg={colors.bg.subtle}
                    style={[
                      styles.feedItem,
                      index < feedItems.length - 1 ? styles.feedDivider : null,
                      index === 0 ? styles.feedItemFirst : null,
                      index === feedItems.length - 1 ? styles.feedItemLast : null,
                    ]}
                  >
                    <View style={styles.feedDot} />
                    <View style={styles.feedBody}>
                      <Text style={[typography.body, styles.feedSummary]} numberOfLines={2}>
                        {item.summary}
                      </Text>
                      <Text style={[typography.caption, styles.feedMeta]}>
                        {item.actorName} · {formatRelativeTime(item.createdAt, timezone)}
                      </Text>
                    </View>
                  </PressableScale>
                </FadeIn>
              ))}
            </Card>
          )}

          {feedHasMore && !feedLoading ? (
            <PressableScale
              accessibilityRole="button"
              disabled={feedLoadingMore}
              onPress={() => void loadFeed(feedPage + 1)}
              scale={1}
              pressedBg={colors.bg.subtle}
              style={styles.loadMore}
            >
              <Text style={[typography.caption, styles.loadMoreText]}>
                {feedLoadingMore
                  ? t('screens.core.workspace.feedLoadingMore')
                  : t('screens.core.workspace.feedLoadMore')}
              </Text>
              <Feather name="chevron-down" size={layout.icon.sm} color={colors.text.secondary} />
            </PressableScale>
          ) : null}
        </FadeIn>
      </ScrollView>
    </View>
  )
}

/** 今日日期标签（工作台副标题） */
function formatTodayLabel(): string {
  const now = new Date()
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${now.getMonth() + 1}月${now.getDate()}日 ${weekdays[now.getDay()]}`
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg.base,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  greeting: {
    color: colors.text.primary,
  },
  subGreeting: {
    color: colors.text.secondary,
    marginTop: spacing.xxs,
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryFaint,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    marginRight: spacing.xs,
  },
  roleText: {
    color: colors.primary,
    marginLeft: spacing.xxs,
  },
  bell: {
    width: layout.icon.lg + spacing.sm,
    height: layout.icon.lg + spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: spacing.xxs,
    right: spacing.xxs,
    width: spacing.xs,
    height: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
  },
  section: {
    marginTop: layout.sectionGap,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.text.primary,
  },
  sectionMeta: {
    color: colors.text.secondary,
  },
  cardGap: {
    marginBottom: layout.cardGap,
  },
  warningCard: {
    backgroundColor: `${colors.warning}0F`,
    borderColor: `${colors.warning}33`,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  warningTitle: {
    color: colors.warning,
    marginLeft: spacing.xs,
    flex: 1,
  },
  warningDesc: {
    color: colors.text.secondary,
    marginTop: spacing.xxs,
  },
  quickRow: {
    flexDirection: 'row',
  },
  quickRowSpacing: {
    marginTop: layout.cardGap,
  },
  quickTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    backgroundColor: colors.bg.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickTileGap: {
    marginRight: layout.cardGap,
  },
  quickIcon: {
    width: spacing.xxl + spacing.xxs,
    height: spacing.xxl + spacing.xxs,
    borderRadius: radius.control,
    backgroundColor: colors.primaryFaint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  quickLabel: {
    color: colors.text.primary,
  },
  feedCard: {
    paddingVertical: spacing.xxs,
  },
  feedItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: layout.cardPadding,
    paddingVertical: spacing.sm,
  },
  feedDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  // 首 / 末行补齐对应角圆角（值 = 容器圆角 token radius.card），
  // 使按下底色与 feedCard 圆角吻合，避免方角戳出卡片轮廓
  feedItemFirst: {
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
  },
  feedItemLast: {
    borderBottomLeftRadius: radius.card,
    borderBottomRightRadius: radius.card,
  },
  feedDot: {
    width: spacing.xs,
    height: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    marginTop: spacing.xs,
    marginRight: spacing.sm,
  },
  feedBody: {
    flex: 1,
  },
  feedSummary: {
    color: colors.text.primary,
  },
  feedMeta: {
    color: colors.text.tertiary,
    marginTop: spacing.xxs,
  },
  loadMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  loadMoreText: {
    color: colors.text.secondary,
    marginRight: spacing.xxs,
  },
  // ── 本周完成数据卡片（M-P2-04） ────────────────────────────────
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryMetric: {
    flex: 1,
    alignItems: 'center',
  },
  summaryValue: {
    color: colors.primary,
  },
  summaryLabel: {
    color: colors.text.secondary,
    marginTop: spacing.xxs,
  },
  summaryDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  summarySkeletonGap: {
    marginTop: spacing.sm,
  },
  summaryErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryErrorText: {
    flex: 1,
    color: colors.text.secondary,
    marginLeft: spacing.xs,
  },
  summaryRetry: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  summaryRetryText: {
    color: colors.primary,
    marginLeft: spacing.xxs,
  },
})
