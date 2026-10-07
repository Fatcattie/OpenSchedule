/**
 * 职责：④ 项目看板 - 列表 —— 筛选（进行中 / 已归档 / 全部）+ 项目卡片（进度 / 任务数 / 截止）
 * （ARCH §6.4 / PRD 6.4）。
 */
import { Feather } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Card,
  EmptyState,
  ErrorState,
  FadeIn,
  LoadingView,
  PressableScale,
  ProjectCard,
  SegmentedControl,
  StaleBadge,
  staggerDelay,
} from '@/components'
import { useAsync, useAuth } from '@/hooks'
import { PROJECT_FILTER_OPTIONS, projectService, type ProjectCardData, type ProjectFilter } from '@/services'
import { useT } from '@/store/I18nProvider'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { layout, radius, shadow, spacing, typography, type ThemeColors } from '@/theme'
import type { AppNavigationProp } from '@/types'
import { NETWORK_OFFLINE_MESSAGE, isNetworkError } from '@/types'
import { useCan } from '@/utils/permission'

/** 项目看板 - 列表页 */
export function ProjectListScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<AppNavigationProp>()
  const { user } = useAuth()
  const { colors } = useTheme()
  const styles = useThemedStyles(makeStyles)
  const t = useT()
  const can = useCan()
  // 统一权限姿势（ARCH §7）：具备创建项目 / 任务任一权限即可进入创建页
  const canCreate = can('project:create') || can('task:create')
  const timezone = user?.timezone ?? 'Asia/Shanghai'

  const [filter, setFilter] = useState<ProjectFilter>('active')
  const [refreshing, setRefreshing] = useState(false)

  const projects = useAsync<ProjectCardData[]>(() => projectService.listProjectCards(filter), [filter], {
    cache: { key: `projects:${filter}` },
  })

  const handleRefresh = async () => {
    setRefreshing(true)
    await projects.refetch()
    setRefreshing(false)
  }

  const list = projects.data ?? []

  // 列表底部留白（DEF-05）：有 FAB 时须完全避开 FAB，无 FAB 时保持原值（避免 member 侧过大空白）。
  // 推导：FAB 占位 = 高 (spacing.xxxl + spacing.md = 56) + 底部间距 (spacing.lg = 20) = 76；
  //       再叠加底部安全区 insets.bottom 与可见余量 spacing.xl(24) → insets.bottom + spacing.xxxl * 2 + spacing.xl。
  const listPaddingBottom = canCreate ? insets.bottom + spacing.xxxl * 2 + spacing.xl : spacing.xxxl

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + layout.screenTop, paddingBottom: listPaddingBottom },
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
          <Text style={[typography.display, styles.title]}>{t('screens.core.projectList.title')}</Text>
          <Text style={[typography.caption, styles.subtitle]}>
            {t('screens.core.projectList.subtitle', { count: list.length })}
          </Text>
        </FadeIn>

        <FadeIn delay={staggerDelay(1)} style={styles.segmentedWrapper}>
          <SegmentedControl options={PROJECT_FILTER_OPTIONS} value={filter} onChange={setFilter} />
        </FadeIn>

        <View style={styles.list}>
          {projects.isStale && projects.updatedAt !== null && !projects.error ? (
            <StaleBadge updatedAt={projects.updatedAt} />
          ) : null}
          {projects.loading ? (
            <LoadingView variant="skeleton" skeletonCount={3} />
          ) : projects.error ? (
            <ErrorState
              message={isNetworkError(projects.error) ? NETWORK_OFFLINE_MESSAGE : undefined}
              onRetry={() => void projects.retry()}
            />
          ) : list.length === 0 ? (
            <Card>
              <EmptyState
                icon="folder"
                title={
                  filter === 'archived'
                    ? t('screens.core.projectList.emptyArchivedTitle')
                    : t('screens.core.projectList.emptyActiveTitle')
                }
                description={
                  filter === 'archived'
                    ? t('screens.core.projectList.emptyArchivedDesc')
                    : canCreate
                      ? t('screens.core.projectList.emptyCreateDesc')
                      : t('screens.core.projectList.emptyWebDesc')
                }
              />
            </Card>
          ) : (
            list.map((item, index) => (
              <FadeIn key={item.project.id} delay={staggerDelay(index)} style={styles.cardGap}>
                <ProjectCard
                  project={item.project}
                  progress={item.progress}
                  taskCount={item.taskCount}
                  owner={item.owner}
                  timezone={timezone}
                  onPress={() => navigation.navigate('Board', { projectId: item.project.id })}
                />
              </FadeIn>
            ))
          )}
        </View>
      </ScrollView>

      {/* 创建入口 FAB（PRD §7.1「项目列表 FAB」）：无 project:create / task:create 权限时隐藏（隐藏而非置灰） */}
      {canCreate ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t('screens.core.projectList.createA11y')}
          onPress={() => navigation.navigate('CreateItem')}
          scale={0.94}
          style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}
        >
          <Feather name="plus" size={layout.icon.lg} color={colors.text.inverse} />
        </PressableScale>
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
  list: {
    marginTop: layout.sectionGap,
  },
  cardGap: {
    marginBottom: layout.cardGap,
  },
  // ── 创建入口 FAB（样式手法对齐 PersonalPlanScreen，全部取自 @/theme token） ──
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
})
