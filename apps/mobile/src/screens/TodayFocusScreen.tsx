/**
 * 职责：③ 今日聚焦 —— 三分组（今日到期 / 待我审核 / 临期预警）+ 右滑快操作 + 撤销 Toast + AI 提议卡片
 * （ARCH §6.3 / §7 链路② / PRD 6.3）。
 */
import { Feather } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  BottomSheet,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FadeIn,
  LoadingView,
  PressableScale,
  SegmentedControl,
  StaleBadge,
  SwipeableRow,
  TaskCard,
  Tag,
  TextField,
  UndoToast,
  runLayoutAnimation,
  staggerDelay,
  type SwipeAction,
} from '@/components'
import { userMap as buildUserMap } from '@/data'
import { useAsync, useAppContext, useAuth } from '@/hooks'
import type { TranslationKey } from '@/i18n'
import { focusService, taskService } from '@/services'
import { useT } from '@/store/I18nProvider'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { layout, radius, shadow, spacing, typography, type ThemeColors } from '@/theme'
import type { AiProposal, AppNavigationProp, AuditOpinion, Task, TaskStatus } from '@/types'
import { REASON_MIN_LENGTH, getErrorMessage } from '@/types'
import { NETWORK_OFFLINE_MESSAGE, isNetworkError } from '@/types'
import { formatDate, formatWeekday } from '@/utils/date'
import { countVisibleFocusTasks } from '@/utils/focus'
import { useCan } from '@/utils/permission'
import { resolveReviewItemView } from '@/utils/submission'

/** 分组标识 */
type FocusTab = 'due' | 'review' | 'approaching'

/** 待撤销动作类型 */
type UndoKind = 'complete' | 'approve'

/**
 * 驳回抽屉的裁定意见（三裁定之二）：
 * 「驳回」与「退回重改」**共用** `action='reject'`，仅靠 `AuditOpinion` 区分 ——
 * `'reject'` 为驳回、`'rework'` 为退回重改（与审核中心口径一致）。
 */
type RejectOpinion = Extract<AuditOpinion, 'reject' | 'rework'>

/** 撤销状态 */
interface UndoState {
  optimisticId: string
  taskId: string
  message: string
  prevVersion: number
  /** 操作前状态（撤销时回滚目标） */
  prevStatus: TaskStatus
  kind: UndoKind
}

/** 分组选项（键；badge 数量与显示文案在渲染时注入） */
const TAB_OPTIONS: { value: FocusTab; labelKey: TranslationKey }[] = [
  { value: 'due', labelKey: 'screens.core.today.tabDue' },
  { value: 'review', labelKey: 'screens.core.today.tabReview' },
  { value: 'approaching', labelKey: 'screens.core.today.tabApproaching' },
]

/** 各分组的空态文案键 */
const EMPTY_TEXT: Record<FocusTab, { titleKey: TranslationKey; descriptionKey: TranslationKey }> = {
  due: {
    titleKey: 'screens.core.today.emptyDueTitle',
    descriptionKey: 'screens.core.today.emptyDueDesc',
  },
  review: {
    titleKey: 'screens.core.today.emptyReviewTitle',
    descriptionKey: 'screens.core.today.emptyReviewDesc',
  },
  approaching: {
    titleKey: 'screens.core.today.emptyApproachingTitle',
    descriptionKey: 'screens.core.today.emptyApproachingDesc',
  },
}

/** 今日聚焦 */
export function TodayFocusScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<AppNavigationProp>()
  const { user } = useAuth()
  const { colors } = useTheme()
  const styles = useThemedStyles(makeStyles)
  const t = useT()
  const { pushOptimistic, rollbackOptimistic, commitOptimistic } = useAppContext()
  const can = useCan()
  // 统一权限姿势（ARCH §7）：是否具备「查看 / 处理待我审核」权限（PRD §3：仅 manager）
  const canReview = can('review:view_pending')
  const timezone = user?.timezone ?? 'Asia/Shanghai'
  const userId = user?.id ?? ''

  const [tab, setTab] = useState<FocusTab>('due')
  const [refreshing, setRefreshing] = useState(false)
  const [undo, setUndo] = useState<UndoState | null>(null)
  const [rejectTarget, setRejectTarget] = useState<Task | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  /** 驳回抽屉当前裁定意见：'reject'（驳回）或 'rework'（退回重改）；每次打开抽屉时由动作预设 */
  const [rejectOpinion, setRejectOpinion] = useState<RejectOpinion>('reject')
  const [rejecting, setRejecting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  /** 提示 Toast 定时器（卸载时清理，避免卸载后 setState） */
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [])

  /** 展示中文提示 Toast（2.2s 自动消失） */
  const showToast = useCallback((text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(text)
    toastTimer.current = setTimeout(() => setToast(null), 2200)
  }, [])

  const focus = useAsync(() => focusService.getTodayFocus(userId, timezone), [userId, timezone], {
    cache: { key: 'focus:today' },
  })
  const proposals = useAsync<AiProposal[]>(() => focusService.listAiProposals('pending'), [], {
    cache: { key: 'proposals:pending' },
  })

  /**
   * 各分组**徽标**计数（M5-P0-04 / INV-2 / ① 裁定 R5-1，**零行为变更**）：
   * - 徽标 = 该分组的**长度**（**不是**并集）；头部 N = 三分组按 `task.id` 的**并集基数**
   *   （`countVisibleFocusTasks`，见下方 `visibleTotal`）；
   * - 二者**允许不等**（徽标之和 ≥ 头部 N）—— 三分组是三种视角，重叠是定义使然；
   * - **不得**为「让二者相等」而改变任一分组的取数内容（详见 `utils/focus.ts` 口径锚点）。
   */
  const counts = useMemo(
    () => ({
      due: focus.data?.dueToday.length ?? 0,
      review: focus.data?.pendingReview.length ?? 0,
      approaching: focus.data?.approaching.length ?? 0,
    }),
    [focus.data],
  )

  const tabOptions = useMemo(
    () =>
      TAB_OPTIONS
        // 无 review:view_pending 权限时隐藏「待我审核」分组（隐藏而非置灰，ARCH §7）
        .filter((option) => option.value !== 'review' || canReview)
        .map((option) => ({
          value: option.value,
          label: t(option.labelKey),
          badge: counts[option.value],
        })),
    [canReview, counts, t],
  )

  // 兜底：无权限时复位**所有**审批相关 UI 状态，防止角色切换后残留状态被利用越权（DEF-01 / DEF-04）
  //  - 分组：若残留在「待我审核」，强制回落到「今日到期」；
  //  - 驳回抽屉：关闭并清空驳回原因（否则 manager→member 后抽屉仍可见，可触发驳回绕过）。
  // deps 完整：canReview 失权即触发；tab 变化保证分组回落幂等。
  useEffect(() => {
    if (canReview) return
    if (tab === 'review') setTab('due')
    setRejectTarget(null)
    setRejectReason('')
    setRejectOpinion('reject')
  }, [canReview, tab])

  /** 头部汇总计数：三分组按 task.id 取并集（member 不计入「待我审核」整组，K13 / K14） */
  const visibleTotal = countVisibleFocusTasks(focus.data, { includeReview: canReview })

  const currentTasks: Task[] = useMemo(() => {
    if (!focus.data) return []
    if (tab === 'due') return focus.data.dueToday
    if (tab === 'review') return focus.data.pendingReview
    return focus.data.approaching
  }, [focus.data, tab])

  /** 用户索引（审核条目提交人姓名解析，与 BoardScreen / CreateItemScreen 同姿势） */
  const users = useMemo(() => buildUserMap(), [focus.data])

  /** 乐观移除任务（带 layout animation） */
  const dropTask = useCallback(
    (taskId: string) => {
      runLayoutAnimation()
      focus.setData((previous) => {
        if (!previous) return previous
        return {
          dueToday: previous.dueToday.filter((task) => task.id !== taskId),
          pendingReview: previous.pendingReview.filter((task) => task.id !== taskId),
          approaching: previous.approaching.filter((task) => task.id !== taskId),
        }
      })
    },
    [focus],
  )

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([focus.refetch(), proposals.refetch()])
    setRefreshing(false)
  }, [focus, proposals])

  /** 承接 */
  const handleClaim = useCallback(
    async (task: Task) => {
      try {
        await taskService.claimTask(task.id, task.version, userId)
      } finally {
        await focus.refetch()
      }
    },
    [focus, userId],
  )

  /** 完成提报（乐观更新 + 可撤销） */
  const handleComplete = useCallback(
    async (task: Task) => {
      const optimisticId = pushOptimistic({ taskId: task.id, from: task.status, to: 'done' })
      dropTask(task.id)
      setUndo({
        optimisticId,
        taskId: task.id,
        message: t('screens.core.today.undoComplete', { title: task.title }),
        prevVersion: task.version,
        prevStatus: task.status,
        kind: 'complete',
      })
      try {
        await taskService.completeTask(task.id, {
          actualHours: task.actualHours ?? task.estimatedHours ?? 1,
          version: task.version,
        })
      } catch {
        rollbackOptimistic(optimisticId)
        setUndo(null)
        await focus.refetch()
      }
    },
    [dropTask, focus, pushOptimistic, rollbackOptimistic, t],
  )

  /** 审核通过（乐观更新 + 可撤销） */
  const handleApprove = useCallback(
    async (task: Task) => {
      // 防御性门禁（纵深防护，ARCH §7）：无 review:view_pending 权限时绝不发起审核（即便被残留调用）
      if (!canReview) return
      const optimisticId = pushOptimistic({ taskId: task.id, from: task.status, to: 'done' })
      dropTask(task.id)
      setUndo({
        optimisticId,
        taskId: task.id,
        message: t('screens.core.today.undoApprove', { title: task.title }),
        prevVersion: task.version,
        prevStatus: task.status,
        kind: 'approve',
      })
      try {
        await taskService.reviewSubmission(task.id, 'approve', task.version)
      } catch {
        rollbackOptimistic(optimisticId)
        setUndo(null)
        await focus.refetch()
      }
    },
    [canReview, dropTask, focus, pushOptimistic, rollbackOptimistic, t],
  )

  /** 撤销：按操作类型回滚到原状态；失败用中文 Toast 提示并刷新（建议 1 + 建议 2） */
  const handleUndo = useCallback(async () => {
    const current = undo
    if (!current) return
    rollbackOptimistic(current.optimisticId)
    setUndo(null)
    // 撤销「审核通过」回到 in_progress 并复位提报态；撤销「完成」回原状态（blocked 不可直接回滚则退回进行中）
    const targetStatus: TaskStatus =
      current.kind === 'approve'
        ? 'in_progress'
        : current.prevStatus === 'blocked'
          ? 'in_progress'
          : current.prevStatus
    try {
      await taskService.undoCompletion(current.taskId, {
        status: targetStatus,
        // 三态（K2 / K3）：撤销「完成」⇒ 清理审核态（null）；撤销「审核通过」⇒ 仅置回待审（'pending'）
        submissionStatus: current.kind === 'approve' ? 'pending' : null,
        version: current.prevVersion + 1,
        reason: current.kind === 'complete' ? '用户撤销完成操作' : '用户撤销审核通过',
      })
    } catch {
      showToast(t('screens.core.today.undoFailed'))
    } finally {
      await focus.refetch()
    }
  }, [focus, rollbackOptimistic, showToast, t, undo])

  /** 超时未撤销：提交乐观登记 */
  const handleUndoExpire = useCallback(() => {
    if (!undo) return
    commitOptimistic(undo.optimisticId)
    setUndo(null)
  }, [commitOptimistic, undo])

  /** 提交驳回 / 退回重改（二者 action 同为 'reject'，仅靠 opinion 区分） */
  const handleRejectConfirm = useCallback(async () => {
    // 门禁（DEF-04）：无 review:view_pending 权限时绝不调用审核接口；
    // 同时复位残留抽屉状态（角色切换后抽屉可能仍可见，属越权绕过路径）
    if (!canReview) {
      setRejectTarget(null)
      setRejectReason('')
      setRejectOpinion('reject')
      return
    }
    const target = rejectTarget
    if (!target) return
    setRejecting(true)
    try {
      // 第 5 参数 actorId 传 undefined：保持服务端既有缺省回落行为不变；
      // 第 6 参数 opinion 透传当前裁定（'reject' 驳回 / 'rework' 退回重改）
      await taskService.reviewSubmission(
        target.id,
        'reject',
        target.version,
        rejectReason.trim(),
        undefined,
        rejectOpinion,
      )
      setRejectTarget(null)
      setRejectReason('')
      setRejectOpinion('reject')
    } catch (error) {
      // B2 修正（增量 7）：驳回失败给出中文提示，并刷新以回到服务端最新状态
      showToast(getErrorMessage(error))
    } finally {
      setRejecting(false)
      await focus.refetch()
    }
  }, [canReview, focus, rejectOpinion, rejectReason, rejectTarget, showToast])

  /** 确认 / 驳回 AI 提议 */
  const handleProposal = useCallback(
    async (proposal: AiProposal, action: 'approve' | 'reject') => {
      try {
        if (action === 'approve') {
          await focusService.approveAiProposal(proposal.id, userId)
        } else {
          await focusService.rejectAiProposal(proposal.id, '演示环境驳回', userId)
        }
      } finally {
        await proposals.refetch()
      }
    },
    [proposals, userId],
  )

  const openTask = useCallback(
    (taskId: string) => {
      navigation.navigate('TaskDetail', { taskId, from: 'today' })
    },
    [navigation],
  )

  /**
   * 打开驳回 / 退回重改抽屉并预置裁定意见。
   * 右滑动作与卡片内联三枚按钮**共用**本入口，确保二者行为零分叉。
   */
  const openRejectDrawer = useCallback((task: Task, opinion: RejectOpinion) => {
    setRejectTarget(task)
    setRejectReason('')
    setRejectOpinion(opinion)
  }, [])

  /** 按分组生成右滑操作 */
  const buildActions = useCallback(
    (task: Task): SwipeAction[] => {
      if (tab === 'review') {
        // 防御性门禁：无 review:view_pending 权限时绝不产生「通过 / 驳回 / 退回重改」审批动作
        // （PRD §3 / M2-P0-01；即便因状态残留进入该分支也不泄露审批能力）
        if (!canReview) return []
        return [
          { key: 'approve', label: t('screens.core.today.swipeApprove'), tone: 'success', onPress: () => void handleApprove(task) },
          {
            key: 'reject',
            label: t('screens.core.today.swipeReject'),
            tone: 'danger',
            onPress: () => openRejectDrawer(task, 'reject'),
          },
          {
            key: 'rework',
            label: t('screens.core.today.swipeRework'),
            tone: 'warning',
            onPress: () => openRejectDrawer(task, 'rework'),
          },
        ]
      }
      if (task.status === 'todo') {
        return [{ key: 'claim', label: t('screens.core.swipe.claim'), tone: 'primary', onPress: () => void handleClaim(task) }]
      }
      return [{ key: 'complete', label: t('screens.core.swipe.complete'), tone: 'success', onPress: () => void handleComplete(task) }]
    },
    [canReview, handleApprove, handleClaim, handleComplete, openRejectDrawer, t, tab],
  )

  const pendingProposals = proposals.data ?? []
  const empty = EMPTY_TEXT[tab]
  /** 驳回抽屉是否处于「退回重改」口径（驱动标题 / 文案 / 按钮的措辞与语义色） */
  const isRework = rejectOpinion === 'rework'
  /** 「待我审核」分组 + 审核权限：内联三枚审批按钮与「查看详情」提示的统一门禁（隐藏而非置灰） */
  const isReviewTab = tab === 'review' && canReview

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + layout.screenTop, paddingBottom: spacing.xxxl * 2 },
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
        {/* 日期头 */}
        <FadeIn>
          <Text style={[typography.display, styles.title]}>{t('screens.core.today.title')}</Text>
          <Text style={[typography.caption, styles.subtitle]}>
            {t('screens.core.today.subtitle', {
              date: `${formatDate(new Date(), timezone)} ${formatWeekday(new Date(), timezone)}`,
              count: visibleTotal,
            })}
          </Text>
        </FadeIn>

        {/* 分组切换 */}
        <FadeIn delay={staggerDelay(1)} style={styles.segmentedWrapper}>
          <SegmentedControl options={tabOptions} value={tab} onChange={setTab} />
        </FadeIn>

        {/* AI 提议（P1，仅在待审核分组展示） */}
        {tab === 'review' && pendingProposals.length > 0 ? (
          <FadeIn delay={staggerDelay(2)} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Feather name="cpu" size={layout.icon.md} color={colors.primarySoft} />
              <Text style={[typography.title, styles.sectionTitle]}>
                {t('screens.core.today.aiTitle')}
              </Text>
              <Text style={[typography.caption, styles.sectionMeta]}>
                {t('screens.core.today.aiMeta', { count: pendingProposals.length })}
              </Text>
            </View>
            {pendingProposals.map((proposal, index) => (
              <FadeIn key={proposal.id} delay={staggerDelay(index)} style={styles.cardGap}>
                <Card>
                  <View style={styles.proposalHeader}>
                    <Tag text={t(`aiProposalType.${proposal.type}`)} tone="neutral" />
                    <Text style={[typography.caption, styles.proposalMeta]}>
                      {t('screens.core.today.aiGeneratedAt', {
                        date: formatDate(proposal.createdAt, timezone),
                      })}
                    </Text>
                  </View>
                  <Text style={[typography.body, styles.proposalSummary]}>
                    {proposal.payload.summary}
                  </Text>
                  <View style={styles.proposalTasks}>
                    {proposal.payload.tasks.slice(0, 4).map((item, taskIndex) => (
                      <View key={`${proposal.id}-${taskIndex}`} style={styles.proposalTaskRow}>
                        <View style={styles.proposalBullet} />
                        <Text style={[typography.caption, styles.proposalTaskText]} numberOfLines={1}>
                          {item.title} · {item.estimatedHours}h
                        </Text>
                      </View>
                    ))}
                  </View>
                  {proposal.payload.warnings.length > 0 ? (
                    <View style={styles.warningRow}>
                      <Feather name="alert-triangle" size={layout.icon.sm} color={colors.warning} />
                      <Text style={[typography.caption, styles.warningText]} numberOfLines={2}>
                        {proposal.payload.warnings[0]}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.proposalActions}>
                    <View style={styles.proposalButton}>
                      <Button
                        label={t('screens.core.today.aiReject')}
                        variant="secondary"
                        fullWidth
                        onPress={() => void handleProposal(proposal, 'reject')}
                      />
                    </View>
                    <View style={styles.proposalButton}>
                      <Button
                        label={t('screens.core.today.aiApprove')}
                        fullWidth
                        onPress={() => void handleProposal(proposal, 'approve')}
                      />
                    </View>
                  </View>
                </Card>
              </FadeIn>
            ))}
          </FadeIn>
        ) : null}

        {/* 任务分组列表 */}
        <View style={styles.section}>
          {focus.isStale && focus.updatedAt !== null && !focus.error ? (
            <StaleBadge updatedAt={focus.updatedAt} />
          ) : null}
          {focus.loading ? (
            <LoadingView variant="skeleton" skeletonCount={3} />
          ) : focus.error ? (
            <ErrorState
              message={isNetworkError(focus.error) ? NETWORK_OFFLINE_MESSAGE : undefined}
              onRetry={() => void focus.retry()}
            />
          ) : currentTasks.length === 0 ? (
            <Card>
              <EmptyState
                icon="check-circle"
                title={t(empty.titleKey)}
                description={t(empty.descriptionKey)}
                actionLabel={tab === 'due' ? t('screens.core.today.goProjects') : undefined}
                onAction={
                  tab === 'due' ? () => navigation.navigate('Tabs', { screen: 'Project' }) : undefined
                }
              />
            </Card>
          ) : (
            currentTasks.map((task, index) => {
              // 仅「待我审核」分组（且有审核权限）按 resolveApproveBranch 分叉注入 footer / 内联审批动作
              // （K9：due / approaching 不传）
              const reviewView = isReviewTab ? resolveReviewItemView(task) : null
              const submitterName = reviewView?.submitterId
                ? (users.get(reviewView.submitterId)?.displayName ?? '')
                : ''
              return (
                <FadeIn key={task.id} delay={staggerDelay(index)} style={styles.cardGap}>
                  <SwipeableRow actions={buildActions(task)}>
                    <TaskCard
                      task={task}
                      timezone={timezone}
                      compact
                      onPress={() => openTask(task.id)}
                      footer={
                        reviewView ? (
                          <View style={styles.reviewFooter}>
                            <Tag tone="status" status={reviewView.tagStatus} text={reviewView.label} />
                            <Text style={[typography.caption, styles.reviewMeta]} numberOfLines={1}>
                              {submitterName} {reviewView.actionText}
                            </Text>
                          </View>
                        ) : undefined
                      }
                      right={
                        // PRD §7.3：仅「待我审核」分组给出「查看详情」视觉入口（卡片整体可点即进详情）。
                        // 用**非交互**的 Text + 箭头（而非 Button），避免与 Card 的 Pressable 形成
                        // `<button>` 嵌套（P1）；无审核权限时不渲染。
                        isReviewTab ? (
                          <View style={styles.detailHint}>
                            <Text style={[typography.caption, styles.detailHintText]}>
                              {t('screens.core.today.viewDetail')}
                            </Text>
                            <Feather
                              name="chevron-right"
                              size={layout.icon.sm}
                              color={colors.text.tertiary}
                            />
                          </View>
                        ) : undefined
                      }
                    />
                  </SwipeableRow>
                  {/* 三枚审批动作：**默认可见**（置于卡片 Pressable 之外 —— 既非右滑层、也不依赖滚动到底部） */}
                  {reviewView ? (
                    <View style={styles.reviewActions}>
                      <PressableScale
                        style={[styles.reviewActionBtn, styles.reviewApproveBtn]}
                        onPress={() => void handleApprove(task)}
                        pressedBg={colors.bg.subtle}
                        accessibilityRole="button"
                        accessibilityLabel={t('screens.core.today.reviewA11yApprove')}
                      >
                        <Text style={[typography.label, styles.reviewApproveText]} numberOfLines={1}>
                          {t('reviewAction.approve')}
                        </Text>
                      </PressableScale>
                      <PressableScale
                        style={[styles.reviewActionBtn, styles.reviewActionGap, styles.reviewRejectBtn]}
                        onPress={() => openRejectDrawer(task, 'reject')}
                        pressedBg={colors.bg.subtle}
                        accessibilityRole="button"
                        accessibilityLabel={t('screens.core.today.reviewA11yReject')}
                      >
                        <Text style={[typography.label, styles.reviewRejectText]} numberOfLines={1}>
                          {t('reviewAction.reject')}
                        </Text>
                      </PressableScale>
                      <PressableScale
                        style={[styles.reviewActionBtn, styles.reviewActionGap, styles.reviewReworkBtn]}
                        onPress={() => openRejectDrawer(task, 'rework')}
                        pressedBg={colors.bg.subtle}
                        accessibilityRole="button"
                        accessibilityLabel={t('screens.core.today.reviewA11yRework')}
                      >
                        <Text style={[typography.label, styles.reviewReworkText]} numberOfLines={1}>
                          {t('reviewAction.rework')}
                        </Text>
                      </PressableScale>
                    </View>
                  ) : null}
                </FadeIn>
              )
            })
          )}
        </View>

        {/* 右滑提示 */}
        {currentTasks.length > 0 ? (
          <View style={styles.hintRow}>
            <Feather name="chevrons-right" size={layout.icon.sm} color={colors.text.tertiary} />
            <Text style={[typography.caption, styles.hintText]}>
              {t('screens.core.today.swipeHint')}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* 撤销 Toast */}
      <UndoToast
        visible={undo !== null}
        message={undo?.message ?? ''}
        onUndo={() => void handleUndo()}
        onExpire={handleUndoExpire}
      />

      {/* 错误提示 Toast（撤销失败等） */}
      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + spacing.xxl }]} pointerEvents="none">
          <Text style={[typography.caption, styles.toastText]}>{toast}</Text>
        </View>
      ) : null}

      {/* 驳回 / 退回重改原因抽屉 */}
      <BottomSheet
        visible={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        title={
          isRework
            ? t('screens.core.today.rejectSheetTitleRework')
            : t('screens.core.today.rejectSheetTitleReject')
        }
        heightRatio={0.42}
      >
        <Text style={[typography.caption, styles.rejectHint]}>
          {t('screens.core.today.rejectHintSuffix', {
            label: isRework
              ? t('screens.core.today.rejectReasonRework')
              : t('screens.core.today.rejectReasonReject'),
            title: rejectTarget?.title ?? '',
          })}
        </Text>
        <View style={styles.rejectField}>
          <TextField
            label={
              isRework
                ? t('screens.core.today.rejectFieldRework')
                : t('screens.core.today.rejectFieldReject')
            }
            value={rejectReason}
            onChangeText={setRejectReason}
            multiline
            maxLength={200}
          />
        </View>
        <Button
          label={
            isRework
              ? t('screens.core.today.confirmRework')
              : t('screens.core.today.confirmReject')
          }
          variant={isRework ? 'warning' : 'danger'}
          fullWidth
          loading={rejecting}
          disabled={rejectReason.trim().length < REASON_MIN_LENGTH}
          onPress={() => void handleRejectConfirm()}
        />
      </BottomSheet>
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
  },
  title: {
    color: colors.text.primary,
  },
  subtitle: {
    color: colors.text.secondary,
    marginTop: spacing.xxs,
  },
  segmentedWrapper: {
    marginTop: spacing.md,
  },
  section: {
    marginTop: layout.sectionGap,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.text.primary,
    marginLeft: spacing.xs,
    flex: 1,
  },
  sectionMeta: {
    color: colors.text.secondary,
  },
  cardGap: {
    marginBottom: layout.cardGap,
  },
  reviewFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xxs,
  },
  reviewMeta: {
    color: colors.text.secondary,
    marginLeft: spacing.xs,
    flex: 1,
  },
  /** 「查看详情」非交互提示（卡片右侧；卡片整体可点即进详情） */
  detailHint: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailHintText: {
    color: colors.text.secondary,
  },
  /** 卡片下方内联审批动作行（默认可见，右对齐；按钮风格对齐审核中心「三色柔和按钮」） */
  reviewActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: spacing.xs,
  },
  /** 单枚审批动作按钮底（浅底 + 描边，配色由变体提供） */
  reviewActionBtn: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radius.control,
    borderWidth: 1,
  },
  /** 第二、三枚与前一行的间距 */
  reviewActionGap: {
    marginLeft: spacing.xs,
  },
  /** 「通过」：浅绿底 + 绿描边 */
  reviewApproveBtn: {
    backgroundColor: colors.successFaint,
    borderColor: colors.success,
  },
  /** 「通过」文案：绿字 */
  reviewApproveText: {
    color: colors.success,
  },
  /** 「不通过」：浅红底 + 红描边 */
  reviewRejectBtn: {
    backgroundColor: colors.dangerFaint,
    borderColor: colors.danger,
  },
  /** 「不通过」文案：红字 */
  reviewRejectText: {
    color: colors.danger,
  },
  /** 「退回重改」：浅琥珀底 + 琥珀描边 */
  reviewReworkBtn: {
    backgroundColor: colors.warningFaint,
    borderColor: colors.warning,
  },
  /** 「退回重改」文案：琥珀字 */
  reviewReworkText: {
    color: colors.warning,
  },
  proposalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  proposalMeta: {
    color: colors.text.tertiary,
  },
  proposalSummary: {
    color: colors.text.primary,
    marginTop: spacing.sm,
  },
  proposalTasks: {
    marginTop: spacing.sm,
  },
  proposalTaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xxs,
  },
  proposalBullet: {
    width: spacing.xxs,
    height: spacing.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    marginRight: spacing.xs,
  },
  proposalTaskText: {
    color: colors.text.secondary,
    flex: 1,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  warningText: {
    color: colors.warning,
    marginLeft: spacing.xxs,
    flex: 1,
  },
  proposalActions: {
    flexDirection: 'row',
    marginTop: spacing.md,
  },
  proposalButton: {
    flex: 1,
    marginRight: spacing.sm,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  hintText: {
    color: colors.text.tertiary,
    marginLeft: spacing.xxs,
  },
  rejectHint: {
    color: colors.text.secondary,
  },
  rejectField: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  toast: {
    position: 'absolute',
    left: layout.screenPadding,
    right: layout.screenPadding,
    backgroundColor: colors.primary,
    borderRadius: radius.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    ...shadow.floating,
  },
  toastText: {
    color: colors.text.inverse,
  },
})
