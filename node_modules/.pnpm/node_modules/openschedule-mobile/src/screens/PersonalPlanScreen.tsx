/**
 * 职责：个人计划页（P1 · M2-P1-01）—— 「列表」与「排期」双视图：
 * - 列表视图：个人任务按「今天 / 本周 / 以后」三段分组，支持完成（可撤销）/ 编辑 / 删除 / 新建。
 * - 排期视图：日视图复用 ScheduleTimeline（长按拖拽改期 + 点击时段选择改期）；
 *   周视图为「本周 7 天分组列表」（**一览职责**）。
 *
 * 视图裁定（主理人）：周视图**不做周时间轴** —— 拖拽主交互已在日视图闭环，
 * 周视图只承担「一眼看全周 + 快速跳回某天」的职责，避免维护两套拖拽坐标换算。
 *
 * 铁律：零原生依赖，动画仅用 RN 内置 Animated / LayoutAnimation（禁用第三方手势 / 动画库）；
 * 全部样式数值取自 @/theme token；时间轴相关业务常量取自 @/utils/schedule。
 */
import { Feather } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  BottomSheet,
  Button,
  Card,
  DateTimeField,
  EmptyState,
  ErrorState,
  FadeIn,
  LoadingView,
  PickerSheet,
  PressableScale,
  ScheduleTimeline,
  ScreenHeader,
  SegmentedControl,
  Tag,
  TextField,
  StaleBadge,
  UndoToast,
  runLayoutAnimation,
  staggerDelay,
  type PickerOption,
  type ScheduleBlock,
  type SegmentedControlOption,
} from '@/components'
import { useAsync, useAuth } from '@/hooks'
import { focusService, taskService } from '@/services'
import type { TranslationKey } from '@/i18n'
import { useT } from '@/store/I18nProvider'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { isNetworkError } from '@/types'
import {
  getPriorityColorFor,
  layout,
  radius,
  shadow,
  spacing,
  typography,
  type ThemeColors,
} from '@/theme'
import type { AppNavigationProp, PersonalTask, Task, TaskPriority } from '@/types'
import {
  addDays,
  daysUntil,
  formatDate,
  formatTime,
  formatWeekday,
  isSameDayInTz,
  minutesBetween,
  minutesFromMidnight,
  startOfDay,
  toDateKey,
  todayKey,
} from '@/utils/date'
import { goBackOrHome } from '@/utils/navigation'
import {
  AXIS_END_MIN,
  AXIS_START_MIN,
  MINUTES_PER_HOUR,
  SLOT_MINUTES,
  minutesToIso,
  type DropResult,
} from '@/utils/schedule'

/** 一级视图：列表 / 排期 */
type PlanView = 'list' | 'schedule'
/** 排期子视图：日 / 周 */
type ScheduleView = 'day' | 'week'

/** 一级分段选项（文案键在渲染期经 `t()` 求值） */
const VIEW_OPTIONS: { value: PlanView; labelKey: TranslationKey }[] = [
  { value: 'list', labelKey: 'screen.plan.view.list' },
  { value: 'schedule', labelKey: 'screen.plan.view.schedule' },
]

/** 排期子分段选项（文案键在渲染期经 `t()` 求值） */
const SCHEDULE_VIEW_OPTIONS: { value: ScheduleView; labelKey: TranslationKey }[] = [
  { value: 'day', labelKey: 'screen.plan.schedule.day' },
  { value: 'week', labelKey: 'screen.plan.schedule.week' },
]

/** 优先级可选值（与 theme.priorityLabel 同源，禁止硬编码中文） */
const PRIORITY_ORDER: TaskPriority[] = ['urgent', 'high', 'medium', 'low']

/** 优先级 → 领域字典键（`domain.ts` 同源派生，与 `theme.priorityLabel` 逐字一致） */
const PRIORITY_KEY: Record<TaskPriority, TranslationKey> = {
  urgent: 'priority.urgent',
  high: 'priority.high',
  medium: 'priority.medium',
  low: 'priority.low',
}

/** 日期可前后浏览的天数范围（与时间容器页一致，避免越界） */
const DAY_NAV_RANGE = 7

/** 周视图分组天数：今天起连续 7 天（与 focusService.getCalendarWeek 同窗口） */
const WEEK_VIEW_DAYS = 7

/** 两位补零（纯文本格式化，非样式数值） */
function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** 分钟（相对当天 00:00）→ 「HH:MM」 */
function formatSlotLabel(minutes: number): string {
  const hour = Math.floor(minutes / MINUTES_PER_HOUR)
  const minute = minutes % MINUTES_PER_HOUR
  return `${pad2(hour)}:${pad2(minute)}`
}

/** 按排期开始时间升序（无 startAt 的排最后，回落到 sortOrder） */
function sortByStart(a: PersonalTask, b: PersonalTask): number {
  if (a.startAt && b.startAt) return a.startAt.localeCompare(b.startAt)
  if (a.startAt) return -1
  if (b.startAt) return 1
  return a.sortOrder - b.sortOrder
}

/** 个人任务卡片入参（内联组件，形态对齐 TaskCard） */
interface PersonalTaskCardProps {
  task: PersonalTask
  timezone: string
  /** 点击整卡（周视图跳回日视图用）；提供时才可点 */
  onPress?: () => void
  /** 右侧「…」更多操作；提供时才渲染 */
  onMore?: () => void
  /** 左侧状态点：点击标记完成；提供时才渲染 */
  onComplete?: () => void
}

/**
 * 个人任务卡片：左侧优先级色条 + 标题 + 时间段 + 状态标签。
 * 形态与 TaskCard 对齐，但语义收敛到个人任务（无负责人 / 无项目）。
 */
function PersonalTaskCard({
  task,
  timezone,
  onPress,
  onMore,
  onComplete,
}: PersonalTaskCardProps): React.JSX.Element {
  const { colors, statusColor, priorityColor } = useTheme()
  const t = useT()
  const styles = useThemedStyles(makeStyles)
  const status = statusColor[task.status]
  const finished = task.status === 'done' || task.status === 'cancelled'
  const timeRange =
    task.startAt && task.endAt
      ? `${formatTime(task.startAt, timezone)}–${formatTime(task.endAt, timezone)}`
      : task.startAt
        ? `${formatTime(task.startAt, timezone)}–`
        : t('screen.plan.unscheduled')

  return (
    <Card onPress={onPress} padded={false}>
      <View style={styles.cardRow}>
        {/* 左侧优先级色条 */}
        <View style={[styles.priorityBar, { backgroundColor: getPriorityColorFor(task.priority, priorityColor) }]} />
        <View style={styles.cardBody}>
          <View style={styles.cardTitleRow}>
            {/* 状态点：点击即完成（可撤销） */}
            {onComplete ? (
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={t('screen.plan.completeA11y', { title: task.title })}
                onPress={onComplete}
                hitSlop={spacing.xs}
                scale={0.96}
                style={styles.statusDotHit}
              >
                <View style={[styles.statusDot, { backgroundColor: status.color }]} />
              </PressableScale>
            ) : null}

            <Text
              style={[
                typography.body,
                styles.cardTitle,
                finished ? styles.cardTitleMuted : null,
                task.status === 'done' ? styles.cardTitleStrike : null,
              ]}
              numberOfLines={2}
            >
              {task.title}
            </Text>

            {/* 更多操作「…」 */}
            {onMore ? (
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={t('screen.plan.more')}
                onPress={onMore}
                hitSlop={spacing.xs}
                scale={0.96}
                style={styles.moreButton}
              >
                <Feather name="more-horizontal" size={layout.icon.md} color={colors.text.tertiary} />
              </PressableScale>
            ) : null}
          </View>

          <View style={styles.cardMetaRow}>
            <Tag tone="status" status={task.status} text={t(`taskStatus.${task.status}`)} />
            <View style={styles.cardTimeItem}>
              <Feather name="clock" size={layout.icon.sm} color={colors.text.secondary} />
              <Text style={[typography.caption, styles.cardTimeText]} numberOfLines={1}>
                {timeRange}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Card>
  )
}

/** 撤销状态（完成个人任务后的 3s 可撤销窗口） */
interface UndoState {
  taskId: string
  message: string
}

/** 个人计划页 */
export function PersonalPlanScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<AppNavigationProp>()
  const { user } = useAuth()
  const { colors, priorityColor } = useTheme()
  const t = useT()
  const styles = useThemedStyles(makeStyles)
  const timezone = user?.timezone ?? 'Asia/Shanghai'
  const userId = user?.id ?? ''

  /** 优先级选择项（文案经 `t()` 求值，随语言切换） */
  const priorityOptions: PickerOption<TaskPriority>[] = PRIORITY_ORDER.map((value) => ({
    value,
    label: t(PRIORITY_KEY[value]),
  }))

  /** 一级分段选项（文案经 `t()` 求值，随语言切换） */
  const viewOptions: SegmentedControlOption<PlanView>[] = VIEW_OPTIONS.map((option) => ({
    value: option.value,
    label: t(option.labelKey),
  }))

  /** 排期子分段选项（文案经 `t()` 求值，随语言切换） */
  const scheduleViewOptions: SegmentedControlOption<ScheduleView>[] = SCHEDULE_VIEW_OPTIONS.map(
    (option) => ({ value: option.value, label: t(option.labelKey) }),
  )

  // ── 视图与排期导航 ────────────────────────────────────────────────
  const [view, setView] = useState<PlanView>('list')
  const [scheduleView, setScheduleView] = useState<ScheduleView>('day')
  const [dayOffset, setDayOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // ── 操作表 / 表单 ─────────────────────────────────────────────────
  const [actionTask, setActionTask] = useState<PersonalTask | null>(null)
  const [deleteTask, setDeleteTask] = useState<PersonalTask | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [formVisible, setFormVisible] = useState(false)
  const [editingTask, setEditingTask] = useState<PersonalTask | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formPriority, setFormPriority] = useState<TaskPriority>('medium')
  const [formStartAt, setFormStartAt] = useState<string | null>(null)
  const [formEndAt, setFormEndAt] = useState<string | null>(null)
  const [formTitleError, setFormTitleError] = useState<string | null>(null)
  const [formStartError, setFormStartError] = useState<string | null>(null)
  const [formEndError, setFormEndError] = useState<string | null>(null)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [priorityPickerVisible, setPriorityPickerVisible] = useState(false)

  // ── 时段选择（点击块的可发现性 / 无障碍兜底） ─────────────────────
  const [slotTask, setSlotTask] = useState<PersonalTask | null>(null)

  // ── 撤销 / 轻提示 ─────────────────────────────────────────────────
  const [undo, setUndo] = useState<UndoState | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [])

  /** 展示中文轻提示（2.2s 自动消失） */
  const showToast = useCallback((text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(text)
    toastTimer.current = setTimeout(() => setToast(null), 2200)
  }, [])

  // ── 数据源 ────────────────────────────────────────────────────────
  const personalTasks = useAsync<PersonalTask[]>(() => focusService.listPersonalTasks(userId), [userId], {
    cache: { key: 'personal:tasks' },
  })
  const scheduledTasks = useAsync<Task[]>(() => taskService.listScheduledTasks(timezone), [timezone], {
    cache: { key: 'tasks:scheduled' },
  })

  const todayKeyStr = useMemo(() => todayKey(timezone), [timezone])

  /** 周视图 / 「本周」分组共用的 7 天窗口（今天起连续 7 天） */
  const weekDays = useMemo(() => {
    const base = startOfDay(new Date(), timezone)
    return Array.from({ length: WEEK_VIEW_DAYS }, (_unused, index) => addDays(base, index))
  }, [timezone])

  /** 7 天窗口的日期键集合（用于「本周」归属判定） */
  const weekKeySet = useMemo(
    () => new Set(weekDays.map((date) => toDateKey(date, timezone))),
    [weekDays, timezone],
  )

  /** 列表三分组：今天 / 本周 / 以后（startAt 空或落在窗口外一律归「以后」，保证不丢卡片） */
  const groups = useMemo(() => {
    const today: PersonalTask[] = []
    const week: PersonalTask[] = []
    const later: PersonalTask[] = []
    ;(personalTasks.data ?? []).forEach((task) => {
      const key = task.startAt ? toDateKey(task.startAt, timezone) : null
      if (key !== null && key === todayKeyStr) {
        today.push(task)
      } else if (key !== null && weekKeySet.has(key)) {
        week.push(task)
      } else {
        later.push(task)
      }
    })
    return {
      today: today.sort(sortByStart),
      week: week.sort(sortByStart),
      later: later.sort(sortByStart),
    }
  }, [personalTasks.data, timezone, todayKeyStr, weekKeySet])

  /** 排期日视图的选中日期 */
  const dayDate = useMemo(() => addDays(new Date(), dayOffset), [dayOffset])

  /** 日视图块：个人任务（可拖）+ 团队任务（只读） */
  const blocks = useMemo<ScheduleBlock[]>(() => {
    const personal = (personalTasks.data ?? [])
      .filter((task): task is PersonalTask & { startAt: string } => task.startAt !== null)
      .filter((task) => isSameDayInTz(task.startAt, dayDate, timezone))
      .map<ScheduleBlock>((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        kind: 'personal',
        startAt: task.startAt,
        endAt: task.endAt ?? task.startAt,
      }))

    const team = (scheduledTasks.data ?? [])
      .filter((task): task is Task & { startAt: string } => Boolean(task.startAt))
      .filter((task) => isSameDayInTz(task.startAt, dayDate, timezone))
      .map<ScheduleBlock>((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        kind: 'task',
        startAt: task.startAt,
        endAt: task.endAt ?? task.dueAt ?? task.startAt,
      }))

    return [...personal, ...team].sort((a, b) => a.startAt.localeCompare(b.startAt))
  }, [personalTasks.data, scheduledTasks.data, dayDate, timezone])

  /** 周视图分组：每天 + 当天个人任务（只读一览） */
  const weekSections = useMemo(
    () =>
      weekDays.map((date) => ({
        date,
        key: toDateKey(date, timezone),
        tasks: (personalTasks.data ?? [])
          .filter((task) => task.startAt !== null && isSameDayInTz(task.startAt, date, timezone))
          .sort(sortByStart),
      })),
    [weekDays, personalTasks.data, timezone],
  )

  const dayLabel = `${formatDate(dayDate, timezone)} ${formatWeekday(dayDate, timezone)}`

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([personalTasks.refetch(), scheduledTasks.refetch()])
    setRefreshing(false)
  }, [personalTasks, scheduledTasks])

  const handleRetry = useCallback(() => {
    void personalTasks.retry()
    void scheduledTasks.retry()
  }, [personalTasks, scheduledTasks])

  // ── 列表操作 ──────────────────────────────────────────────────────

  /** 完成个人任务（乐观移除 + LayoutAnimation + 可撤销） */
  const handleComplete = useCallback(
    async (task: PersonalTask) => {
      try {
        await focusService.completePersonalTask(task.id)
        runLayoutAnimation()
        personalTasks.setData((previous) =>
          previous ? previous.filter((item) => item.id !== task.id) : previous,
        )
        setUndo({ taskId: task.id, message: t('screen.plan.toast.completed', { title: task.title }) })
      } catch {
        showToast(t('screen.plan.toast.failed'))
      }
    },
    [personalTasks, showToast, t],
  )

  /** 撤销完成（回滚为待办并刷新） */
  const handleUndo = useCallback(async () => {
    const current = undo
    if (!current) return
    setUndo(null)
    try {
      await focusService.updatePersonalTask(current.taskId, { status: 'todo' })
    } catch {
      showToast(t('screen.plan.toast.undoFailed'))
    } finally {
      await personalTasks.refetch()
    }
  }, [personalTasks, showToast, t, undo])

  const handleUndoExpire = useCallback(() => setUndo(null), [])

  /** 打开新建表单（空值） */
  const openCreate = useCallback(() => {
    setActionTask(null)
    setEditingTask(null)
    setFormTitle('')
    setFormPriority('medium')
    setFormStartAt(null)
    setFormEndAt(null)
    setFormTitleError(null)
    setFormStartError(null)
    setFormEndError(null)
    setFormVisible(true)
  }, [])

  /** 打开编辑表单（预填当前值） */
  const openEdit = useCallback((task: PersonalTask) => {
    setActionTask(null)
    setEditingTask(task)
    setFormTitle(task.title)
    setFormPriority(task.priority)
    setFormStartAt(task.startAt)
    setFormEndAt(task.endAt)
    setFormTitleError(null)
    setFormStartError(null)
    setFormEndError(null)
    setFormVisible(true)
  }, [])

  const handleTitleChange = useCallback((next: string) => {
    setFormTitle(next)
    setFormTitleError(null)
  }, [])

  const handleStartChange = useCallback((next: string | null) => {
    setFormStartAt(next)
    setFormStartError(null)
    setFormEndError(null)
  }, [])

  const handleEndChange = useCallback((next: string | null) => {
    setFormEndAt(next)
    setFormEndError(null)
  }, [])

  /** 提交表单：标题非空 + 起止均选 + end > start（字段级红字） */
  const handleSubmit = useCallback(async () => {
    const title = formTitle.trim()
    let valid = true

    if (!title) {
      setFormTitleError(t('screen.plan.error.titleRequired'))
      valid = false
    } else {
      setFormTitleError(null)
    }

    if (!formStartAt) {
      setFormStartError(t('screen.plan.error.startRequired'))
      valid = false
    } else {
      setFormStartError(null)
    }

    if (!formEndAt) {
      setFormEndError(t('screen.plan.error.endRequired'))
      valid = false
    } else if (formStartAt && new Date(formEndAt).getTime() <= new Date(formStartAt).getTime()) {
      setFormEndError(t('screen.plan.error.endAfterStart'))
      valid = false
    } else {
      setFormEndError(null)
    }

    if (!valid || !formStartAt || !formEndAt) return

    setFormSubmitting(true)
    try {
      if (editingTask) {
        await focusService.updatePersonalTask(editingTask.id, {
          title,
          priority: formPriority,
          startAt: formStartAt,
          endAt: formEndAt,
        })
      } else {
        await focusService.createPersonalTask(userId, {
          title,
          priority: formPriority,
          startAt: formStartAt,
          endAt: formEndAt,
        })
      }
      setFormVisible(false)
      runLayoutAnimation()
      await personalTasks.refetch()
    } catch {
      showToast(
        editingTask ? t('screen.plan.toast.saveFailed') : t('screen.plan.toast.createFailed'),
      )
    } finally {
      setFormSubmitting(false)
    }
  }, [
    editingTask,
    formEndAt,
    formPriority,
    formStartAt,
    formTitle,
    personalTasks,
    showToast,
    t,
    userId,
  ])

  /** 删除个人任务（二次确认后执行） */
  const handleDelete = useCallback(async () => {
    const target = deleteTask
    if (!target) return
    setDeleting(true)
    try {
      await focusService.deletePersonalTask(target.id)
      setDeleteTask(null)
      runLayoutAnimation()
      await personalTasks.refetch()
    } catch {
      showToast(t('screen.plan.toast.deleteFailed'))
    } finally {
      setDeleting(false)
    }
  }, [deleteTask, personalTasks, showToast, t])

  // ── 排期操作 ──────────────────────────────────────────────────────

  /** 拖拽态变化（页面据此控制滚动，隔离手势） */
  const handleDragStateChange = useCallback((next: boolean) => setDragging(next), [])

  /** 拖拽改期：成功重排刷新，失败提示 + 回滚刷新 */
  const handleReschedule = useCallback(
    async (blockId: string, result: DropResult): Promise<void> => {
      try {
        await focusService.schedulePersonalTask(blockId, {
          startAt: minutesToIso(dayDate, result.startMin, timezone),
          endAt: minutesToIso(dayDate, result.endMin, timezone),
        })
        runLayoutAnimation()
        await Promise.all([personalTasks.refetch(), scheduledTasks.refetch()])
      } catch {
        showToast(t('screen.plan.toast.rescheduleFailed'))
        await personalTasks.refetch()
      }
    },
    [dayDate, personalTasks, scheduledTasks, showToast, t, timezone],
  )

  /** 点击块：团队任务 → 详情；个人任务 → 时段选择抽屉 */
  const handleBlockPress = useCallback(
    (blockId: string) => {
      const block = blocks.find((item) => item.id === blockId)
      if (!block) return
      if (block.kind === 'task') {
        navigation.navigate('TaskDetail', { taskId: blockId, from: 'time' })
        return
      }
      const task = (personalTasks.data ?? []).find((item) => item.id === blockId) ?? null
      setSlotTask(task)
    },
    [blocks, navigation, personalTasks.data],
  )

  /** 时段选项：由 SLOT_MINUTES / AXIS_START_MIN / AXIS_END_MIN 循环生成，时长取该任务当前时长 */
  const slotOptions = useMemo<PickerOption<string>[]>(() => {
    const task = slotTask
    if (!task || !task.startAt || !task.endAt) return []
    const duration = Math.max(SLOT_MINUTES, minutesBetween(task.startAt, task.endAt))
    const options: PickerOption<string>[] = []
    for (let start = AXIS_START_MIN; start + duration <= AXIS_END_MIN; start += SLOT_MINUTES) {
      options.push({
        value: String(start),
        label: `${formatSlotLabel(start)} – ${formatSlotLabel(start + duration)}`,
      })
    }
    return options
  }, [slotTask])

  /** 时段选择当前值（该任务在选中日的开始分钟） */
  const slotValue =
    slotTask && slotTask.startAt ? String(minutesFromMidnight(slotTask.startAt, timezone)) : null

  /** 选中时段 → 改期（与拖拽复用 schedulePersonalTask） */
  const handleSlotSelect = useCallback(
    async (value: string) => {
      const task = slotTask
      if (!task || !task.startAt || !task.endAt) return
      const duration = Math.max(SLOT_MINUTES, minutesBetween(task.startAt, task.endAt))
      const startMin = Number(value)
      try {
        await focusService.schedulePersonalTask(task.id, {
          startAt: minutesToIso(dayDate, startMin, timezone),
          endAt: minutesToIso(dayDate, startMin + duration, timezone),
        })
        runLayoutAnimation()
      } catch {
        showToast(t('screen.plan.toast.rescheduleFailed'))
      } finally {
        await personalTasks.refetch()
      }
    },
    [dayDate, personalTasks, showToast, slotTask, t, timezone],
  )

  /** 周视图点击某天 → 跳回日视图并选中该天 */
  const openDayFromWeek = useCallback(
    (date: Date) => {
      setDayOffset(daysUntil(date, timezone))
      setScheduleView('day')
    },
    [timezone],
  )

  // ── 列表视图 ──────────────────────────────────────────────────────
  const groupEntries = (
    [
      { key: 'today', titleKey: 'screen.plan.group.today', tasks: groups.today },
      { key: 'week', titleKey: 'screen.plan.group.week', tasks: groups.week },
      { key: 'later', titleKey: 'screen.plan.group.later', tasks: groups.later },
    ] as { key: string; titleKey: TranslationKey; tasks: PersonalTask[] }[]
  ).filter((entry) => entry.tasks.length > 0)

  const listSection = personalTasks.loading ? (
    <View style={styles.section}>
      <LoadingView variant="skeleton" skeletonCount={3} />
    </View>
  ) : personalTasks.error ? (
    <View style={styles.section}>
      <ErrorState
        message={isNetworkError(personalTasks.error) ? t('networkOffline') : undefined}
        onRetry={handleRetry}
      />
    </View>
  ) : groupEntries.length === 0 ? (
    <View style={styles.section}>
      <Card>
        <EmptyState
          icon="calendar"
          title={t('screen.plan.empty.title')}
          description={t('screen.plan.empty.description')}
          actionLabel={t('screen.plan.new')}
          onAction={openCreate}
        />
      </Card>
    </View>
  ) : (
    <View style={styles.section}>
      {personalTasks.isStale && personalTasks.updatedAt !== null && !personalTasks.error ? (
        <StaleBadge updatedAt={personalTasks.updatedAt} />
      ) : null}
      {groupEntries.map((group, groupIndex) => (
        <View key={group.key} style={styles.group}>
          <Text style={[typography.label, styles.groupTitle]}>{t(group.titleKey)}</Text>
          {group.tasks.map((task, index) => (
            <FadeIn
              key={task.id}
              delay={staggerDelay(groupIndex + index)}
              style={styles.cardGap}
            >
              <PersonalTaskCard
                task={task}
                timezone={timezone}
                onComplete={() => void handleComplete(task)}
                onMore={() => setActionTask(task)}
              />
            </FadeIn>
          ))}
        </View>
      ))}
    </View>
  )

  // ── 排期视图 ──────────────────────────────────────────────────────
  const daySection = (
    <>
      <View style={styles.dateNav}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t('screen.plan.prevDay')}
          onPress={() => setDayOffset((value) => Math.max(-DAY_NAV_RANGE, value - 1))}
          scale={0.96}
          style={styles.navButton}
        >
          <Feather name="chevron-left" size={layout.icon.md} color={colors.text.primary} />
        </PressableScale>
        <Text style={[typography.title, styles.dateLabel]}>
          {dayOffset === 0 ? t('screen.plan.todayDate', { date: dayLabel }) : dayLabel}
        </Text>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t('screen.plan.nextDay')}
          onPress={() => setDayOffset((value) => Math.min(DAY_NAV_RANGE, value + 1))}
          scale={0.96}
          style={styles.navButton}
        >
          <Feather name="chevron-right" size={layout.icon.md} color={colors.text.primary} />
        </PressableScale>
        {dayOffset !== 0 ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={t('screen.plan.backToToday')}
            onPress={() => setDayOffset(0)}
            scale={0.96}
            style={styles.todayButton}
          >
            <Text style={[typography.label, styles.todayText]}>{t('screen.plan.backToToday')}</Text>
          </PressableScale>
        ) : null}
      </View>

      {personalTasks.loading || scheduledTasks.loading ? (
        <LoadingView variant="skeleton" skeletonCount={3} />
      ) : personalTasks.error || scheduledTasks.error ? (
        <ErrorState
        message={isNetworkError(personalTasks.error) ? t('networkOffline') : undefined}
        onRetry={handleRetry}
      />
      ) : (
        <>
          {personalTasks.isStale && personalTasks.updatedAt !== null && !personalTasks.error ? (
            <StaleBadge updatedAt={personalTasks.updatedAt} />
          ) : null}
          <Card padded={false} style={styles.timelineCard}>
            <ScheduleTimeline
              blocks={blocks}
              dayDate={dayDate}
              timezone={timezone}
              onDragStateChange={handleDragStateChange}
              onReschedule={handleReschedule}
              onBlockPress={handleBlockPress}
            />
          </Card>
          <Text style={[typography.caption, styles.hintText]}>
            {t('screen.plan.dragHint')}
          </Text>
          {blocks.length === 0 ? (
            <Card style={styles.emptyCard}>
              <EmptyState
                icon="calendar"
                title={t('screen.plan.empty.title')}
                description={t('screen.plan.dayEmpty.description')}
                actionLabel={t('screen.plan.new')}
                onAction={openCreate}
              />
            </Card>
          ) : null}
        </>
      )}
    </>
  )

  const weekSection = personalTasks.loading ? (
    <LoadingView variant="skeleton" skeletonCount={3} />
  ) : personalTasks.error ? (
    <ErrorState onRetry={handleRetry} />
  ) : (
    <>
      {personalTasks.isStale && personalTasks.updatedAt !== null && !personalTasks.error ? (
        <StaleBadge updatedAt={personalTasks.updatedAt} />
      ) : null}
      {weekSections.map((section) => {
        const isToday = section.key === todayKeyStr
        return (
          <View key={section.key} style={styles.weekGroup}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={`${formatDate(section.date, timezone)} ${formatWeekday(
                section.date,
                timezone,
              )}`}
              onPress={() => openDayFromWeek(section.date)}
              scale={1}
              pressedBg={colors.bg.subtle}
              style={styles.weekHeaderRow}
            >
              <Text
                style={[typography.label, isToday ? styles.weekHeaderToday : styles.weekHeaderText]}
              >
                {formatDate(section.date, timezone)} {formatWeekday(section.date, timezone)}
              </Text>
              {isToday ? (
                <Text style={[typography.label, styles.weekTodayTag]}>{t('screen.plan.group.today')}</Text>
              ) : null}
            </PressableScale>
            {section.tasks.length === 0 ? (
              <Text style={[typography.caption, styles.weekEmpty]}>{t('screen.plan.weekEmptyCell')}</Text>
            ) : (
              section.tasks.map((task) => (
                <View key={task.id} style={styles.cardGap}>
                  <PersonalTaskCard
                    task={task}
                    timezone={timezone}
                    onPress={() => openDayFromWeek(section.date)}
                  />
                </View>
              ))
            )}
          </View>
        )
      })}
      {(personalTasks.data ?? []).length === 0 ? (
        <Card style={styles.emptyCard}>
          <EmptyState
            icon="calendar"
            title={t('screen.plan.weekEmpty.title')}
            description={t('screen.plan.weekEmpty.description')}
            actionLabel={t('screen.plan.new')}
            onAction={openCreate}
          />
        </Card>
      ) : null}
    </>
  )

  const scheduleSection = (
    <View style={styles.section}>
      <SegmentedControl
        options={scheduleViewOptions}
        value={scheduleView}
        onChange={setScheduleView}
      />
      <View style={styles.scheduleBody}>
        {scheduleView === 'day' ? daySection : weekSection}
      </View>
    </View>
  )

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={t('screen.plan.title')}
        subtitle={
          personalTasks.data
            ? t('screen.plan.subtitle', { count: personalTasks.data.length })
            : undefined
        }
        onBack={() => goBackOrHome(navigation)}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xxxl * 2 }]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!dragging}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <FadeIn>
          <SegmentedControl options={viewOptions} value={view} onChange={setView} />
        </FadeIn>

        {view === 'list' ? listSection : scheduleSection}
      </ScrollView>

      {/* 新建个人任务浮动按钮 */}
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={t('screen.plan.newTask')}
        onPress={openCreate}
        scale={0.94}
        style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}
      >
        <Feather name="plus" size={layout.icon.lg} color={colors.text.inverse} />
      </PressableScale>

      {/* 操作表：编辑 / 删除 */}
      <BottomSheet
        visible={actionTask !== null}
        onClose={() => setActionTask(null)}
        title={actionTask?.title ?? ''}
        heightRatio={0.3}
      >
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t('common.edit')}
          onPress={() => {
            if (actionTask) openEdit(actionTask)
          }}
          scale={1}
          pressedBg={colors.bg.subtle}
          style={[styles.sheetRow, styles.sheetRowDivider]}
        >
          <Feather name="edit-2" size={layout.icon.md} color={colors.text.primary} />
          <Text style={[typography.body, styles.sheetRowText]}>{t('common.edit')}</Text>
        </PressableScale>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t('common.delete')}
          onPress={() => {
            const target = actionTask
            setActionTask(null)
            setDeleteTask(target)
          }}
          scale={1}
          pressedBg={colors.bg.subtle}
          style={styles.sheetRow}
        >
          <Feather name="trash-2" size={layout.icon.md} color={colors.danger} />
          <Text style={[typography.body, styles.sheetRowDanger]}>{t('common.delete')}</Text>
        </PressableScale>
      </BottomSheet>

      {/* 新建 / 编辑表单 */}
      <BottomSheet
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        title={editingTask ? t('screen.plan.form.editTitle') : t('screen.plan.newTask')}
        heightRatio={0.66}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <TextField
            label={t('screen.plan.form.titleField')}
            value={formTitle}
            onChangeText={handleTitleChange}
            maxLength={60}
            error={formTitleError}
          />
          <View style={styles.formGap}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={t('screen.plan.form.selectPriority')}
              onPress={() => setPriorityPickerVisible(true)}
              scale={1}
              pressedBg={colors.bg.subtle}
              style={styles.priorityField}
            >
              <View>
                <Text style={[typography.label, styles.priorityFieldLabel]}>
                  {t('screen.plan.form.priority')}
                </Text>
                <View style={styles.priorityValueRow}>
                  <View
                    style={[styles.priorityDot, { backgroundColor: getPriorityColorFor(formPriority, priorityColor) }]}
                  />
                  <Text style={[typography.body, styles.priorityValue]}>
                    {t(PRIORITY_KEY[formPriority])}
                  </Text>
                </View>
              </View>
              <Feather name="chevron-down" size={layout.icon.md} color={colors.text.tertiary} />
            </PressableScale>
          </View>
          <View style={styles.formGap}>
            <DateTimeField
              label={t('screen.plan.form.start')}
              value={formStartAt}
              onChange={handleStartChange}
              timezone={timezone}
              error={formStartError ?? undefined}
            />
          </View>
          <View style={styles.formGap}>
            <DateTimeField
              label={t('screen.plan.form.end')}
              value={formEndAt}
              onChange={handleEndChange}
              timezone={timezone}
              error={formEndError ?? undefined}
            />
          </View>
          <View style={styles.formAction}>
            <Button
              label={editingTask ? t('common.save') : t('screen.plan.form.submitCreate')}
              fullWidth
              loading={formSubmitting}
              onPress={() => void handleSubmit()}
            />
          </View>
        </ScrollView>
      </BottomSheet>

      {/* 删除二次确认 */}
      <BottomSheet
        visible={deleteTask !== null}
        onClose={() => setDeleteTask(null)}
        title={t('screen.plan.delete.title')}
        heightRatio={0.34}
      >
        <Text style={[typography.caption, styles.deleteHint]}>
          {t('screen.plan.delete.hint', { title: deleteTask?.title ?? '' })}
        </Text>
        <View style={styles.formAction}>
          <Button
            label={t('screen.plan.delete.confirm')}
            variant="danger"
            fullWidth
            loading={deleting}
            onPress={() => void handleDelete()}
          />
        </View>
      </BottomSheet>

      {/* 优先级选择 */}
      <PickerSheet
        visible={priorityPickerVisible}
        title={t('screen.plan.form.priority')}
        options={priorityOptions}
        value={formPriority}
        onSelect={setFormPriority}
        onClose={() => setPriorityPickerVisible(false)}
      />

      {/* 时段选择（点击块的无障碍兜底） */}
      <PickerSheet
        visible={slotTask !== null}
        title={t('screen.plan.picker.slot')}
        options={slotOptions}
        value={slotValue}
        onSelect={(value) => void handleSlotSelect(value)}
        onClose={() => setSlotTask(null)}
      />

      {/* 撤销 Toast */}
      <UndoToast
        visible={undo !== null}
        message={undo?.message ?? ''}
        onUndo={() => void handleUndo()}
        onExpire={handleUndoExpire}
      />

      {/* 错误 / 反馈轻提示 */}
      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + spacing.xxl }]} pointerEvents="none">
          <Text style={[typography.caption, styles.toastText]}>{toast}</Text>
        </View>
      ) : null}
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
  section: {
    marginTop: layout.sectionGap,
  },
  // ── 列表视图 ───────────────────────────────────────────────────────
  group: {
    marginBottom: layout.sectionGap,
  },
  groupTitle: {
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  cardGap: {
    marginBottom: layout.cardGap,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  priorityBar: {
    width: layout.priorityBarWidth,
    borderTopLeftRadius: radius.card,
    borderBottomLeftRadius: radius.card,
  },
  cardBody: {
    flex: 1,
    padding: layout.cardPadding,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  statusDotHit: {
    justifyContent: 'center',
    marginRight: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  statusDot: {
    width: spacing.sm,
    height: spacing.sm,
    borderRadius: radius.pill,
  },
  cardTitle: {
    flex: 1,
    color: colors.text.primary,
  },
  cardTitleMuted: {
    color: colors.text.tertiary,
  },
  cardTitleStrike: {
    textDecorationLine: 'line-through',
  },
  moreButton: {
    marginLeft: spacing.xxs,
    paddingVertical: spacing.xxs,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    flexWrap: 'wrap',
  },
  cardTimeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
  cardTimeText: {
    marginLeft: spacing.xxs,
    color: colors.text.secondary,
  },
  // ── 排期视图 ───────────────────────────────────────────────────────
  scheduleBody: {
    marginTop: spacing.md,
  },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  navButton: {
    width: layout.icon.lg + spacing.sm,
    height: layout.icon.lg + spacing.sm,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateLabel: {
    flex: 1,
    color: colors.text.primary,
    textAlign: 'center',
  },
  todayButton: {
    marginLeft: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryFaint,
  },
  todayText: {
    color: colors.primary,
  },
  timelineCard: {
    overflow: 'hidden',
  },
  hintText: {
    color: colors.text.tertiary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  emptyCard: {
    marginTop: spacing.md,
  },
  // ── 周视图（7 天分组一览） ─────────────────────────────────────────
  weekGroup: {
    marginBottom: layout.sectionGap,
  },
  weekHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  weekHeaderText: {
    color: colors.text.secondary,
  },
  weekHeaderToday: {
    color: colors.primary,
  },
  weekTodayTag: {
    color: colors.primary,
    backgroundColor: colors.primaryFaint,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    overflow: 'hidden',
  },
  weekEmpty: {
    color: colors.text.tertiary,
  },
  // ── FAB ────────────────────────────────────────────────────────────
  fab: {
    position: 'absolute',
    right: layout.screenPadding,
    width: spacing.xxxl + spacing.md,
    height: spacing.xxxl + spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.floating,
  },
  // ── 抽屉内容 ───────────────────────────────────────────────────────
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: spacing.xxl,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.sm,
  },
  sheetRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetRowText: {
    marginLeft: spacing.sm,
    color: colors.text.primary,
  },
  sheetRowDanger: {
    marginLeft: spacing.sm,
    color: colors.danger,
  },
  formGap: {
    marginTop: spacing.md,
  },
  priorityField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bg.surface,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    minHeight: spacing.xxxl + spacing.md,
    paddingHorizontal: spacing.sm + spacing.xxs,
    paddingVertical: spacing.xs,
  },
  priorityFieldLabel: {
    color: colors.text.secondary,
  },
  priorityValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xxs,
  },
  priorityDot: {
    width: spacing.sm,
    height: spacing.sm,
    borderRadius: radius.pill,
    marginRight: spacing.xs,
  },
  priorityValue: {
    color: colors.text.primary,
  },
  formAction: {
    marginTop: spacing.lg,
  },
  deleteHint: {
    color: colors.text.secondary,
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
