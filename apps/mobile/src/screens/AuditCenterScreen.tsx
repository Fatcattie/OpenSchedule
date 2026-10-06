/**
 * 职责：审核中心（AuditCenter，增量 7）—— 四栏（待提报 / 待审核 / 审核通过 / 撤回审核）。
 *
 * 对标 `apps/web/src/pages/AuditPage.tsx`：移动端窄屏用 `SegmentedControl` + 角标承载四栏，
 * 四栏筛选落在纯函数 `utils/audit.ts`；审核动作经 `BottomSheet`（动作单选 + 意见四选 + 原因）编排到
 * `auditService.submitAudit`。
 *
 * 待审核栏卡片**下方**为一行三枚柔和按钮（右对齐）：通过（浅绿底 + 绿字）/ 不通过（浅红底 + 红字）/
 * 退回重改（浅琥珀底 + 琥珀字）。三者均**打开既有抽屉**（不再直过），仅预置的「审核动作 + 审核意见」不同：
 * 通过 → approve / agree；不通过 → reject / reject；退回重改 → reject / rework。
 * 抽屉内「提交审核」仍是唯一提交入口（复用 `runSubmit` 的全部前置校验）；无权限时不渲染。
 *
 * ⚠️ 三枚动作渲染为**卡片之后的兄弟节点**（不经 `TaskCard.right` 插槽）：`TaskCard` 恒给 `Card`
 * 传 `onPress`，RN Web 会把该 `Pressable` 渲染为真实 `<button>`，若动作落在插槽内会产生
 * `<button>` 嵌套 `<button>`。此写法对齐 `TodayFocusScreen` 已验证模式。
 *
 * 角色门禁：`useCan('review:view_pending')`（仅 manager）；无权限时**不渲染**三个动作
 * （对齐 `TodayFocusScreen.tsx:331-333` 的防御写法）。审批门禁（M2）：`canApproveMainTask` 禁用「通过」。
 *
 * 硬约束：样式数值只取 `tokens.ts`；新交互一律 `PressableScale` / 既有组件，**不新增裸 Pressable**。
 */
import { useNavigation } from '@react-navigation/native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  AuditLogItem,
  BottomSheet,
  Button,
  Card,
  DateTimeField,
  EmptyState,
  ErrorState,
  FadeIn,
  LoadingView,
  PressableScale,
  ScreenHeader,
  SegmentedControl,
  StaleBadge,
  TaskCard,
  TextField,
  staggerDelay,
} from '@/components'
import { userMap as buildUserMap } from '@/data'
import { useAsync, useAuth } from '@/hooks'
import { auditService, type SubmitAuditAction } from '@/services'
import { NETWORK_OFFLINE_MESSAGE, isNetworkError } from '@/types'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { layout, radius, shadow, spacing, typography, type ThemeColors } from '@/theme'
import {
  REASON_MIN_LENGTH,
  getErrorMessage,
  type AppNavigationProp,
  type AuditOpinion,
  type Task,
} from '@/types'
import {
  OPINION_OPTIONS,
  REVIEW_ACTION_A11Y,
  REVIEW_ACTION_LABEL,
  canApproveMainTask,
  filterApproved,
  filterPendingAudit,
  filterPendingReport,
  filterWithdrawnLogs,
  type DateRange,
} from '@/utils/audit'
import { goBackOrHome } from '@/utils/navigation'
import { useCan } from '@/utils/permission'
import { isWithdrawable } from '@/utils/submission'

/** 四栏标识 */
type AuditTab = 'report' | 'audit' | 'approved' | 'withdrawn'

/** 四栏选项（badge 数量在渲染时注入） */
const TAB_OPTIONS: { value: AuditTab; label: string }[] = [
  { value: 'report', label: '待提报' },
  { value: 'audit', label: '待审核' },
  { value: 'approved', label: '审核通过' },
  { value: 'withdrawn', label: '撤回审核' },
]

/** 各栏空态文案 */
const EMPTY_TEXT: Record<AuditTab, { title: string; description: string }> = {
  report: { title: '没有待提报事项', description: '相关事项都已完成或已提交审核' },
  audit: { title: '没有待审核事项', description: '成员提交完成提报后会出现在这里' },
  approved: { title: '没有已通过的审核', description: '可调整日期区间查看历史' },
  withdrawn: { title: '没有驳回 / 撤回记录', description: '可调整日期区间查看历史' },
}

/** 审核动作选项 */
const ACTION_OPTIONS: { value: SubmitAuditAction; label: string }[] = [
  { value: 'approve', label: '通过' },
  { value: 'reject', label: '驳回' },
  { value: 'withdraw', label: '撤回' },
]

/** 审核抽屉占屏比例 */
const AUDIT_SHEET_RATIO = 0.62
/** 轻提示自动消失时长（毫秒） */
const TOAST_DURATION = 2200
/**
 * 「待审核」栏卡片三枚动作的**显示文案 / accessibilityLabel**。
 *
 * 单一事实来源：取自审核域共用常量 `REVIEW_ACTION_LABEL` / `REVIEW_ACTION_A11Y`
 * （今日聚焦「待我审核」卡片内联三枚按钮共用同一份），避免两处分叉。
 * accessibilityLabel 带「审核」前缀、与显示文案分离（详见 `utils/audit.ts` 注释）。
 */
const { approve: APPROVE_LABEL, reject: REJECT_LABEL, rework: REWORK_LABEL } = REVIEW_ACTION_LABEL
const { approve: APPROVE_A11Y, reject: REJECT_A11Y, rework: REWORK_A11Y } = REVIEW_ACTION_A11Y

/** 提交审核的入参（抽屉提交入口使用） */
interface SubmitParams {
  /** 目标任务 */
  target: Task
  /** 审核动作 */
  action: SubmitAuditAction
  /** 审核意见 */
  opinion: AuditOpinion
  /** 原因 / 备注原文（函数内部去空白） */
  reasonText: string
}

/** 审核中心页 */
export function AuditCenterScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<AppNavigationProp>()
  const { user } = useAuth()
  const { colors } = useTheme()
  const styles = useThemedStyles(makeStyles)
  const can = useCan()
  const canReview = can('review:view_pending')
  const userId = user?.id ?? ''
  const timezone = user?.timezone ?? 'Asia/Shanghai'

  const [tab, setTab] = useState<AuditTab>('audit')
  const [rangeFrom, setRangeFrom] = useState<string | null>(null)
  const [rangeTo, setRangeTo] = useState<string | null>(null)
  const [auditTarget, setAuditTarget] = useState<Task | null>(null)
  const [action, setAction] = useState<SubmitAuditAction>('approve')
  const [opinion, setOpinion] = useState<AuditOpinion>('agree')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  /** 轻提示定时器（卸载时清理，避免卸载后 setState） */
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 提交中标记（ref 版本：防同一帧内重复点击穿透 state 异步更新） */
  const submittingRef = useRef(false)

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

  const audit = useAsync(() => auditService.listAuditTasks(userId, canReview), [userId, canReview], {
    cache: { key: 'audit:tasks' },
  })
  const tasks = useMemo(() => audit.data ?? [], [audit.data])
  const users = useMemo(() => buildUserMap(), [audit.data])

  /** 日期区间（起 / 止任一非空即生效） */
  const range: DateRange | null = useMemo(
    () => (rangeFrom || rangeTo ? { from: rangeFrom, to: rangeTo } : null),
    [rangeFrom, rangeTo],
  )

  /** 四栏筛选结果 */
  const lists = useMemo(
    () => ({
      report: filterPendingReport(tasks),
      audit: filterPendingAudit(tasks),
      approved: filterApproved(tasks, range),
      withdrawn: filterWithdrawnLogs(tasks, range),
    }),
    [tasks, range],
  )

  const counts = useMemo(
    () => ({
      report: lists.report.length,
      audit: lists.audit.length,
      approved: lists.approved.length,
      withdrawn: lists.withdrawn.length,
    }),
    [lists],
  )

  const tabOptions = useMemo(
    () => TAB_OPTIONS.map((option) => ({ ...option, badge: counts[option.value] })),
    [counts],
  )

  /** 某任务当前可执行的动作（无权限 / 非提报人时为空） */
  const actionsFor = useCallback(
    (task: Task): SubmitAuditAction[] => {
      const actions: SubmitAuditAction[] = []
      if (canReview) actions.push('approve', 'reject')
      if (isWithdrawable(task, userId)) actions.push('withdraw')
      return actions
    },
    [canReview, userId],
  )

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await audit.refetch()
    setRefreshing(false)
  }, [audit])

  /** 打开审核抽屉 */
  const openAudit = useCallback(
    (task: Task) => {
      const actions = actionsFor(task)
      if (actions.length === 0) return
      setAuditTarget(task)
      setAction(actions[0])
      setOpinion('agree')
      setReason('')
    },
    [actionsFor],
  )

  const closeAudit = useCallback(() => {
    setAuditTarget(null)
    setReason('')
  }, [])

  /**
   * 提交审核的唯一核心流程：前置校验 → 提交 → 轻提示 → 刷新。
   * 抽屉「提交审核」是唯一入口，三个卡片动作均先开抽屉再由此提交，确保校验与提示行为不漂移。
   */
  const runSubmit = useCallback(
    async ({ target, action: nextAction, opinion: nextOpinion, reasonText }: SubmitParams) => {
      if (submittingRef.current) return
      const trimmed = reasonText.trim()
      if ((nextAction === 'reject' || nextOpinion === 'other') && trimmed.length < REASON_MIN_LENGTH) {
        showToast(`原因不少于 ${REASON_MIN_LENGTH} 字`)
        return
      }
      if (nextAction === 'approve' && !canApproveMainTask(target, tasks)) {
        showToast('评审子任务尚未完成，暂不可通过')
        return
      }
      submittingRef.current = true
      setSubmitting(true)
      try {
        await auditService.submitAudit({
          taskId: target.id,
          action: nextAction,
          opinion: nextOpinion,
          reason: trimmed || undefined,
          version: target.version,
          actorId: userId,
        })
        setAuditTarget(null)
        setReason('')
        showToast(
          nextAction === 'approve' ? '已通过' : nextAction === 'reject' ? '已驳回' : '已撤回',
        )
      } catch (error) {
        showToast(getErrorMessage(error))
      } finally {
        submittingRef.current = false
        setSubmitting(false)
        await audit.refetch()
      }
    },
    [audit, showToast, tasks, userId],
  )

  /** 抽屉提交：透传当前动作 / 意见 / 原因 */
  const handleSubmit = useCallback(async () => {
    if (!auditTarget) return
    await runSubmit({ target: auditTarget, action, opinion, reasonText: reason })
  }, [action, auditTarget, opinion, reason, runSubmit])

  /** 打开审核抽屉并预置指定的审核动作与意见（三个卡片动作共用） */
  const openAuditWith = useCallback(
    (task: Task, nextAction: SubmitAuditAction, nextOpinion: AuditOpinion) => {
      const actions = actionsFor(task)
      if (!actions.includes(nextAction)) return
      setAuditTarget(task)
      setAction(nextAction)
      setOpinion(nextOpinion)
      setReason('')
    },
    [actionsFor],
  )

  const openTask = useCallback(
    (taskId: string) => {
      navigation.navigate('TaskDetail', { taskId, from: 'notification' })
    },
    [navigation],
  )

  const currentActions = auditTarget ? actionsFor(auditTarget) : []
  const actionOptions = ACTION_OPTIONS.filter((option) => currentActions.includes(option.value))
  const approveBlocked = auditTarget !== null && !canApproveMainTask(auditTarget, tasks)
  const submitDisabled =
    submitting ||
    (action === 'reject' && reason.trim().length < REASON_MIN_LENGTH) ||
    (opinion === 'other' && reason.trim().length < REASON_MIN_LENGTH) ||
    (action === 'approve' && approveBlocked)

  const showRange = tab === 'approved' || tab === 'withdrawn'
  const empty = EMPTY_TEXT[tab]

  return (
    <View style={styles.root}>
      <ScreenHeader title="审核中心" subtitle="提报审核 · 完成评审" onBack={() => goBackOrHome(navigation)} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxxl }]}
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
        {/* 四栏切换 */}
        <FadeIn style={styles.segmentedWrapper}>
          <SegmentedControl options={tabOptions} value={tab} onChange={setTab} />
        </FadeIn>

        {/* 日期区间（仅「审核通过」「撤回审核」栏） */}
        {showRange ? (
          <FadeIn delay={staggerDelay(1)} style={styles.rangeRow}>
            <View style={styles.rangeField}>
              <DateTimeField label="起始" value={rangeFrom} onChange={setRangeFrom} timezone={timezone} />
            </View>
            <View style={styles.rangeGap} />
            <View style={styles.rangeField}>
              <DateTimeField label="截止" value={rangeTo} onChange={setRangeTo} timezone={timezone} />
            </View>
          </FadeIn>
        ) : null}

        {/* 列表 */}
        <View style={styles.section}>
          {audit.isStale && audit.updatedAt !== null && !audit.error ? (
            <StaleBadge updatedAt={audit.updatedAt} />
          ) : null}
          {audit.loading ? (
            <LoadingView variant="skeleton" skeletonCount={3} />
          ) : audit.error ? (
            <ErrorState
              message={isNetworkError(audit.error) ? NETWORK_OFFLINE_MESSAGE : undefined}
              onRetry={() => void audit.retry()}
            />
          ) : tab === 'withdrawn' ? (
            lists.withdrawn.length === 0 ? (
              <Card>
                <EmptyState icon="check-circle" title={empty.title} description={empty.description} />
              </Card>
            ) : (
              lists.withdrawn.map((log, index) => (
                <FadeIn key={log.id} delay={staggerDelay(index)} style={styles.cardGap}>
                  <AuditLogItem log={log} timezone={timezone} onPress={() => openTask(log.task.id)} />
                </FadeIn>
              ))
            )
          ) : lists[tab].length === 0 ? (
            <Card>
              <EmptyState icon="check-circle" title={empty.title} description={empty.description} />
            </Card>
          ) : (
            lists[tab].map((task, index) => {
              const actions = tab === 'audit' ? actionsFor(task) : []
              // 待审核栏且有通过 / 驳回权限：渲染三行柔和动作按钮以替代理色「审核」按钮
              const showInlineAudit = actions.includes('approve') && actions.includes('reject')
              return (
                <FadeIn key={task.id} delay={staggerDelay(index)} style={styles.cardGap}>
                  <TaskCard
                    task={task}
                    assignee={users.get(task.assigneeId ?? '') ?? null}
                    timezone={timezone}
                    onPress={() => openTask(task.id)}
                  />
                  {/* 动作按钮渲染为卡片之后的兄弟节点（不在卡片 Pressable 内），消除 `<button>` 嵌套 */}
                  {showInlineAudit ? (
                    <View style={styles.auditActionsBelow}>
                      <PressableScale
                        style={[styles.auditActionRow, styles.auditApproveBtn]}
                        onPress={() => openAuditWith(task, 'approve', 'agree')}
                        pressedBg={colors.bg.subtle}
                        accessibilityRole="button"
                        accessibilityLabel={APPROVE_A11Y}
                      >
                        <Text style={[typography.label, styles.auditApproveText]} numberOfLines={1}>
                          {APPROVE_LABEL}
                        </Text>
                      </PressableScale>
                      <PressableScale
                        style={[styles.auditActionRow, styles.auditActionGap, styles.auditRejectBtn]}
                        onPress={() => openAuditWith(task, 'reject', 'reject')}
                        pressedBg={colors.bg.subtle}
                        accessibilityRole="button"
                        accessibilityLabel={REJECT_A11Y}
                      >
                        <Text style={[typography.label, styles.auditRejectText]} numberOfLines={1}>
                          {REJECT_LABEL}
                        </Text>
                      </PressableScale>
                      <PressableScale
                        style={[styles.auditActionRow, styles.auditActionGap, styles.auditReworkBtn]}
                        onPress={() => openAuditWith(task, 'reject', 'rework')}
                        pressedBg={colors.bg.subtle}
                        accessibilityRole="button"
                        accessibilityLabel={REWORK_A11Y}
                      >
                        <Text style={[typography.label, styles.auditReworkText]} numberOfLines={1}>
                          {REWORK_LABEL}
                        </Text>
                      </PressableScale>
                    </View>
                  ) : actions.length > 0 ? (
                    <View style={styles.auditActionsBelow}>
                      <Button label="审核" variant="ghost" size="md" onPress={() => openAudit(task)} />
                    </View>
                  ) : null}
                </FadeIn>
              )
            })
          )}
        </View>
      </ScrollView>

      {/* 轻提示 */}
      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + spacing.xxl }]} pointerEvents="none">
          <Text style={[typography.caption, styles.toastText]}>{toast}</Text>
        </View>
      ) : null}

      {/* 审核抽屉 */}
      <BottomSheet
        visible={auditTarget !== null}
        onClose={closeAudit}
        title="审核"
        heightRatio={AUDIT_SHEET_RATIO}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={[typography.body, styles.sheetTitle]} numberOfLines={2}>
            {auditTarget?.title ?? ''}
          </Text>

          {actionOptions.length > 0 ? (
            <>
              <Text style={[typography.label, styles.fieldLabel]}>审核动作</Text>
              <SegmentedControl
                options={actionOptions}
                value={action}
                onChange={(next) => setAction(next)}
              />
            </>
          ) : null}

          <Text style={[typography.label, styles.fieldLabel]}>审核意见</Text>
          <SegmentedControl options={OPINION_OPTIONS} value={opinion} onChange={setOpinion} />

          <View style={styles.reasonField}>
            <TextField
              label={opinion === 'other' || action === 'reject' ? '原因（必填）' : '备注（选填）'}
              value={reason}
              onChangeText={setReason}
              multiline
              maxLength={200}
            />
          </View>

          {action === 'approve' && approveBlocked ? (
            <Text style={[typography.caption, styles.blockedHint]}>
              评审子任务尚未完成，暂不可通过
            </Text>
          ) : null}

          <View style={styles.sheetActions}>
            <View style={styles.sheetButton}>
              <Button label="取消" variant="secondary" fullWidth onPress={closeAudit} />
            </View>
            <View style={styles.sheetButton}>
              <Button
                label="提交审核"
                fullWidth
                loading={submitting}
                disabled={submitDisabled}
                onPress={() => void handleSubmit()}
              />
            </View>
          </View>
        </ScrollView>
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
  segmentedWrapper: {
    marginTop: spacing.md,
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  rangeField: {
    flex: 1,
  },
  rangeGap: {
    width: spacing.sm,
  },
  section: {
    marginTop: layout.sectionGap,
  },
  cardGap: {
    marginBottom: layout.cardGap,
  },
  /** 卡片下方内联动作行（默认可见，右对齐；对齐 TodayFocus 已验证数值） */
  auditActionsBelow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: spacing.xs,
  },
  /** 单行动作按钮底（浅底 + 描边，变体样式提供配色） */
  auditActionRow: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radius.control,
    borderWidth: 1,
  },
  /** 第二、三枚与前一行的横向间距 */
  auditActionGap: {
    marginLeft: spacing.xs,
  },
  /** 「通过」按钮：浅绿底 + 绿描边 */
  auditApproveBtn: {
    backgroundColor: colors.successFaint,
    borderColor: colors.success,
  },
  /** 「不通过」按钮：浅红底 + 红描边 */
  auditRejectBtn: {
    backgroundColor: colors.dangerFaint,
    borderColor: colors.danger,
  },
  /** 「退回重改」按钮：浅琥珀底 + 琥珀描边 */
  auditReworkBtn: {
    backgroundColor: colors.warningFaint,
    borderColor: colors.warning,
  },
  /** 「通过」文案：绿字 */
  auditApproveText: {
    color: colors.success,
  },
  /** 「不通过」文案：红字 */
  auditRejectText: {
    color: colors.danger,
  },
  /** 「退回重改」文案：琥珀字 */
  auditReworkText: {
    color: colors.warning,
  },
  sheetTitle: {
    color: colors.text.primary,
  },
  fieldLabel: {
    color: colors.text.secondary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  reasonField: {
    marginTop: spacing.md,
  },
  blockedHint: {
    color: colors.warning,
    marginTop: spacing.xs,
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
