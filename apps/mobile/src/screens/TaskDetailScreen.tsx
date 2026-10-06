/**
 * 职责：⑤ 任务详情 —— 状态机操作 / 计时器 / 评论 / 附件 / 依赖抽屉（ARCH §6.5 / PRD 6.5）。
 * 状态按钮严格按 TASK_TRANSITIONS 启用；写操作带 version，409 冲突提示并 refetch。
 */
import { Feather } from '@expo/vector-icons'
import { useNavigation, useRoute } from '@react-navigation/native'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Animated,
  Linking,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  AttachmentUploadSheet,
  Avatar,
  BottomSheet,
  Button,
  Card,
  CommentItem,
  EmptyState,
  ErrorState,
  FadeIn,
  LoadingView,
  PressableScale,
  ScreenHeader,
  StaleBadge,
  Tag,
  TextField,
  staggerDelay,
} from '@/components'
import { useAsync, useAuth, useTimer } from '@/hooks'
import { taskService } from '@/services'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import {
  getPriorityColorFor,
  layout,
  motion,
  radius,
  shadow,
  spacing,
  typography,
  type ThemeColors,
} from '@/theme'
import type { AppNavigationProp, AppRouteProp, Attachment, TransitionActionConfig } from '@/types'
import { DEPENDENCY_TYPE_LABEL, TASK_TRANSITION_ACTIONS, getErrorMessage } from '@/types'
import { NETWORK_OFFLINE_MESSAGE, isNetworkError } from '@/types'
import { formatDate, formatDateTime, formatTime } from '@/utils/date'
import { EMPTY_PLACEHOLDER, formatBytes, formatHours, formatTimer } from '@/utils/format'
import { mockAttachmentUrl } from '@/utils/attachment'
import { goBackOrHome } from '@/utils/navigation'
import { useCan } from '@/utils/permission'
import { isWithdrawable } from '@/utils/submission'

/** 底部操作条高度 */
const BOTTOM_BAR_HEIGHT = 72
/** 滚动方向判定阈值（px） */
const SCROLL_HIDE_DELTA = 4

/** 任务详情 */
export function TaskDetailScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<AppNavigationProp>()
  const route = useRoute<AppRouteProp<'TaskDetail'>>()
  const { taskId } = route.params
  const { user } = useAuth()
  const { colors, statusColor, priorityColor } = useTheme()
  const styles = useThemedStyles(makeStyles)
  const timezone = user?.timezone ?? 'Asia/Shanghai'
  const userId = user?.id ?? ''
  // 统一权限姿势（ARCH §7）：是否具备「撤回提报」权限（复用既有 submission:withdraw key，不新增）
  const can = useCan()

  const detail = useAsync(() => taskService.getTaskDetail(taskId), [taskId], {
    cache: { key: `tasks:detail:${taskId}` },
  })
  const timer = useTimer(taskId, userId)

  const [actionSheet, setActionSheet] = useState<TransitionActionConfig | null>(null)
  const [reason, setReason] = useState('')
  const [actualHours, setActualHours] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [commentText, setCommentText] = useState('')
  const [sending, setSending] = useState(false)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const [depsVisible, setDepsVisible] = useState(false)
  // 上传抽屉的「上传中 / 进度 / 错误」状态由 `AttachmentUploadSheet` 自持，本屏只管开合
  const [uploadVisible, setUploadVisible] = useState(false)
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null)
  const [previewHint, setPreviewHint] = useState<string | null>(null)
  // 「撤回提报」二次确认抽屉 + 轻提示（M5-P0-03）
  const [withdrawSheetVisible, setWithdrawSheetVisible] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  /** 轻提示定时器（卸载时清理，避免卸载后 setState） */
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [])

  /** 展示中文轻提示（2.2s 自动消失，与今日聚焦 / 我的提报同姿势） */
  const showToast = useCallback((text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(text)
    toastTimer.current = setTimeout(() => setToast(null), 2200)
  }, [])

  // 底部操作条随滚动方向收起 / 展开
  const barTranslate = useRef(new Animated.Value(0)).current
  const lastOffset = useRef(0)

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = event.nativeEvent.contentOffset.y
      const delta = offset - lastOffset.current
      if (Math.abs(delta) < SCROLL_HIDE_DELTA) return
      const shouldHide = delta > 0 && offset > BOTTOM_BAR_HEIGHT
      Animated.timing(barTranslate, {
        toValue: shouldHide ? BOTTOM_BAR_HEIGHT + insets.bottom : 0,
        duration: motion.duration.base,
        easing: motion.easing.standard,
        useNativeDriver: true,
      }).start()
      lastOffset.current = offset
    },
    [barTranslate, insets.bottom],
  )

  const task = detail.data?.task ?? null
  const availableActions: TransitionActionConfig[] = task ? TASK_TRANSITION_ACTIONS[task.status] ?? [] : []

  /** 执行状态迁移 */
  const runTransition = useCallback(
    async (action: TransitionActionConfig) => {
      const current = detail.data?.task
      if (!current) return
      setSubmitting(true)
      setActionError(null)
      try {
        if (action.to === 'done') {
          const hours = actualHours.trim() ? Number(actualHours) : current.actualHours ?? current.estimatedHours ?? 1
          await taskService.completeTask(current.id, { actualHours: hours, version: current.version })
        } else if (current.status === 'done') {
          if (action.to === 'in_progress') {
            // M5-P1-04：done → in_progress 走 moveTask（标签与行为一致；moveTask 亦清理审核态、completedAt 置空）
            await taskService.moveTask(current.id, {
              status: 'in_progress',
              version: current.version,
              reason: reason.trim() || undefined,
            })
          } else {
            // done → todo：保持既有行为**逐字节不变**（reopenTask 目标恒为 todo）
            await taskService.reopenTask(current.id, {
              reason: reason.trim() || '重开任务',
              version: current.version,
            })
          }
        } else {
          await taskService.moveTask(current.id, {
            status: action.to,
            version: current.version,
            reason: reason.trim() || undefined,
          })
        }
        setActionSheet(null)
        setReason('')
        setActualHours('')
      } catch (error) {
        setActionError(getErrorMessage(error))
      } finally {
        setSubmitting(false)
        await detail.refetch()
      }
    },
    [actualHours, detail, reason],
  )

  /** 承接任务 */
  const handleClaim = useCallback(async () => {
    const current = detail.data?.task
    if (!current) return
    setSubmitting(true)
    setActionError(null)
    try {
      await taskService.claimTask(current.id, current.version, userId)
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setSubmitting(false)
      await detail.refetch()
    }
  }, [detail, userId])

  /** 发送评论 */
  const handleSendComment = useCallback(async () => {
    const content = commentText.trim()
    if (!content) return
    setSending(true)
    try {
      await taskService.addComment(taskId, { content }, userId)
      setCommentText('')
      await detail.refetch()
    } finally {
      setSending(false)
    }
  }, [commentText, detail, taskId, userId])

  /** 打开附件上传抽屉（抽屉内部自持上传状态，见 `AttachmentUploadSheet`） */
  const handleOpenUpload = useCallback(() => {
    setUploadVisible(true)
  }, [])

  /** 上传成功：关闭抽屉并刷新详情 */
  const handleUploaded = useCallback(async () => {
    setUploadVisible(false)
    await detail.refetch()
  }, [detail])

  /** 打开附件预览 */
  const handleOpenAttachment = useCallback((attachment: Attachment) => {
    setPreviewHint(null)
    setPreviewAttachment(attachment)
  }, [])

  /** 用系统应用打开附件（Web 打开 mock URL，native 为演示占位） */
  const handleOpenWithSystem = useCallback(async (attachment: Attachment) => {
    const url = mockAttachmentUrl(attachment.objectKey)
    try {
      if (Platform.OS === 'web') {
        await Linking.openURL(url)
      } else {
        setPreviewHint('演示环境：已请求系统应用打开（mock）')
      }
    } catch {
      setPreviewHint('打开失败，请稍后重试')
    }
  }, [])

  /** 打开需要补充信息的操作抽屉 */
  const handleActionPress = useCallback(
    (action: TransitionActionConfig) => {
      setActionError(null)
      if (action.requireReason || action.requireActualHours) {
        setReason('')
        setActualHours(task?.actualHours !== null && task?.actualHours !== undefined ? String(task.actualHours) : '')
        setActionSheet(action)
        return
      }
      void runTransition(action)
    },
    [runTransition, task],
  )

  /** 打开「撤回提报」二次确认抽屉（M5-P0-03） */
  const handleOpenWithdraw = useCallback(() => {
    setActionError(null)
    setWithdrawSheetVisible(true)
  }, [])

  /** 确认撤回「完成提报」：成功后轻提示并刷新；失败中文提示并刷新（M5-P0-03 / M5-P1-03） */
  const handleWithdrawConfirm = useCallback(async () => {
    const current = detail.data?.task
    if (!current) return
    setWithdrawing(true)
    try {
      await taskService.withdrawCompletionAndNotify(current.id, {
        version: current.version,
        actorId: userId,
      })
      setWithdrawSheetVisible(false)
      showToast('已撤回提报')
    } catch (error) {
      showToast(getErrorMessage(error))
    } finally {
      setWithdrawing(false)
      await detail.refetch()
    }
  }, [detail, showToast, userId])

  if (detail.loading && !detail.data) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="任务详情" onBack={() => goBackOrHome(navigation)} />
        <LoadingView variant="skeleton" skeletonCount={4} />
      </View>
    )
  }

  if (detail.error && !detail.data) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="任务详情" onBack={() => goBackOrHome(navigation)} />
        <ErrorState
          message={isNetworkError(detail.error) ? NETWORK_OFFLINE_MESSAGE : undefined}
          onRetry={() => void detail.retry()}
        />
      </View>
    )
  }

  if (!task) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="任务详情" onBack={() => goBackOrHome(navigation)} />
        <EmptyState icon="alert-circle" title="任务不存在" description="可能已被删除或你没有查看权限" />
      </View>
    )
  }

  const status = statusColor[task.status]
  const assignee = detail.data?.assignee ?? null
  const project = detail.data?.project ?? null
  const comments = detail.data?.comments ?? []
  const attachments = detail.data?.attachments ?? []
  const dependencies = detail.data?.dependencies ?? []
  const canClaim =
    task.assigneeId === null &&
    task.status !== 'cancelled' &&
    task.status !== 'done' &&
    // 增量 7：`pending_review` 必有 assignee ⇒ 实际恒 false；此处防御性排除（§2.5-11）
    task.status !== 'pending_review'
  const primaryAction = availableActions[0] ?? null
  // 「撤回提报」入口可见性（M5-P0-03 / K20）：仅「待审 + 有权限 + 本人提报」时渲染（**隐藏而非置灰**）
  // 主体判定与 service 端 `withdrawCompletion` 同源（`isWithdrawable`），避免「按钮可见但服务拒绝」的错配
  const canWithdraw = can('submission:withdraw')
  const withdrawable = task.submissionStatus === 'pending' && canWithdraw && isWithdrawable(task, userId)

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="任务详情"
        subtitle={project ? project.name : '无归属项目'}
        onBack={() => goBackOrHome(navigation)}
        right={
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="查看依赖"
            onPress={() => setDepsVisible(true)}
            scale={0.92}
            pressedBg={colors.bg.subtle}
            style={styles.headerAction}
          >
            <Feather name="git-branch" size={layout.icon.md} color={colors.text.primary} />
          </PressableScale>
        }
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: BOTTOM_BAR_HEIGHT + insets.bottom + spacing.xxxl },
        ]}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {detail.isStale && detail.updatedAt !== null ? (
          <StaleBadge updatedAt={detail.updatedAt} />
        ) : null}
        {/* 头部：标题 + 状态 + 优先级色条 */}
        <FadeIn>
          <Card padded={false}>
            <View style={styles.headRow}>
              <View style={[styles.priorityBar, { backgroundColor: getPriorityColorFor(task.priority, priorityColor) }]} />
              <View style={styles.headBody}>
                <Text style={[typography.display, styles.taskTitle]}>{task.title}</Text>
                <View style={styles.tagRow}>
                  <Tag tone="status" status={task.status} text={status.label} />
                  <View style={styles.tagSpacer} />
                  <Tag tone="priority" priority={task.priority} text="" />
                  {task.isAiGenerated ? (
                    <>
                      <View style={styles.tagSpacer} />
                      <Tag text="AI 生成" tone="neutral" />
                    </>
                  ) : null}
                  {task.submissionStatus === 'pending' ? (
                    <>
                      <View style={styles.tagSpacer} />
                      <Tag text="待审核" tone="neutral" />
                    </>
                  ) : null}
                </View>
              </View>
            </View>
          </Card>
        </FadeIn>

        {/* 元信息 */}
        <FadeIn delay={staggerDelay(1)} style={styles.section}>
          <Card>
            <MetaRow
              icon="user"
              label="负责人"
              content={assignee ? assignee.displayName : '待领取'}
              leading={
                assignee ? <Avatar name={assignee.displayName} uri={assignee.avatarUrl} size={32} /> : undefined
              }
            />
            <MetaRow
              icon="calendar"
              label="起止时间"
              content={`${task.startAt ? formatDate(task.startAt, timezone) : EMPTY_PLACEHOLDER} → ${
                task.dueAt ? formatDate(task.dueAt, timezone) : EMPTY_PLACEHOLDER
              }`}
            />
            <MetaRow
              icon="clock"
              label="截止时刻"
              content={task.dueAt ? `${formatDate(task.dueAt, timezone)} ${formatTime(task.dueAt, timezone)}` : EMPTY_PLACEHOLDER}
            />
            <MetaRow
              icon="target"
              label="工时（预估 / 实际）"
              content={`${formatHours(task.estimatedHours)} / ${formatHours(task.actualHours)}`}
              mono
            />
            {task.tags.length > 0 ? (
              <MetaRow
                icon="tag"
                label="标签"
                content={task.tags.join(' · ')}
              />
            ) : null}
          </Card>
        </FadeIn>

        {/* 状态操作区 */}
        <FadeIn delay={staggerDelay(2)} style={styles.section}>
          <Text style={[typography.title, styles.sectionTitle]}>状态与执行</Text>
          <Card>
            {actionError ? (
              <View style={styles.actionError}>
                <Feather name="alert-circle" size={layout.icon.sm} color={colors.danger} />
                <Text style={[typography.caption, styles.actionErrorText]}>{actionError}</Text>
              </View>
            ) : null}

            {canClaim ? (
              <Button
                label="承接任务"
                icon="check"
                fullWidth
                loading={submitting}
                onPress={() => void handleClaim()}
              />
            ) : availableActions.length === 0 ? (
              <Text style={[typography.caption, styles.noAction]}>
                当前状态（{status.label}）无可执行操作
              </Text>
            ) : (
              <View style={styles.actionGrid}>
                {availableActions.map((action) => {
                  const isPrimary = primaryAction?.to === action.to
                  return (
                    <View key={`${action.to}-${action.label}`} style={styles.actionButton}>
                      <Button
                        label={action.label}
                        variant={isPrimary ? 'primary' : 'secondary'}
                        fullWidth
                        disabled={submitting}
                        onPress={() => handleActionPress(action)}
                      />
                    </View>
                  )
                })}
              </View>
            )}

            {/* 「撤回提报」入口（M5-P0-03）：独立于 TASK_TRANSITION_ACTIONS（K21，不混淆任务状态机与提报状态机）
                隐藏而非置灰（permission.ts:8 约定）；仅「待审 + 有权限 + 本人提报」时渲染 */}
            {withdrawable ? (
              <View style={styles.withdrawRow}>
                <Button
                  label="撤回提报"
                  variant="danger"
                  fullWidth
                  disabled={submitting || withdrawing}
                  onPress={handleOpenWithdraw}
                />
              </View>
            ) : null}

            {/* 计时器 */}
            <View style={styles.timerRow}>
              <View style={styles.timerLeft}>
                <Text style={[typography.label, styles.timerLabel]}>工时计时</Text>
                <Text style={[typography.mono, styles.timerValue]}>{formatTimer(timer.seconds)}</Text>
              </View>
              <View style={styles.timerActions}>
                {timer.running ? (
                  <>
                    <Button label="暂停" variant="secondary" icon="pause" onPress={() => void timer.pause()} />
                    <View style={styles.timerGap} />
                    <Button label="结束" icon="square" onPress={() => void timer.stop()} />
                  </>
                ) : (
                  <Button label="开始计时" icon="play" loading={timer.busy} onPress={() => void timer.start()} />
                )}
              </View>
            </View>
          </Card>
        </FadeIn>

        {/* 描述 */}
        <FadeIn delay={staggerDelay(3)} style={styles.section}>
          <Text style={[typography.title, styles.sectionTitle]}>任务描述</Text>
          <Card>
            {task.description ? (
              <>
                <Text
                  style={[typography.body, styles.description]}
                  numberOfLines={descriptionExpanded ? undefined : 3}
                >
                  {task.description}
                </Text>
                <PressableScale
                  accessibilityRole="button"
                  onPress={() => setDescriptionExpanded((previous) => !previous)}
                  scale={1}
                  pressedBg={colors.bg.subtle}
                  style={styles.expandRow}
                >
                  <Text style={[typography.caption, styles.expandText]}>
                    {descriptionExpanded ? '收起' : '展开全文'}
                  </Text>
                  <Feather
                    name={descriptionExpanded ? 'chevron-up' : 'chevron-down'}
                    size={layout.icon.sm}
                    color={colors.text.secondary}
                  />
                </PressableScale>
              </>
            ) : (
              <Text style={[typography.caption, styles.placeholder]}>暂无描述</Text>
            )}
          </Card>
        </FadeIn>

        {/* 评论区 */}
        <FadeIn delay={staggerDelay(4)} style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[typography.title, styles.sectionTitle]}>评论</Text>
            <Text style={[typography.caption, styles.sectionMeta]}>{comments.length} 条</Text>
          </View>
          <Card padded={false} style={styles.commentCard}>
            {comments.length === 0 ? (
              <Text style={[typography.caption, styles.placeholder]}>还没有评论，说点什么吧</Text>
            ) : (
              comments.map((comment, index) => (
                <View
                  key={comment.id}
                  style={[
                    styles.commentWrapper,
                    index < comments.length - 1 ? styles.commentDivider : null,
                  ]}
                >
                  <CommentItem
                    comment={comment}
                    author={comment.authorId === userId ? user : null}
                    isMine={comment.authorId === userId}
                    timezone={timezone}
                  />
                </View>
              ))
            )}
          </Card>
          <View style={styles.commentInputRow}>
            <View style={styles.commentInput}>
              <TextField
                label="写评论（支持 @提及）"
                value={commentText}
                onChangeText={setCommentText}
                multiline
                maxLength={500}
                editable={!sending}
              />
            </View>
            <View style={styles.commentSend}>
              <Button
                label="发送"
                icon="send"
                loading={sending}
                disabled={commentText.trim().length === 0}
                onPress={() => void handleSendComment()}
              />
            </View>
          </View>
        </FadeIn>

        {/* 附件 */}
        <FadeIn delay={staggerDelay(5)} style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[typography.title, styles.sectionTitle]}>附件</Text>
            <View style={styles.sectionHeaderRight}>
              <Text style={[typography.caption, styles.sectionMeta]}>{attachments.length} 个</Text>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="添加附件"
                onPress={handleOpenUpload}
                hitSlop={spacing.xs}
                scale={0.92}
                pressedBg={colors.bg.subtle}
                style={styles.addAttachment}
              >
                <Feather name="plus" size={layout.icon.sm} color={colors.primary} />
                <Text style={[typography.label, styles.addAttachmentText]}>添加附件</Text>
              </PressableScale>
            </View>
          </View>
          <Card padded={false} style={styles.attachmentCard}>
            {attachments.length === 0 ? (
              <Text style={[typography.caption, styles.placeholder]}>暂无附件</Text>
            ) : (
              attachments.map((attachment, index) => (
                <PressableScale
                  key={attachment.id}
                  accessibilityRole="button"
                  accessibilityLabel={`预览附件 ${attachment.fileName}`}
                  onPress={() => handleOpenAttachment(attachment)}
                  scale={1}
                  pressedBg={colors.bg.subtle}
                  style={[
                    styles.attachmentRow,
                    index < attachments.length - 1 ? styles.attachmentDivider : null,
                    index === 0 ? styles.attachmentRowFirst : null,
                    index === attachments.length - 1 ? styles.attachmentRowLast : null,
                  ]}
                >
                  <Feather name="paperclip" size={layout.icon.md} color={colors.text.secondary} />
                  <View style={styles.attachmentBody}>
                    <Text style={[typography.body, styles.attachmentName]} numberOfLines={1}>
                      {attachment.fileName}
                    </Text>
                    <Text style={[typography.caption, styles.attachmentMeta]}>
                      {formatBytes(attachment.sizeBytes)} · 点击预览
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={layout.icon.md} color={colors.text.tertiary} />
                </PressableScale>
              ))
            )}
          </Card>
        </FadeIn>
      </ScrollView>

      {/* 底部固定操作条 */}
      <Animated.View
        style={[
          styles.bottomBar,
          {
            paddingBottom: insets.bottom + spacing.sm,
            transform: [{ translateY: barTranslate }],
          },
        ]}
      >
        <View style={styles.bottomBarInfo}>
          <Text style={[typography.label, styles.bottomBarLabel]}>当前状态</Text>
          <Text style={[typography.body, styles.bottomBarValue]} numberOfLines={1}>
            {status.label}
          </Text>
        </View>
        {canClaim ? (
          <Button label="承接任务" loading={submitting} onPress={() => void handleClaim()} />
        ) : primaryAction ? (
          <Button label={primaryAction.label} disabled={submitting} onPress={() => handleActionPress(primaryAction)} />
        ) : (
          <Button label="无可执行操作" disabled onPress={() => undefined} />
        )}
      </Animated.View>

      {/* 补充信息抽屉（原因 / 实际工时） */}
      <BottomSheet
        visible={actionSheet !== null}
        onClose={() => setActionSheet(null)}
        title={actionSheet?.label ?? ''}
        heightRatio={0.44}
      >
        <Text style={[typography.caption, styles.sheetHint]}>
          {actionSheet?.requireActualHours
            ? '完成任务需填写实际工时（小时）'
            : '阻塞 / 取消 / 重开需填写原因（不少于 4 个字符）'}
        </Text>
        <View style={styles.sheetField}>
          {actionSheet?.requireActualHours ? (
            <TextField
              label="实际工时（小时）"
              value={actualHours}
              onChangeText={setActualHours}
              keyboardType="decimal-pad"
            />
          ) : (
            <TextField label="原因" value={reason} onChangeText={setReason} multiline maxLength={200} />
          )}
        </View>
        <Button
          label="确认"
          fullWidth
          loading={submitting}
          disabled={
            actionSheet?.requireReason
              ? reason.trim().length < 4
              : actualHours.trim().length === 0
          }
          onPress={() => {
            if (actionSheet) void runTransition(actionSheet)
          }}
        />
      </BottomSheet>

      {/* 依赖抽屉（只读） */}
      <BottomSheet
        visible={depsVisible}
        onClose={() => setDepsVisible(false)}
        title="任务依赖（只读）"
        heightRatio={0.55}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          {dependencies.length === 0 ? (
            <Text style={[typography.caption, styles.placeholder]}>该任务暂无依赖关系</Text>
          ) : (
            dependencies.map((dependency) => {
              const isPrev = dependency.nextTaskId === task.id
              const counterpart = isPrev ? dependency.prevTask : dependency.nextTask
              return (
                <Card key={dependency.id} style={styles.dependencyCard}>
                  <View style={styles.dependencyRow}>
                    <Feather
                      name={isPrev ? 'log-in' : 'log-out'}
                      size={layout.icon.md}
                      color={colors.primarySoft}
                    />
                    <View style={styles.dependencyBody}>
                      <Text style={[typography.body, styles.dependencyTitle]} numberOfLines={1}>
                        {counterpart?.title ?? '未知任务'}
                      </Text>
                      <Text style={[typography.caption, styles.dependencyMeta]}>
                        {isPrev ? '前置任务' : '后置任务'} · {DEPENDENCY_TYPE_LABEL[dependency.type]}
                        {dependency.lagDays > 0 ? ` · 滞后 ${dependency.lagDays} 天` : ''}
                        {dependency.isShared ? ' · 共享' : ''}
                      </Text>
                    </View>
                    <Tag text={counterpart?.status ?? '—'} tone="neutral" />
                  </View>
                </Card>
              )
            })
          )}
        </ScrollView>
      </BottomSheet>

      {/* 添加附件抽屉（拍照 / 相册 / 选择文件 / 演示文件四入口，增量 11） */}
      <AttachmentUploadSheet
        visible={uploadVisible}
        taskId={taskId}
        tenantId={task.tenantId}
        onClose={() => setUploadVisible(false)}
        onUploaded={() => void handleUploaded()}
      />

      {/* 附件预览抽屉（元信息 + 系统应用打开占位） */}
      <BottomSheet
        visible={previewAttachment !== null}
        onClose={() => {
          setPreviewAttachment(null)
          setPreviewHint(null)
        }}
        title="附件预览"
        heightRatio={0.42}
      >
        {previewAttachment ? (
          <>
            <View style={styles.previewIconRow}>
              <Feather name="file-text" size={layout.icon.lg} color={colors.primary} />
              <Text style={[typography.title, styles.previewName]} numberOfLines={2}>
                {previewAttachment.fileName}
              </Text>
            </View>
            <View style={styles.previewMeta}>
              <Text style={[typography.caption, styles.previewMetaText]}>
                类型：{previewAttachment.mimeType}
              </Text>
              <Text style={[typography.caption, styles.previewMetaText]}>
                大小：{formatBytes(previewAttachment.sizeBytes)}
              </Text>
              <Text style={[typography.caption, styles.previewMetaText]}>
                上传于：{formatDateTime(previewAttachment.createdAt, timezone)}
              </Text>
            </View>
            {previewHint ? (
              <Text style={[typography.caption, styles.previewHint]}>{previewHint}</Text>
            ) : null}
            <View style={styles.previewAction}>
              <Button
                label="用系统应用打开"
                icon="external-link"
                fullWidth
                onPress={() => void handleOpenWithSystem(previewAttachment)}
              />
            </View>
          </>
        ) : null}
      </BottomSheet>

      {/* 轻提示（撤回成功 / 失败） */}
      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + spacing.xxl }]} pointerEvents="none">
          <Text style={[typography.caption, styles.toastText]}>{toast}</Text>
        </View>
      ) : null}

      {/* 撤回提报二次确认（照 MySubmissionsScreen 姿势：BottomSheet + 取消 / 确定双按钮） */}
      <BottomSheet
        visible={withdrawSheetVisible}
        onClose={() => {
          if (withdrawing) return
          setWithdrawSheetVisible(false)
        }}
        title="撤回提报"
        heightRatio={0.42}
      >
        <Text style={[typography.caption, styles.sheetText]}>
          撤回后该完成提报将退出审核列表，任务回到「进行中」继续推进，确定撤回吗？
        </Text>
        <View style={styles.sheetActions}>
          <View style={styles.sheetButton}>
            <Button
              label="取消"
              variant="secondary"
              fullWidth
              onPress={() => setWithdrawSheetVisible(false)}
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

/** 元信息行 */
function MetaRow({
  icon,
  label,
  content,
  leading,
  mono = false,
}: {
  icon: keyof typeof Feather.glyphMap
  label: string
  content: string
  leading?: React.ReactNode
  mono?: boolean
}): React.JSX.Element {
  const { colors } = useTheme()
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.metaRow}>
      <Feather name={icon} size={layout.icon.sm} color={colors.text.tertiary} />
      <Text style={[typography.caption, styles.metaLabel]}>{label}</Text>
      <View style={styles.metaValue}>
        {leading ? <View style={styles.metaLeading}>{leading}</View> : null}
        <Text style={[mono ? typography.mono : typography.body, styles.metaContent]} numberOfLines={2}>
          {content}
        </Text>
      </View>
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
  headerAction: {
    width: layout.icon.lg + spacing.sm,
    height: layout.icon.lg + spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  priorityBar: {
    width: layout.priorityBarWidth,
    borderTopLeftRadius: radius.card,
    borderBottomLeftRadius: radius.card,
  },
  headBody: {
    flex: 1,
    padding: layout.cardPadding,
  },
  taskTitle: {
    color: colors.text.primary,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    flexWrap: 'wrap',
  },
  tagSpacer: {
    width: spacing.xs,
  },
  section: {
    marginTop: layout.sectionGap,
  },
  sectionTitle: {
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionMeta: {
    color: colors.text.secondary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  metaLabel: {
    color: colors.text.secondary,
    marginLeft: spacing.xs,
    width: spacing.xxxl + spacing.xxl,
  },
  metaValue: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  metaLeading: {
    marginRight: spacing.xs,
  },
  metaContent: {
    color: colors.text.primary,
    textAlign: 'right',
    flexShrink: 1,
  },
  actionError: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  actionErrorText: {
    color: colors.danger,
    marginLeft: spacing.xxs,
    flex: 1,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  actionButton: {
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
    minWidth: spacing.xxxl * 3,
  },
  noAction: {
    color: colors.text.tertiary,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  timerLeft: {
    flex: 1,
  },
  timerLabel: {
    color: colors.text.secondary,
  },
  timerValue: {
    color: colors.primary,
    marginTop: spacing.xxs,
  },
  timerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timerGap: {
    width: spacing.xs,
  },
  description: {
    color: colors.text.primary,
  },
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    borderRadius: radius.sm,
  },
  expandText: {
    color: colors.text.secondary,
    marginRight: spacing.xxs,
  },
  placeholder: {
    color: colors.text.tertiary,
    paddingVertical: spacing.xs,
    paddingHorizontal: layout.cardPadding,
  },
  commentCard: {
    paddingVertical: spacing.xxs,
  },
  commentWrapper: {
    paddingHorizontal: layout.cardPadding,
  },
  commentDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: spacing.sm,
  },
  commentInput: {
    flex: 1,
    marginRight: spacing.sm,
  },
  commentSend: {
    marginBottom: spacing.xxs,
  },
  attachmentCard: {
    paddingVertical: spacing.xxs,
  },
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.cardPadding,
    paddingVertical: spacing.sm,
  },
  attachmentDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  // 首 / 末行补齐对应角圆角（值 = 容器圆角 token radius.card），
  // 使按下底色与 attachmentCard 圆角吻合，避免方角戳出卡片轮廓
  attachmentRowFirst: {
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
  },
  attachmentRowLast: {
    borderBottomLeftRadius: radius.card,
    borderBottomRightRadius: radius.card,
  },
  attachmentBody: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  attachmentName: {
    color: colors.text.primary,
  },
  attachmentMeta: {
    color: colors.text.tertiary,
    marginTop: spacing.xxs,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    backgroundColor: colors.bg.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bottomBarInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  bottomBarLabel: {
    color: colors.text.secondary,
  },
  bottomBarValue: {
    color: colors.text.primary,
  },
  sheetHint: {
    color: colors.text.secondary,
  },
  sheetField: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  dependencyCard: {
    marginBottom: layout.cardGap,
  },
  dependencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dependencyBody: {
    flex: 1,
    marginLeft: spacing.sm,
    marginRight: spacing.sm,
  },
  dependencyTitle: {
    color: colors.text.primary,
  },
  dependencyMeta: {
    color: colors.text.tertiary,
    marginTop: spacing.xxs,
  },
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryFaint,
  },
  addAttachmentText: {
    color: colors.primary,
    marginLeft: spacing.xxs,
  },
  previewIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  previewName: {
    flex: 1,
    color: colors.text.primary,
    marginLeft: spacing.sm,
  },
  previewMeta: {
    marginTop: spacing.md,
  },
  previewMetaText: {
    color: colors.text.secondary,
    marginBottom: spacing.xxs,
  },
  previewHint: {
    color: colors.warning,
    marginTop: spacing.sm,
  },
  previewAction: {
    marginTop: spacing.lg,
  },
  withdrawRow: {
    marginTop: spacing.sm,
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
})
