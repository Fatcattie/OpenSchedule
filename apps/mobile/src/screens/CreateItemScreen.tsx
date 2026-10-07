/**
 * 职责：创建事项页（CreateItem）—— manager 直接创建项目 / 任务，
 * 复用 ItemForm 表单骨架；按权限推导 allowedKinds（仅一项时自动隐藏类型切换）。
 * 提交按 kind 分叉到 projectService.createProject / taskService.createTask
 * （PRD §7.1 / §8.3 / M2-P0-04）。轻提示 Toast 复用今日聚焦手法。
 */
import { useNavigation, useRoute } from '@react-navigation/native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, Switch, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ErrorState,
  ItemForm,
  ScreenHeader,
  type ItemFormValue,
  type PickerOption,
} from '@/components'
import { useAsync, useAuth } from '@/hooks'
import { projectService, taskService } from '@/services'
import { useT } from '@/store/I18nProvider'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { layout, radius, shadow, spacing, typography, type ThemeColors } from '@/theme'
import type { AppNavigationProp, AppRouteProp, SubmissionKind } from '@/types'
import { getErrorMessage } from '@/types'
import { userMap as buildUserMap } from '@/data'
import { goBackOrHome } from '@/utils/navigation'
import { useCan } from '@/utils/permission'
import { validateSubmissionTitle } from '@/utils/submission'

/** 顶部轻提示相对安全区顶部的纵向偏移（页头高度 + 间距） */
const TOAST_TOP_OFFSET = layout.icon.lg + spacing.md + spacing.md + spacing.sm
/** 轻提示自动消失时长（毫秒，与今日聚焦一致） */
const TOAST_DURATION = 2200

/** 构造表单初值（kind 由调用方推导，projectId 取路由参数） */
function createInitialValue(kind: SubmissionKind, projectId: string | null): ItemFormValue {
  return {
    kind,
    title: '',
    description: '',
    priority: 'medium',
    projectId,
    ownerId: null,
    dueAt: null,
    estimatedHours: '',
    note: '',
  }
}

/** 由表单字符串解析预估工时：空串 / 非数字 → null */
function parseEstimatedHours(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  const parsed = Number(trimmed)
  return Number.isNaN(parsed) ? null : parsed
}

/** 创建事项页 */
export function CreateItemScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<AppNavigationProp>()
  const route = useRoute<AppRouteProp<'CreateItem'>>()
  const { user } = useAuth()
  const { colors } = useTheme()
  const t = useT()
  const styles = useThemedStyles(makeStyles)
  const can = useCan()
  const userId = user?.id ?? ''

  const canProject = can('project:create')
  const canTask = can('task:create')

  // 允许的类型：仅保留有权限的项（单项时 ItemForm 自动隐藏切换控件）
  const allowedKinds = useMemo<SubmissionKind[]>(() => {
    const candidates: (SubmissionKind | false)[] = [canProject && 'project', canTask && 'task']
    return candidates.filter((kind): kind is SubmissionKind => Boolean(kind))
  }, [canProject, canTask])

  // 初值 kind：路由参数合法则用之，否则取第一个允许项
  const routeKind = route.params?.kind
  const initialKind: SubmissionKind =
    routeKind && allowedKinds.includes(routeKind) ? routeKind : allowedKinds[0] ?? 'task'

  const [value, setValue] = useState<ItemFormValue>(() =>
    createInitialValue(initialKind, route.params?.projectId ?? null),
  )
  const [errors, setErrors] = useState<Partial<Record<keyof ItemFormValue, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  /** 增量 7（M1）：是否需要评审（本地状态，**不**并入 ItemFormValue，避免波及 ItemForm / draft） */
  const [reviewRequired, setReviewRequired] = useState(false)
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

  // 选项数据：项目卡片（取数失败静默降级为空列表，不阻塞表单）
  const projects = useAsync(() => projectService.listProjectCards('active'), [])

  useEffect(() => {
    if (projects.error) showToast(t('screen.submission.toast.projectLoadFailed'))
  }, [projects.error, showToast, t])

  const projectOptions: PickerOption<string>[] = useMemo(
    () =>
      (projects.data ?? []).map((card) => ({ value: card.project.id, label: card.project.name })),
    [projects.data],
  )

  const memberOptions: PickerOption<string>[] = useMemo(
    () =>
      Array.from(buildUserMap().values()).map((member) => ({
        value: member.id,
        label: member.displayName,
      })),
    [],
  )

  /** 校验 + 按 kind 分叉创建 */
  const handleSubmit = useCallback(async () => {
    const nextErrors: Partial<Record<keyof ItemFormValue, string>> = {}
    const titleError = validateSubmissionTitle(value.title)
    if (titleError) nextErrors.title = titleError
    if (value.kind === 'task' && !value.projectId) nextErrors.projectId = t('screen.createItem.error.projectRequired')
    if (value.kind === 'project' && !value.ownerId) nextErrors.ownerId = t('screen.createItem.error.ownerRequired')
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    try {
      if (value.kind === 'project') {
        await projectService.createProject(
          {
            name: value.title,
            description: value.description,
            ownerId: value.ownerId,
            deadline: value.dueAt,
          },
          userId,
        )
      } else {
        await taskService.createTask(
          {
            projectId: value.projectId,
            title: value.title,
            description: value.description,
            priority: value.priority,
            assigneeId: value.ownerId,
            dueAt: value.dueAt,
            estimatedHours: parseEstimatedHours(value.estimatedHours),
            // 增量 7（M1）：透传「是否需要评审」，是 reviewRequired 在 UI 上的唯一入口
            reviewRequired,
          },
          userId,
        )
      }
      showToast(t('screen.createItem.toast.created'))
      navigation.goBack()
    } catch (error) {
      // 失败不清空已填内容，仅顶部轻提示错误文案
      showToast(getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }, [navigation, reviewRequired, showToast, t, userId, value])

  // 权限门禁：项目 / 任务创建均无权限时不渲染表单
  if (!canProject && !canTask) {
    return (
      <View style={styles.root}>
        <ScreenHeader title={t('screen.createItem.title')} onBack={() => goBackOrHome(navigation)} />
        <View style={styles.gate}>
          <ErrorState message={t('screen.createItem.gate')} onRetry={() => navigation.goBack()} />
        </View>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title={t('screen.createItem.title')} onBack={() => goBackOrHome(navigation)} />

      {/* 增量 7（M1）：需要评审开关 —— 仅 manager 且 kind === 'task' 时渲染 */}
      {canTask && value.kind === 'task' ? (
        <View style={styles.reviewRow}>
          <View style={styles.reviewText}>
            <Text style={[typography.body, styles.reviewLabel]}>{t('screen.createItem.reviewRequired')}</Text>
            <Text style={[typography.caption, styles.reviewHint]}>
              {t('screen.createItem.reviewHint')}
            </Text>
          </View>
          <Switch
            value={reviewRequired}
            onValueChange={setReviewRequired}
            disabled={submitting}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.bg.surface}
          />
        </View>
      ) : null}

      <ItemForm
        mode="create"
        role="manager"
        value={value}
        onChange={setValue}
        onSubmit={() => void handleSubmit()}
        submitting={submitting}
        errors={errors}
        projects={projectOptions}
        members={memberOptions}
        allowedKinds={allowedKinds}
      />

      {/* 顶部轻提示 */}
      {toast ? (
        <View style={[styles.toast, { top: insets.top + TOAST_TOP_OFFSET }]} pointerEvents="none">
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
  gate: {
    flex: 1,
    justifyContent: 'center',
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
  },
  reviewText: {
    flex: 1,
    marginRight: spacing.sm,
  },
  reviewLabel: {
    color: colors.text.primary,
  },
  reviewHint: {
    color: colors.text.secondary,
    marginTop: spacing.xxs,
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
