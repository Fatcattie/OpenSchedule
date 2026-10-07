/**
 * 职责：④ 项目看板 - 看板列视图 —— 横向滚动状态列 + 卡片状态流转（带 version 乐观锁）+ 撤销 Toast
 * （ARCH §6.4 / PRD 6.4 / M-P0-08）。
 */
import { Feather } from '@expo/vector-icons'
import { useNavigation, useRoute } from '@react-navigation/native'
import { useCallback, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  BottomSheet,
  Card,
  EmptyState,
  ErrorState,
  FadeIn,
  LoadingView,
  PressableScale,
  ProgressBar,
  ScreenHeader,
  TaskCard,
  StaleBadge,
  UndoToast,
  runLayoutAnimation,
  staggerDelay,
} from '@/components'
import { useAsync, useAppContext, useAuth } from '@/hooks'
import type { TranslationKey } from '@/i18n'
import { projectService, taskService, type BoardColumn } from '@/services'
import { useT } from '@/store/I18nProvider'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { layout, radius, spacing, typography, type ThemeColors } from '@/theme'
import type { AppNavigationProp, AppRouteProp, Task, TaskStatus, User } from '@/types'
import { TASK_TRANSITION_ACTIONS, getErrorMessage } from '@/types'
import { NETWORK_OFFLINE_MESSAGE, isNetworkError } from '@/types'
import { filterBoardColumns } from '@/utils/search'
import { userMap as buildUserMap } from '@/data'

/** 看板列宽度 */
const COLUMN_WIDTH = 264
/** 空列虚线占位高度 */
const EMPTY_COLUMN_HEIGHT = 88
/** 搜索条高度（由间距 token 推导，避免魔法数字） */
const SEARCH_BAR_HEIGHT = spacing.xxxl + spacing.xs
/** 撤销状态 */
interface UndoState {
  optimisticId: string
  taskId: string
  message: string
  prevStatus: TaskStatus
  prevVersion: number
}

/** 看板列状态 → 字典键（`BOARD_COLUMNS` 仅 5 列；`cancelled` 不出现，兜底回落 taskStatus） */
const BOARD_COLUMN_KEY: Record<TaskStatus, TranslationKey> = {
  todo: 'boardColumn.todo',
  in_progress: 'boardColumn.in_progress',
  blocked: 'boardColumn.blocked',
  pending_review: 'boardColumn.pending_review',
  done: 'boardColumn.done',
  cancelled: 'taskStatus.cancelled',
}

/**
 * 迁移动作 `(from, to)` → `taskAction.*` 键（语义与 `TASK_TRANSITION_ACTIONS` 一致）。
 *
 * 同一 `to` 在不同 `from` 下语义不同（如 `in_progress`：todo→开始执行 / blocked→解除阻塞 /
 * done→重开为进行中），故必须由 `(from, to)` 共同决定键。
 */
function transitionActionKey(from: TaskStatus, to: TaskStatus): TranslationKey {
  if (to === 'blocked') return 'taskAction.block'
  if (to === 'cancelled') return 'taskAction.cancel'
  if (to === 'done') return 'taskAction.complete'
  if (to === 'todo') return from === 'done' ? 'taskAction.reopenTodo' : 'taskAction.returnTodo'
  // to === 'in_progress'
  if (from === 'blocked') return 'taskAction.unblock'
  if (from === 'done') return 'taskAction.reopenInProgress'
  return 'taskAction.start'
}

/** 看板列视图 */
export function BoardScreen(): React.JSX.Element {
  const navigation = useNavigation<AppNavigationProp>()
  const route = useRoute<AppRouteProp<'Board'>>()
  const { projectId } = route.params
  const { user } = useAuth()
  const { colors, statusColor } = useTheme()
  const styles = useThemedStyles(makeStyles)
  const t = useT()
  const { pushOptimistic, rollbackOptimistic, commitOptimistic } = useAppContext()
  const timezone = user?.timezone ?? 'Asia/Shanghai'

  const stats = useAsync(() => projectService.getProjectStats(projectId), [projectId], {
    cache: { key: `projects:stats:${projectId}` },
  })
  const board = useAsync<BoardColumn[]>(() => projectService.listBoardColumns(projectId), [projectId], {
    cache: { key: `projects:board:${projectId}` },
  })

  const [menuTask, setMenuTask] = useState<Task | null>(null)
  const [undo, setUndo] = useState<UndoState | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)
  /** 任务搜索关键词（纯前端过滤，不触发任何 service / API 调用） */
  const [keyword, setKeyword] = useState('')

  const users = buildUserMap()

  /** 状态流转（乐观更新 + 可撤销） */
  const handleMove = useCallback(
    async (task: Task, to: TaskStatus) => {
      setMenuTask(null)
      setConflict(null)
      const optimisticId = pushOptimistic({ taskId: task.id, from: task.status, to })

      runLayoutAnimation()
      board.setData((previous) => {
        if (!previous) return previous
        return previous.map((column) => {
          if (column.status === to) {
            return { ...column, tasks: [...column.tasks, { ...task, status: to }] }
          }
          return { ...column, tasks: column.tasks.filter((item) => item.id !== task.id) }
        })
      })

      setUndo({
        optimisticId,
        taskId: task.id,
        message: t('screens.core.board.movedTo', {
          title: task.title,
          status: t(`taskStatus.${to}`),
        }),
        prevStatus: task.status,
        prevVersion: task.version,
      })

      try {
        await taskService.moveTask(task.id, { status: to, version: task.version })
        await Promise.all([board.refetch(), stats.refetch()])
      } catch (error) {
        rollbackOptimistic(optimisticId)
        setUndo(null)
        setConflict(getErrorMessage(error))
        await board.refetch()
      }
    },
    [board, pushOptimistic, rollbackOptimistic, stats, t],
  )

  /** 撤销流转 */
  const handleUndo = useCallback(async () => {
    const current = undo
    if (!current) return
    rollbackOptimistic(current.optimisticId)
    setUndo(null)
    try {
      await taskService.moveTask(current.taskId, {
        status: current.prevStatus,
        version: current.prevVersion + 1,
      })
    } catch (error) {
      setConflict(getErrorMessage(error))
    } finally {
      await board.refetch()
    }
  }, [board, rollbackOptimistic, undo])

  const handleUndoExpire = useCallback(() => {
    if (!undo) return
    commitOptimistic(undo.optimisticId)
    setUndo(null)
  }, [commitOptimistic, undo])

  const openTask = useCallback(
    (taskId: string) => {
      navigation.navigate('TaskDetail', { taskId, from: 'board' })
    },
    [navigation],
  )

  const columns = board.data ?? []
  const project = stats.data?.project ?? null

  // 搜索：纯前端按关键词过滤各列任务（列结构 / 顺序不变，仅替换 tasks）
  const hasKeyword = keyword.trim().length > 0
  const filteredColumns = useMemo(() => filterBoardColumns(columns, keyword), [columns, keyword])
  const matchCount = filteredColumns.reduce((total, column) => total + column.tasks.length, 0)

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={project?.name ?? t('screens.core.board.title')}
        subtitle={
          stats.data
            ? t('screens.core.board.subtitle', {
                percent: Math.round(stats.data.progress * 100),
                done: stats.data.doneCount,
                total: stats.data.taskCount,
              })
            : t('screens.core.board.loading')
        }
        onBack={() => navigation.goBack()}
      />

      {/* 进度概览 */}
      {stats.data ? (
        <View style={styles.progressWrapper}>
          <ProgressBar value={stats.data.progress} tone={stats.data.progress >= 1 ? 'success' : 'primary'} />
        </View>
      ) : null}

      {conflict ? (
        <PressableScale style={styles.conflictBar} onPress={() => setConflict(null)} scale={1} pressedBg={colors.bg.subtle}>
          <Feather name="refresh-cw" size={layout.icon.sm} color={colors.danger} />
          <Text style={[typography.caption, styles.conflictText]} numberOfLines={2}>
            {conflict}
          </Text>
          <Text style={[typography.caption, styles.conflictClose]}>
            {t('screens.core.board.dismissConflict')}
          </Text>
        </PressableScale>
      ) : null}

      {board.loading ? (
        <LoadingView variant="skeleton" skeletonCount={3} />
      ) : board.error ? (
        <ErrorState
          message={isNetworkError(board.error) ? NETWORK_OFFLINE_MESSAGE : undefined}
          onRetry={() => void board.retry()}
        />
      ) : columns.length === 0 ? (
        <Card>
          <EmptyState
            icon="columns"
            title={t('screens.core.board.emptyColumnsTitle')}
            description={t('screens.core.board.emptyColumnsDesc')}
          />
        </Card>
      ) : (
        <>
          {board.isStale && board.updatedAt !== null && !board.error ? (
            <StaleBadge updatedAt={board.updatedAt} />
          ) : null}
          {/* 任务搜索（纯前端过滤；关键词非空时显示清空按钮） */}
          <View style={styles.searchWrapper}>
            <View style={styles.searchBar}>
              <Feather name="search" size={layout.icon.sm} color={colors.text.tertiary} />
              <TextInput
                value={keyword}
                onChangeText={setKeyword}
                placeholder={t('screens.core.board.searchPlaceholder')}
                placeholderTextColor={colors.text.tertiary}
                selectionColor={colors.primary}
                returnKeyType="search"
                accessibilityLabel={t('screens.core.board.searchPlaceholder')}
                style={styles.searchInput}
              />
              {hasKeyword ? (
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={t('screens.core.board.clearSearchA11y')}
                  onPress={() => setKeyword('')}
                  scale={0.9}
                  pressedBg={colors.bg.subtle}
                  hitSlop={spacing.xs}
                  style={styles.searchClear}
                >
                  <Feather name="x" size={layout.icon.sm} color={colors.text.tertiary} />
                </PressableScale>
              ) : null}
            </View>
          </View>

          {hasKeyword && matchCount === 0 ? (
            <Card>
              <EmptyState
                icon="search"
                title={t('screens.core.board.noMatchTitle')}
                description={t('screens.core.board.noMatchDesc', { keyword: keyword.trim() })}
              />
            </Card>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.columnsContent}
              decelerationRate="fast"
            >
              {filteredColumns.map((column, columnIndex) => (
                <FadeIn key={column.status} delay={staggerDelay(columnIndex)} style={styles.column}>
                  <View style={styles.columnHeader}>
                    <View style={[styles.columnDot, { backgroundColor: statusColor[column.status].color }]} />
                    <Text style={[typography.title, styles.columnTitle]}>
                      {t(BOARD_COLUMN_KEY[column.status])}
                    </Text>
                    <Text style={[typography.caption, styles.columnCount]}>{column.tasks.length}</Text>
                  </View>

                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.columnBody}
                  >
                    {column.tasks.length === 0 ? (
                      <View style={styles.emptyColumn}>
                        <Text style={[typography.caption, styles.emptyColumnText]}>
                          {hasKeyword
                            ? t('screens.core.board.emptyColumnNoMatch')
                            : t('screens.core.board.emptyColumn')}
                        </Text>
                      </View>
                    ) : (
                      column.tasks.map((task) => (
                        <View key={task.id} style={styles.boardCardGap}>
                          <TaskCard
                            task={task}
                            assignee={resolveAssignee(users, task.assigneeId)}
                            timezone={timezone}
                            compact
                            onPress={() => openTask(task.id)}
                          />
                          {/* 状态切换入口渲染为卡片之后的兄弟节点（不在卡片 Pressable 内），消除 `<button>` 嵌套 */}
                          <View style={styles.cardMenuRow}>
                            <PressableScale
                              accessibilityRole="button"
                              accessibilityLabel={t('screens.core.board.switchStatusA11y')}
                              onPress={() => setMenuTask(task)}
                              hitSlop={spacing.xs}
                              scale={0.92}
                              pressedBg={colors.bg.subtle}
                              style={styles.cardMenu}
                            >
                              <Feather name="more-vertical" size={layout.icon.sm} color={colors.text.tertiary} />
                            </PressableScale>
                          </View>
                        </View>
                      ))
                    )}
                  </ScrollView>
                </FadeIn>
              ))}
            </ScrollView>
          )}
        </>
      )}

      {/* 状态切换菜单 */}
      <BottomSheet
        visible={menuTask !== null}
        onClose={() => setMenuTask(null)}
        title={menuTask ? t('screens.core.board.menuTitle', { title: menuTask.title }) : ''}
        heightRatio={0.42}
      >
        {menuTask ? (
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[typography.caption, styles.menuHint]}>
              {t('screens.core.board.menuCurrent', {
                status: t(`taskStatus.${menuTask.status}`),
                version: menuTask.version,
              })}
            </Text>
            {(TASK_TRANSITION_ACTIONS[menuTask.status] ?? []).map((action) => (
              <PressableScale
                key={`${action.to}-${transitionActionKey(menuTask.status, action.to)}`}
                accessibilityRole="button"
                onPress={() => void handleMove(menuTask, action.to)}
                scale={1}
                pressedBg={colors.bg.subtle}
                style={styles.menuItem}
              >
                <View style={[styles.menuDot, { backgroundColor: statusColor[action.to].color }]} />
                <Text style={[typography.body, styles.menuLabel]}>
                  {t(transitionActionKey(menuTask.status, action.to))}
                </Text>
                <Text style={[typography.caption, styles.menuMeta]}>
                  {t('screens.core.board.menuBecomes', { status: t(`taskStatus.${action.to}`) })}
                </Text>
                <Feather name="chevron-right" size={layout.icon.md} color={colors.text.tertiary} />
              </PressableScale>
            ))}
            {(TASK_TRANSITION_ACTIONS[menuTask.status] ?? []).length === 0 ? (
              <Text style={[typography.caption, styles.menuHint]}>
                {t('screens.core.board.menuNoTransition')}
              </Text>
            ) : null}
          </ScrollView>
        ) : null}
      </BottomSheet>

      <UndoToast
        visible={undo !== null}
        message={undo?.message ?? ''}
        onUndo={() => void handleUndo()}
        onExpire={handleUndoExpire}
      />
    </View>
  )
}

/** 从用户表解析负责人 */
function resolveAssignee(users: Map<string, User>, assigneeId: string | null): User | null {
  if (!assigneeId) return null
  return users.get(assigneeId) ?? null
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg.base,
  },
  progressWrapper: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.sm,
  },
  searchWrapper: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: SEARCH_BAR_HEIGHT,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bg.surface,
    gap: spacing.xs,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text.primary,
  },
  searchClear: {
    width: layout.icon.lg,
    height: layout.icon.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conflictBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: layout.screenPadding,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.control,
    backgroundColor: `${colors.danger}14`,
  },
  conflictText: {
    flex: 1,
    color: colors.danger,
    marginLeft: spacing.xs,
  },
  conflictClose: {
    color: colors.danger,
    marginLeft: spacing.xs,
  },
  columnsContent: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.xxxl,
  },
  column: {
    width: COLUMN_WIDTH,
    marginRight: layout.cardGap,
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  columnDot: {
    width: spacing.xs,
    height: spacing.xs,
    borderRadius: radius.pill,
    marginRight: spacing.xs,
  },
  columnTitle: {
    color: colors.text.primary,
    flex: 1,
  },
  columnCount: {
    color: colors.text.secondary,
  },
  columnBody: {
    paddingBottom: spacing.xxxl,
  },
  emptyColumn: {
    height: EMPTY_COLUMN_HEIGHT,
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyColumnText: {
    color: colors.text.tertiary,
  },
  boardCardGap: {
    marginBottom: layout.cardGap,
  },
  cardMenu: {
    width: layout.icon.lg,
    height: layout.icon.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** 卡片下方「切换状态」入口行（右对齐；位于卡片 Pressable 之外） */
  cardMenuRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.xs,
  },
  menuHint: {
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuDot: {
    width: spacing.xs,
    height: spacing.xs,
    borderRadius: radius.pill,
    marginRight: spacing.sm,
  },
  menuLabel: {
    color: colors.text.primary,
    flex: 1,
  },
  menuMeta: {
    color: colors.text.tertiary,
    marginRight: spacing.xs,
  },
})
