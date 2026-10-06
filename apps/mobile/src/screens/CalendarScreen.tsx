/**
 * 职责：⑥ 时间容器 —— 日视图（单日精确时间轴）+ 周视图（整周 7 列一屏概览）
 * + 空闲时段高亮 + 个人任务新建（ARCH §6.6 / PRD 6.6 / M-P0-13、M-P0-14、M-P1-04）。
 *
 * 视图形态（两种）：
 * - 日视图：08:00–20:00 精确时间轴，任务块按时间比例定位，重叠任务走泳道水平并排。
 * - 周视图：整周 7 列等分一屏（无横向滚动），每列一条 08:00–20:00 时间带用色块表达忙闲密度，
 *   点击任意列进入该日的日视图。
 */
import { Feather } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useCallback, useMemo, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  BottomSheet,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FadeIn,
  LoadingView,
  OverviewBlock,
  PressableScale,
  SegmentedControl,
  StaleBadge,
  TimelineBlock,
  TextField,
  staggerDelay,
} from '@/components'
import { useAsync, useAuth } from '@/hooks'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import {
  CALENDAR_END_HOUR,
  CALENDAR_HOUR_HEIGHT,
  CALENDAR_START_HOUR,
  focusService,
  type CalendarBlock,
  type CalendarDay,
} from '@/services'
import { layout, radius, shadow, spacing, typography, type ThemeColors } from '@/theme'
import type { AppNavigationProp } from '@/types'
import { NETWORK_OFFLINE_MESSAGE, isNetworkError } from '@/types'
import { addMinutes, formatDate, formatWeekday, minutesFromMidnight, startOfDay, todayKey } from '@/utils/date'
import { assignLanes } from '@/utils/lane'
import { computeOverviewColumnWidth, formatCompactDate, resolveDayOffset } from '@/utils/overview'

/** 视图模式：日视图（单日精确时间轴）/ 周视图（整周 7 列一屏概览） */
type CalendarView = 'day' | 'week'

/** 日视图时间轴刻度列宽 */
const AXIS_LABEL_WIDTH = 48
/** 日视图时间轴总高（12 小时 × 56） */
const AXIS_HEIGHT = (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * CALENDAR_HOUR_HEIGHT
/** 块高低于该像素值时退化为紧凑条（单行小字号），避免内容溢出压住相邻块 */
const COMPACT_BLOCK_MIN_HEIGHT = 34
/**
 * 泳道数达到该值时，块宽已被切成约 1/3（390 视口下约 100px），
 * 不足以完整显示标题，退化为紧凑样式（小字号单行 + 省略号），
 * 避免出现「需求」「首页」这类 1–2 字的破碎标题。
 */
const COMPACT_LANE_THRESHOLD = 3
/**
 * 日期可前后浏览的天数范围。
 * 取舍：日视图保持 ±7 不变（回归零影响）；周视图点击列时用 `resolveDayOffset` 做**钳制**兜底，
 * 而当前 `getCalendarWeek` 返回「今天起连续 7 天」（offset 0..6）全部落在 ±7 内，钳制为无操作，
 * 因此点击任一列都能精确落到目标日，不会「点了没反应 / 跳错天」。
 */
const DAY_NAV_RANGE = 7

/** 周视图列间距（7 列等分时的列间留白，取 spacing token） */
const WEEK_COLUMN_GAP = spacing.xxs
/** 周视图时间带高度（代表 08:00–20:00，由 spacing token 派生，落在建议区间 200–260px 内） */
const WEEK_BAND_HEIGHT = spacing.xxxl * 6
/** 周视图列头高度（星期 + 紧凑日期两行） */
const WEEK_HEADER_HEIGHT = spacing.xxxl
/** 周视图时间带内每 N 小时一条淡网格线（仅作方位参考，列窄故稀疏） */
const WEEK_GRID_STEP_HOURS = 3

const VIEW_OPTIONS: { value: CalendarView; label: string }[] = [
  { value: 'day', label: '日视图' },
  { value: 'week', label: '周视图' },
]

const HOURS = Array.from(
  { length: CALENDAR_END_HOUR - CALENDAR_START_HOUR + 1 },
  (_, index) => CALENDAR_START_HOUR + index,
)

/** 把时刻换算为时间轴内的比例（相对 08:00–20:00 区间） */
function ratioOf(iso: string, timezone: string): number {
  const minutes = minutesFromMidnight(iso, timezone) - CALENDAR_START_HOUR * 60
  return minutes / ((CALENDAR_END_HOUR - CALENDAR_START_HOUR) * 60)
}

/** 把比例夹到 [0, 1] */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/** 相对 08:00 的分钟偏移（泳道重叠判定用；跨出时间窗时为负值或 >720，不影响比较） */
function axisMinutes(iso: string, timezone: string): number {
  return minutesFromMidnight(iso, timezone) - CALENDAR_START_HOUR * 60
}

/** 时间轴单个块的布局结果（比例定位 + 泳道 + 裁剪提示 + 紧凑标记），日 / 周视图共用 */
interface TimelineBlockLayout {
  block: CalendarBlock
  topRatio: number
  heightRatio: number
  laneIndex: number
  laneCount: number
  compact: boolean
  continuationTop: boolean
  continuationBottom: boolean
}

/**
 * 计算某一天在时间轴上的可视布局（日 / 周视图共用同一套逻辑，避免两份实现分叉）：
 * ① 复用 assignLanes 把「时间区间重叠」的任务分配到泳道 —— 水平并排、互不叠压（BugFix #18）；
 * ② 按 08:00–20:00 比例定位 top / height，并裁剪到窗口内（跨边界任务只显示窗口内部分）；
 * ③ 块高不足以放下两行标题（纵向）或块宽被泳道切得过窄（横向）时标记 compact；
 * ④ 标注跨 08:00 / 20:00 边界的延续提示（↑ / ↓）。
 *
 * @param day 某天的任务块（团队 + 个人，已按 startAt 排序）
 * @param timezone 目标时区（D-06：所有时刻按此时区换算）
 */
function layoutBlocks(day: CalendarDay, timezone: string): TimelineBlockLayout[] {
  const lanes = assignLanes(
    day.blocks.map((block) => ({
      id: block.id,
      start: axisMinutes(block.startAt, timezone),
      end: axisMinutes(block.endAt, timezone),
    })),
  )
  const laneById = new Map(lanes.map((lane) => [lane.id, lane]))

  return day.blocks.map((block) => {
    const rawTop = ratioOf(block.startAt, timezone)
    const rawBottom = ratioOf(block.endAt, timezone)
    const top = clamp01(rawTop)
    const bottom = clamp01(rawBottom)
    const height = Math.max(0, bottom - top)
    const lane = laneById.get(block.id)
    const laneIndex = lane?.laneIndex ?? 0
    const laneCount = lane?.laneCount ?? 1
    // 纵向：块高放不下两行标题；横向：泳道数 ≥ 阈值致块宽不足 → 均退化为紧凑样式
    const compact =
      height * AXIS_HEIGHT < COMPACT_BLOCK_MIN_HEIGHT || laneCount >= COMPACT_LANE_THRESHOLD
    return {
      block,
      topRatio: top,
      heightRatio: height,
      laneIndex,
      laneCount,
      compact,
      continuationTop: rawTop < 0,
      continuationBottom: rawBottom > 1,
    }
  })
}

/** 时间容器 */
export function CalendarScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<AppNavigationProp>()
  const { user } = useAuth()
  const { colors } = useTheme()
  const styles = useThemedStyles(makeStyles)
  const timezone = user?.timezone ?? 'Asia/Shanghai'
  const userId = user?.id ?? ''

  const [view, setView] = useState<CalendarView>('day')
  const [dayOffset, setDayOffset] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  /** 周视图容器实测宽度（用于按可用宽度等分 7 列，不写死像素） */
  const [weekWidth, setWeekWidth] = useState(0)
  const [createVisible, setCreateVisible] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newStart, setNewStart] = useState('09:00')
  const [newEnd, setNewEnd] = useState('10:00')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const day = useAsync<CalendarDay>(
    () => focusService.getCalendarDay(userId, timezone, dayOffset),
    [userId, timezone, dayOffset],
    { cache: { key: `calendar:day:${dayOffset}` } },
  )
  const week = useAsync<CalendarDay[]>(() => focusService.getCalendarWeek(userId, timezone), [userId, timezone], {
    cache: { key: 'calendar:week' },
  })

  const blocks = day.data?.blocks ?? []
  const freeSlots = day.data?.freeSlots ?? []

  const totalFreeMinutes = useMemo(
    () => freeSlots.reduce((sum, slot) => sum + slot.minutes, 0),
    [freeSlots],
  )

  /** 日视图当天的可视布局：泳道分配 + 时间比例定位 + 边界裁剪提示（随数据 / 时区重算） */
  const dayLayouts = useMemo(
    () => (day.data ? layoutBlocks(day.data, timezone) : []),
    [day.data, timezone],
  )

  /** 周视图每天的可视布局：与日视图共用同一套泳道 / 定位逻辑（避免两份实现分叉） */
  const weekLayouts = useMemo(
    () =>
      (week.data ?? []).map((item) => ({
        day: item,
        laidOutBlocks: layoutBlocks(item, timezone),
      })),
    [week.data, timezone],
  )

  /** 周视图列宽：按容器实测宽度等分（7 列 + 列间距），向下取整以避免横向溢出 */
  const weekColumnWidth = useMemo(
    () => computeOverviewColumnWidth(weekWidth, weekLayouts.length || 7, WEEK_COLUMN_GAP),
    [weekWidth, weekLayouts.length],
  )

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([day.refetch(), week.refetch()])
    setRefreshing(false)
  }, [day, week])

  const openBlock = useCallback(
    (block: CalendarBlock) => {
      if (block.kind === 'task') {
        navigation.navigate('TaskDetail', { taskId: block.sourceId, from: 'time' })
      }
    },
    [navigation],
  )

  /**
   * 点击整周视图某列 → 定位到该天的日视图。
   * dayOffset 经 `resolveDayOffset` 钳制到 ±DAY_NAV_RANGE，保证必定响应且不越界；
   * 当前周数据为「今天起连续 7 天」，钳制为无操作，点击精确落到目标日。
   */
  const openDay = useCallback(
    (dateKey: string) => {
      setDayOffset(resolveDayOffset(dateKey, todayKey(timezone), DAY_NAV_RANGE))
      setView('day')
    },
    [timezone],
  )

  /** 新建个人任务 */
  const handleCreate = useCallback(async () => {
    const title = newTitle.trim()
    if (!title) return
    setCreating(true)
    setCreateError(null)
    try {
      await focusService.createPersonalTask(userId, {
        title,
        startAt: todayAtTime(newStart, timezone),
        endAt: todayAtTime(newEnd, timezone),
      })
      setCreateVisible(false)
      setNewTitle('')
      setNewStart('09:00')
      setNewEnd('10:00')
      await Promise.all([day.refetch(), week.refetch()])
    } catch {
      setCreateError('创建失败，请稍后重试')
    } finally {
      setCreating(false)
    }
  }, [day, newEnd, newStart, newTitle, timezone, userId, week])

  const dayLabel = `${formatDate(new Date(Date.now() + dayOffset * 86_400_000), timezone)} ${formatWeekday(
    new Date(Date.now() + dayOffset * 86_400_000),
    timezone,
  )}`

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
        <FadeIn>
          <Text style={[typography.display, styles.title]}>时间容器</Text>
          <Text style={[typography.caption, styles.subtitle]}>
            08:00–20:00 · 空闲 {Math.round(totalFreeMinutes / 60)} 小时可排期
          </Text>
        </FadeIn>

        <FadeIn delay={staggerDelay(1)} style={styles.segmentedWrapper}>
          <SegmentedControl options={VIEW_OPTIONS} value={view} onChange={setView} />
        </FadeIn>

        {view === 'day' ? (
          <>
            {day.isStale && day.updatedAt !== null && !day.error ? (
              <StaleBadge updatedAt={day.updatedAt} />
            ) : null}
            {/* 日期导航 */}
            <FadeIn delay={staggerDelay(2)} style={styles.dateNav}>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="前一天"
                onPress={() => setDayOffset((value) => Math.max(-DAY_NAV_RANGE, value - 1))}
                scale={0.96}
                style={styles.navButton}
              >
                <Feather name="chevron-left" size={layout.icon.md} color={colors.text.primary} />
              </PressableScale>
              <Text style={[typography.title, styles.dateLabel]}>
                {dayOffset === 0 ? `今天 · ${dayLabel}` : dayLabel}
              </Text>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="后一天"
                onPress={() => setDayOffset((value) => Math.min(DAY_NAV_RANGE, value + 1))}
                scale={0.96}
                style={styles.navButton}
              >
                <Feather name="chevron-right" size={layout.icon.md} color={colors.text.primary} />
              </PressableScale>
              {dayOffset !== 0 ? (
                <PressableScale
                  accessibilityRole="button"
                  onPress={() => setDayOffset(0)}
                  scale={0.96}
                  style={styles.todayButton}
                >
                  <Text style={[typography.label, styles.todayText]}>回到今天</Text>
                </PressableScale>
              ) : null}
            </FadeIn>

            {day.loading ? (
              <LoadingView variant="skeleton" skeletonCount={3} />
            ) : day.error ? (
              <ErrorState
                message={isNetworkError(day.error) ? NETWORK_OFFLINE_MESSAGE : undefined}
                onRetry={() => void day.retry()}
              />
            ) : (
              <Card padded={false} style={styles.axisCard}>
                <View style={styles.axisRow}>
                  {/* 刻度列 */}
                  <View style={[styles.labels, { height: AXIS_HEIGHT }]}>
                    {HOURS.map((hour) => (
                      <View key={hour} style={styles.labelCell}>
                        <Text style={[typography.caption, styles.labelText]}>
                          {hour < 10 ? `0${hour}` : hour}:00
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* 网格 + 空闲带 + 任务块 */}
                  <View style={[styles.grid, { height: AXIS_HEIGHT }]}>
                    {HOURS.map((hour, index) => (
                      <View key={hour} style={[styles.gridLine, { top: index * CALENDAR_HOUR_HEIGHT }]} />
                    ))}

                    {freeSlots.map((slot) => (
                      <View
                        key={`free-${slot.startAt}`}
                        style={[
                          styles.freeBand,
                          {
                            top: ratioOf(slot.startAt, timezone) * AXIS_HEIGHT,
                            height: (slot.minutes / ((CALENDAR_END_HOUR - CALENDAR_START_HOUR) * 60)) * AXIS_HEIGHT,
                          },
                        ]}
                      />
                    ))}

                    {/* 任务块：按时间比例定位 + 重叠泳道并排（与周视图同源，BugFix #18） */}
                    {dayLayouts.map((laidOut) => (
                      <TimelineBlock
                        key={laidOut.block.id}
                        title={laidOut.block.title}
                        status={laidOut.block.status}
                        topRatio={laidOut.topRatio}
                        heightRatio={laidOut.heightRatio}
                        laneIndex={laidOut.laneIndex}
                        laneCount={laidOut.laneCount}
                        compact={laidOut.compact}
                        continuationTop={laidOut.continuationTop}
                        continuationBottom={laidOut.continuationBottom}
                        onPress={() => openBlock(laidOut.block)}
                      />
                    ))}
                  </View>
                </View>
              </Card>
            )}

            {blocks.length === 0 && !day.loading ? (
              <Card style={styles.emptyCard}>
                <EmptyState
                  icon="calendar"
                  title="今日暂无安排"
                  description="时间轴已按 08:00–20:00 渲染，可新建个人任务排期"
                  actionLabel="新建个人任务"
                  onAction={() => setCreateVisible(true)}
                />
              </Card>
            ) : null}
          </>
        ) : week.loading ? (
          <LoadingView variant="skeleton" skeletonCount={2} />
        ) : week.error ? (
          <ErrorState onRetry={() => void week.retry()} />
        ) : (
          <FadeIn delay={staggerDelay(2)} style={styles.weekWrapper}>
            {week.isStale && week.updatedAt !== null && !week.error ? (
              <StaleBadge updatedAt={week.updatedAt} />
            ) : null}
            {/* 周视图：整周 7 列一屏等分（随页面纵向滚动，无横向滚动） */}
            <View
              style={styles.weekRow}
              onLayout={(event) => setWeekWidth(event.nativeEvent.layout.width)}
            >
              {weekLayouts.map(({ day: dayItem, laidOutBlocks }, index) => {
                const isToday = dayItem.dateKey === todayKey(timezone)
                const isLast = index === weekLayouts.length - 1
                const count = laidOutBlocks.length
                return (
                  <PressableScale
                    key={dayItem.dateKey}
                    accessibilityRole="button"
                    accessibilityLabel={`${formatWeekday(dayItem.dateKey, timezone)} ${formatCompactDate(
                      dayItem.dateKey,
                    )}，${count > 0 ? `${count} 个任务` : '空闲'}`}
                    onPress={() => openDay(dayItem.dateKey)}
                    scale={0.96}
                    style={[
                      styles.weekColumn,
                      { width: weekColumnWidth, marginRight: isLast ? 0 : WEEK_COLUMN_GAP },
                    ]}
                  >
                    {/* 列头：星期 + 紧凑日期（今天墨蓝实心） */}
                    <View style={[styles.weekHeader, isToday ? styles.weekHeaderToday : null]}>
                      <Text
                        numberOfLines={1}
                        style={[
                          typography.label,
                          isToday ? styles.weekTextToday : styles.weekWeekday,
                        ]}
                      >
                        {formatWeekday(dayItem.dateKey, timezone)}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[typography.caption, isToday ? styles.weekTextToday : styles.weekDate]}
                      >
                        {formatCompactDate(dayItem.dateKey)}
                      </Text>
                    </View>

                    {/* 时间带：08:00–20:00，块内只显示颜色不显示文字（今天列底极淡主色） */}
                    <View
                      style={[
                        styles.weekBand,
                        isToday ? styles.weekBandToday : null,
                        { height: WEEK_BAND_HEIGHT },
                      ]}
                    >
                      {HOURS.map((hour, hourIndex) =>
                        (hour - CALENDAR_START_HOUR) % WEEK_GRID_STEP_HOURS === 0 ? (
                          <View
                            key={hour}
                            style={[
                              styles.weekLine,
                              {
                                top:
                                  (hourIndex / (CALENDAR_END_HOUR - CALENDAR_START_HOUR)) *
                                  WEEK_BAND_HEIGHT,
                              },
                            ]}
                          />
                        ) : null,
                      )}
                      {laidOutBlocks.map((laidOut) => (
                        <OverviewBlock
                          key={laidOut.block.id}
                          status={laidOut.block.status}
                          topRatio={laidOut.topRatio}
                          heightRatio={laidOut.heightRatio}
                          laneIndex={laidOut.laneIndex}
                          laneCount={laidOut.laneCount}
                        />
                      ))}
                    </View>

                    {/* 列底：当天任务数 / 空闲 */}
                    <Text numberOfLines={1} style={[typography.label, styles.weekCount]}>
                      {count > 0 ? `${count} 个` : '空闲'}
                    </Text>
                  </PressableScale>
                )
              })}
            </View>
            {/* 本周无任务：空态（三态齐全） */}
            {weekLayouts.every((layout) => layout.laidOutBlocks.length === 0) ? (
              <Card style={styles.emptyCard}>
                <EmptyState
                  icon="calendar"
                  title="本周暂无安排"
                  description="已按 08:00–20:00 渲染，点击任意列可进入该日排期"
                  actionLabel="新建个人任务"
                  onAction={() => setCreateVisible(true)}
                />
              </Card>
            ) : null}
          </FadeIn>
        )}
      </ScrollView>

      {/* 新建个人任务浮动按钮（P1） */}
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="新建个人任务"
        onPress={() => setCreateVisible(true)}
        scale={0.94}
        style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}
      >
        <Feather name="plus" size={layout.icon.lg} color={colors.text.inverse} />
      </PressableScale>

      {/* 新建个人任务抽屉 */}
      <BottomSheet
        visible={createVisible}
        onClose={() => setCreateVisible(false)}
        title="新建个人任务"
        heightRatio={0.5}
      >
        <TextField label="任务标题" value={newTitle} onChangeText={setNewTitle} maxLength={60} />
        <View style={styles.timeRow}>
          <View style={styles.timeField}>
            <TextField label="开始（HH:mm）" value={newStart} onChangeText={setNewStart} />
          </View>
          <View style={styles.timeField}>
            <TextField label="结束（HH:mm）" value={newEnd} onChangeText={setNewEnd} />
          </View>
        </View>
        {createError ? (
          <Text style={[typography.caption, styles.createError]}>{createError}</Text>
        ) : null}
        <View style={styles.createAction}>
          <Button
            label="创建"
            fullWidth
            loading={creating}
            disabled={newTitle.trim().length === 0}
            onPress={() => void handleCreate()}
          />
        </View>
      </BottomSheet>
    </View>
  )
}

/** 把 HH:mm 转成「目标时区今天该时刻」的 ISO 字符串（D-06：按 user.timezone 构造，而非设备本地时区） */
function todayAtTime(hhmm: string, timezone: string): string {
  const [hourText, minuteText] = hhmm.split(':')
  const hour = Number.isFinite(Number(hourText)) ? Number(hourText) : 0
  const minute = Number.isFinite(Number(minuteText)) ? Number(minuteText) : 0
  const safeHour = Math.min(23, Math.max(0, hour))
  const safeMinute = Math.min(59, Math.max(0, minute))
  const base = startOfDay(new Date(), timezone)
  return addMinutes(base, safeHour * 60 + safeMinute).toISOString()
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
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
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
  axisCard: {
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  axisRow: {
    flexDirection: 'row',
  },
  labels: {
    width: AXIS_LABEL_WIDTH,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  labelCell: {
    height: CALENDAR_HOUR_HEIGHT,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingRight: spacing.xxs,
    paddingTop: spacing.xxs,
  },
  labelText: {
    color: colors.text.tertiary,
  },
  grid: {
    flex: 1,
    position: 'relative',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.border,
  },
  freeBand: {
    position: 'absolute',
    left: spacing.xxs,
    right: spacing.xxs,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryFaint,
    opacity: 0.7,
  },
  emptyCard: {
    marginTop: spacing.md,
  },
  // ── 周视图（整周 7 列一屏概览） ──────────────────────────────────────
  weekWrapper: {
    marginTop: spacing.md,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  weekColumn: {
    alignItems: 'stretch',
  },
  weekHeader: {
    height: WEEK_HEADER_HEIGHT,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxs,
  },
  weekHeaderToday: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  weekWeekday: {
    color: colors.text.primary,
  },
  weekDate: {
    color: colors.text.tertiary,
  },
  weekTextToday: {
    color: colors.text.inverse,
  },
  weekBand: {
    position: 'relative',
    marginTop: spacing.xxs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg.surface,
    overflow: 'hidden',
  },
  weekBandToday: {
    backgroundColor: colors.primaryFaint,
  },
  weekLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.border,
  },
  weekCount: {
    marginTop: spacing.xxs,
    textAlign: 'center',
    color: colors.text.secondary,
  },
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
  timeRow: {
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
  timeField: {
    flex: 1,
    marginRight: spacing.sm,
  },
  createError: {
    color: colors.danger,
    marginTop: spacing.xs,
  },
  createAction: {
    marginTop: spacing.md,
  },
})
