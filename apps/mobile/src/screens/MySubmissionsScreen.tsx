/**
 * 职责：我的提报页（MySubmissions）—— 提报记录状态查看 + 待审撤回
 * （PRD M2-P1-02）。三态渲染复用 useAsync / StateViews；撤回走 BottomSheet
 * 二次确认；轻提示 Toast 复用今日聚焦的「state + 定时器 + 提示条」手法。
 */
import { useNavigation } from '@react-navigation/native'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  BottomSheet,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FadeIn,
  LoadingView,
  ScreenHeader,
  StaleBadge,
  Tag,
  staggerDelay,
} from '@/components'
import { useAsync, useAuth } from '@/hooks'
import { taskService } from '@/services'
import { useThemedStyles } from '@/store/ThemeProvider'
import { NETWORK_OFFLINE_MESSAGE, isNetworkError } from '@/types'
import { layout, radius, shadow, spacing, typography, type ThemeColors } from '@/theme'
import type {
  AppNavigationProp,
  AuditLog,
  AuditOpinion,
  SubmissionKind,
  SubmissionStatus,
  Task,
} from '@/types'
import { getErrorMessage } from '@/types'
import { formatRelativeTime } from '@/utils/format'
import { goBackOrHome } from '@/utils/navigation'
import { useCan } from '@/utils/permission'

/** 状态标签语义色调（本文件私有，避免与并行任务改 types/ 冲突） */
type StatusTone = 'neutral' | 'warning' | 'success' | 'danger'

/** 提报状态 → 中文文案 + 语义色调 */
const SUBMISSION_STATUS_META: Record<SubmissionStatus, { text: string; tone: StatusTone }> = {
  draft: { text: '草稿', tone: 'neutral' },
  pending: { text: '待审核', tone: 'warning' },
  approved: { text: '已通过', tone: 'success' },
  rejected: { text: '已驳回', tone: 'danger' },
  withdrawn: { text: '已撤回', tone: 'neutral' },
}

/** 语义色调 → 前景色 / 8% 淡底（取主题语义色，与 Tag 胶囊同构；运行时按当前色板求值，C7） */
const makeToneStyle = (colors: ThemeColors): Record<StatusTone, { color: string; bg: string }> => ({
  neutral: { color: colors.text.secondary, bg: colors.bg.subtle },
  warning: { color: colors.warning, bg: `${colors.warning}14` },
  success: { color: colors.success, bg: `${colors.success}14` },
  danger: { color: colors.danger, bg: `${colors.danger}14` },
})

/** 提报状态呈现：文案 / 语义色调 / 原因行前缀 */
interface SubmissionView {
  text: string
  tone: StatusTone
  /** 原因行前缀：退回重改 → 「退回原因：」；其余 → 「驳回原因：」 */
  noteLabel: string
}

/** 取末条审核留痕意见（无日志时为 undefined） */
function lastAuditOpinion(logs: AuditLog[] | undefined): AuditOpinion | undefined {
  return logs?.at(-1)?.opinion
}

/**
 * 是否「退回重改」：仅当提报已驳回（`rejected`）且末条审核留痕意见为 `rework`。
 *
 * 判定条件与增量 7.8 通知分叉**逐字一致**
 * （`submissionStatus === 'rejected' && auditLogs.at(-1)?.opinion === 'rework'`）。
 */
function isReworkSubmission(task: Task): boolean {
  return task.submissionStatus === 'rejected' && lastAuditOpinion(task.auditLogs) === 'rework'
}

/**
 * 提报状态呈现的**单一判定点**：把「退回重改 / 已驳回」收敛到一处，避免状态标与原因前缀
 * 各判一次而分叉。命中退回重改 ⇒ 文案「退回重改」+ `warning` 色调 + 「退回原因：」前缀；
 * 未命中 ⇒ **逐字回落既有 `SUBMISSION_STATUS_META`**（非 rejected 状态呈现不得改变）。
 */
function resolveSubmissionView(task: Task): SubmissionView {
  if (isReworkSubmission(task)) {
    return { text: '退回重改', tone: 'warning', noteLabel: '退回原因：' }
  }
  return {
    ...SUBMISSION_STATUS_META[task.submissionStatus ?? 'draft'],
    noteLabel: '驳回原因：',
  }
}

/** 提报类型中文文案（徽标用） */
const SUBMISSION_KIND_TEXT: Record<SubmissionKind, string> = {
  project: '项目',
  task: '任务',
}

/** 轻提示自动消失时长（毫秒，与今日聚焦一致） */
const TOAST_DURATION = 2200
/** 撤回确认抽屉占屏比例 */
const WITHDRAW_SHEET_RATIO = 0.42

/** 我的提报页 */
export function MySubmissionsScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<AppNavigationProp>()
  const { user } = useAuth()
  const can = useCan()
  const toneStyle = useThemedStyles(makeToneStyle)
  const styles = useThemedStyles(makeStyles)
  const userId = user?.id ?? ''
  const timezone = user?.timezone ?? 'Asia/Shanghai'
  const canWithdraw = can('submission:withdraw')

  const submissions = useAsync(() => taskService.listMySubmissions(userId), [userId], {
    cache: { key: 'submissions:mine' },
  })

  const [withdrawTarget, setWithdrawTarget] = useState<Task | null>(null)
  const [withdrawing, setWithdrawing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  /** 轻提示定时器（卸载时清理，避免卸载后 setState） */
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [])

  /** 展示中文轻提示（自动消失） */
  const showToast = useCallback((text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(text)
    toastTimer.current = setTimeout(() => setToast(null), TOAST_DURATION)
  }, [])

  /** 确认撤回：成功后刷新并轻提示；失败提示错误并刷新 */
  const handleWithdrawConfirm = useCallback(async () => {
    const target = withdrawTarget
    if (!target) return
    setWithdrawing(true)
    try {
      await taskService.withdrawSubmission(target.id, target.version, userId)
      setWithdrawTarget(null)
      showToast('已撤回')
    } catch (error) {
      showToast(getErrorMessage(error))
    } finally {
      setWithdrawing(false)
      await submissions.refetch()
    }
  }, [showToast, submissions, userId, withdrawTarget])

  const list = submissions.data ?? []

  return (
    <View style={styles.root}>
      <ScreenHeader title="我的提报" onBack={() => goBackOrHome(navigation)} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {submissions.isStale && submissions.updatedAt !== null && !submissions.error ? (
          <StaleBadge updatedAt={submissions.updatedAt} />
        ) : null}
        {submissions.loading ? (
          <LoadingView variant="skeleton" skeletonCount={3} />
        ) : submissions.error ? (
          <ErrorState
            message={isNetworkError(submissions.error) ? NETWORK_OFFLINE_MESSAGE : undefined}
            onRetry={() => void submissions.retry()}
          />
        ) : list.length === 0 ? (
          <Card>
            <EmptyState
              icon="inbox"
              title="还没有提报记录"
              description="去工作台提报一个新事项"
              actionLabel="返回"
              onAction={() => navigation.goBack()}
            />
          </Card>
        ) : (
          list.map((task, index) => {
            const view = resolveSubmissionView(task)
            const tone = toneStyle[view.tone]
            const withdrawable = task.submissionStatus === 'pending' && canWithdraw
            return (
              <FadeIn key={task.id} delay={staggerDelay(index)} style={styles.cardGap}>
                <Card>
                  <View style={styles.cardHeader}>
                    <Text style={[typography.title, styles.cardTitle]} numberOfLines={2}>
                      {task.title}
                    </Text>
                    {withdrawable ? (
                      <Button label="撤回" variant="ghost" onPress={() => setWithdrawTarget(task)} />
                    ) : null}
                  </View>

                  <View style={styles.badgeRow}>
                    <Tag text={SUBMISSION_KIND_TEXT[task.submissionKind ?? 'task']} tone="neutral" />
                    <View style={styles.badgeGap} />
                    <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
                      <Text style={[typography.label, { color: tone.color }]}>{view.text}</Text>
                    </View>
                  </View>

                  <Text style={[typography.caption, styles.time]}>
                    {formatRelativeTime(task.updatedAt, timezone)}
                  </Text>

                  {task.reviewNote ? (
                    <Text style={[typography.caption, styles.reviewNote]} numberOfLines={3}>
                      {view.noteLabel}{task.reviewNote}
                    </Text>
                  ) : null}
                </Card>
              </FadeIn>
            )
          })
        )}
      </ScrollView>

      {/* 轻提示 */}
      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + spacing.xxl }]} pointerEvents="none">
          <Text style={[typography.caption, styles.toastText]}>{toast}</Text>
        </View>
      ) : null}

      {/* 撤回二次确认 */}
      <BottomSheet
        visible={withdrawTarget !== null}
        onClose={() => setWithdrawTarget(null)}
        title="撤回提报"
        heightRatio={WITHDRAW_SHEET_RATIO}
      >
        <Text style={[typography.caption, styles.sheetText]}>
          撤回后该提报将不再进入审核列表，确定撤回吗？
        </Text>
        <View style={styles.sheetActions}>
          <View style={styles.sheetButton}>
            <Button
              label="取消"
              variant="secondary"
              fullWidth
              onPress={() => setWithdrawTarget(null)}
            />
          </View>
          <View style={styles.sheetButton}>
            <Button
              label="确定撤回"
              variant="danger"
              fullWidth
              loading={withdrawing}
              onPress={() => void handleWithdrawConfirm()}
            />
          </View>
        </View>
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
    paddingBottom: spacing.xxxl,
  },
  cardGap: {
    marginBottom: layout.cardGap,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardTitle: {
    flex: 1,
    color: colors.text.primary,
    marginRight: spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  badgeGap: {
    width: spacing.xs,
  },
  statusPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  time: {
    color: colors.text.tertiary,
    marginTop: spacing.xs,
  },
  reviewNote: {
    color: colors.danger,
    marginTop: spacing.xs,
  },
  sheetText: {
    color: colors.text.secondary,
  },
  sheetActions: {
    flexDirection: 'row',
    marginTop: spacing.md,
  },
  sheetButton: {
    flex: 1,
    marginRight: spacing.sm,
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
