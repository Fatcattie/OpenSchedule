/**
 * 职责：提报事项页（Submission）—— 复用 ItemForm 表单骨架，
 * 按角色分叉标题与提交语义：manager 免审直接创建 / member 提报待审
 * （PRD §7.1 / §8.3 / M2-P0-03）。权限由 useCan('submission:create') 统一把关，
 * 无权限时不渲染表单。轻提示 Toast 复用今日聚焦的「state + 定时器 + 提示条」手法。
 *
 * 增量 M2-P2-02：表单草稿本地保存 —— 挂载时从 AsyncStorage 恢复未提交草稿，
 * 编辑时防抖写盘，提交成功后清除，另提供「清除草稿」手动入口。所有存储调用
 * try/catch 静默降级，存储不可用不得阻断提报主流程（对齐 AppProvider / useTimer）。
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Feather } from '@expo/vector-icons'
import { useNavigation, useRoute } from '@react-navigation/native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  BottomSheet,
  Button,
  ErrorState,
  ItemForm,
  PressableScale,
  ScreenHeader,
  type ItemFormValue,
  type PickerOption,
} from '@/components'
import { useAsync, useAuth } from '@/hooks'
import { DRAFT_KEYS, projectService, taskService, type SubmitItemInput } from '@/services'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { layout, radius, shadow, spacing, typography, type ThemeColors } from '@/theme'
import type { AppNavigationProp, AppRouteProp, SubmissionKind } from '@/types'
import { getErrorMessage } from '@/types'
import { userMap as buildUserMap } from '@/data'
import {
  createEmptyFormValue,
  isDraftMeaningful,
  parseDraft,
  serializeDraft,
} from '@/utils/draft'
import { goBackOrHome } from '@/utils/navigation'
import { useCan } from '@/utils/permission'
import { validateSubmissionTitle } from '@/utils/submission'

/** 顶部轻提示相对安全区顶部的纵向偏移（页头高度 + 间距） */
const TOAST_TOP_OFFSET = layout.icon.lg + spacing.md + spacing.md + spacing.sm
/** 轻提示自动消失时长（毫秒，与今日聚焦一致） */
const TOAST_DURATION = 2200
/** 草稿写盘防抖时长（毫秒，M2-P2-02） */
const DRAFT_SAVE_DEBOUNCE = 600

/** 由表单字符串解析预估工时：空串 / 非数字 → null */
function parseEstimatedHours(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  const parsed = Number(trimmed)
  return Number.isNaN(parsed) ? null : parsed
}

/** 提报事项页 */
export function SubmissionScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<AppNavigationProp>()
  const route = useRoute<AppRouteProp<'Submission'>>()
  const { user, role } = useAuth()
  const { colors } = useTheme()
  const styles = useThemedStyles(makeStyles)
  const can = useCan()
  const userId = user?.id ?? ''
  const canSubmit = can('submission:create')

  /** 路由显式指定的类型（作为草稿恢复时的权威 kind） */
  const routeKind = route.params?.kind
  const routeKindRef = useRef<SubmissionKind | undefined>(routeKind)

  const [value, setValue] = useState<ItemFormValue>(() =>
    createEmptyFormValue(route.params?.kind ?? 'task'),
  )
  const [errors, setErrors] = useState<Partial<Record<keyof ItemFormValue, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  /** 草稿恢复完成标记：完成前不得触发保存（避免用初始空值覆盖草稿） */
  const [hydrated, setHydrated] = useState(false)
  /** 是否从草稿恢复（用于顶部提示） */
  const [restoredFromDraft, setRestoredFromDraft] = useState(false)
  /** 「清除草稿」二次确认抽屉 */
  const [confirmClear, setConfirmClear] = useState(false)
  /** 轻提示定时器（卸载时清理，避免卸载后 setState） */
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 草稿写盘防抖定时器（卸载时清理） */
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  /** 展示中文轻提示（自动消失） */
  const showToast = useCallback((text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(text)
    toastTimer.current = setTimeout(() => setToast(null), TOAST_DURATION)
  }, [])

  /** 写入草稿（失败静默降级） */
  const persistDraft = useCallback(async (next: ItemFormValue): Promise<void> => {
    try {
      await AsyncStorage.setItem(DRAFT_KEYS.submission, serializeDraft(next, new Date().toISOString()))
    } catch {
      // 忽略：草稿写入失败不阻断提报主流程
    }
  }, [])

  /** 删除草稿（失败静默降级） */
  const removeDraft = useCallback(async (): Promise<void> => {
    try {
      await AsyncStorage.removeItem(DRAFT_KEYS.submission)
    } catch {
      // 忽略：草稿删除失败不阻断提报主流程
    }
  }, [])

  // ── 挂载恢复：读取本地草稿并回填（有内容才恢复）─────────────────
  useEffect(() => {
    let cancelled = false
    const restore = async () => {
      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEYS.submission)
        if (cancelled) return
        const draft = parseDraft(raw)
        if (draft && isDraftMeaningful(draft)) {
          // 路由显式带 kind 时以路由参数为准，其余字段照常恢复
          const kind = routeKindRef.current
          setValue(kind ? { ...draft, kind } : draft)
          setRestoredFromDraft(true)
        }
      } catch {
        // 忽略：草稿读取失败按无草稿处理
      } finally {
        if (!cancelled) setHydrated(true)
      }
    }
    void restore()
    return () => {
      cancelled = true
    }
  }, [])

  // ── 编辑防抖保存：仅在恢复完成且有内容时写盘 ─────────────────────
  useEffect(() => {
    if (!hydrated || !isDraftMeaningful(value)) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void persistDraft(value)
    }, DRAFT_SAVE_DEBOUNCE)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [hydrated, persistDraft, value])

  // 选项数据：项目卡片（取数失败静默降级为空列表，不阻塞表单）
  const projects = useAsync(() => projectService.listProjectCards('active'), [], {
    cache: { key: 'projects:active' },
  })

  useEffect(() => {
    if (projects.error) showToast('项目列表加载失败，可稍后重试')
  }, [projects.error, showToast])

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

  /** 校验 + 组装 + 提交 */
  const handleSubmit = useCallback(async () => {
    const nextErrors: Partial<Record<keyof ItemFormValue, string>> = {}
    const titleError = validateSubmissionTitle(value.title)
    if (titleError) nextErrors.title = titleError
    if (value.kind === 'task' && !value.projectId) nextErrors.projectId = '请选择目标项目'
    if (value.kind === 'project' && !value.ownerId) nextErrors.ownerId = '请选择负责人'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const input: SubmitItemInput = {
      kind: value.kind,
      title: value.title,
      description: value.description,
      priority: value.priority,
      projectId: value.kind === 'task' ? value.projectId : null,
      dueAt: value.dueAt,
      estimatedHours: parseEstimatedHours(value.estimatedHours),
      ownerId: value.kind === 'project' ? value.ownerId : null,
      note: value.note,
    }

    setSubmitting(true)
    try {
      await taskService.submitItem(input, userId, role)
      // 提交成功：清除本地草稿后再返回
      await removeDraft()
      showToast(role === 'manager' ? '已直接创建' : '已提交，等待审核')
      navigation.goBack()
    } catch (error) {
      // 失败不清空已填内容，仅顶部轻提示错误文案
      showToast(getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }, [navigation, removeDraft, role, showToast, userId, value])

  /** 手动清除草稿：清空表单 + 删除本地草稿 + 轻提示 */
  const handleClearDraft = useCallback(() => {
    setConfirmClear(false)
    setValue(createEmptyFormValue(value.kind))
    setErrors({})
    setRestoredFromDraft(false)
    void removeDraft()
    showToast('草稿已清除')
  }, [removeDraft, showToast, value.kind])

  const hasDraftContent = isDraftMeaningful(value)

  // 权限门禁：无权限时不渲染表单
  if (!canSubmit) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="提报事项" onBack={() => goBackOrHome(navigation)} />
        <View style={styles.gate}>
          <ErrorState message="无权限：当前角色不能提报事项" onRetry={() => navigation.goBack()} />
        </View>
      </View>
    )
  }

  const headerTitle = role === 'manager' ? '新建事项' : '提报事项'

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={headerTitle}
        onBack={() => goBackOrHome(navigation)}
        right={
          hasDraftContent ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="清除草稿"
              onPress={() => setConfirmClear(true)}
              hitSlop={spacing.xs}
              scale={0.94}
              pressedBg={colors.bg.subtle}
              style={styles.clearButton}
            >
              <Feather name="trash-2" size={layout.icon.sm} color={colors.text.secondary} />
              <Text style={[typography.caption, styles.clearText]}>清除草稿</Text>
            </PressableScale>
          ) : undefined
        }
      />

      <ItemForm
        mode="submission"
        role={role}
        value={value}
        onChange={setValue}
        onSubmit={() => void handleSubmit()}
        submitting={submitting}
        errors={errors}
        banner={restoredFromDraft ? '已恢复上次未提交的草稿' : undefined}
        projects={projectOptions}
        members={memberOptions}
      />

      {/* 顶部轻提示 */}
      {toast ? (
        <View style={[styles.toast, { top: insets.top + TOAST_TOP_OFFSET }]} pointerEvents="none">
          <Text style={[typography.caption, styles.toastText]}>{toast}</Text>
        </View>
      ) : null}

      {/* 清除草稿二次确认 */}
      <BottomSheet
        visible={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="清除草稿"
        heightRatio={0.28}
      >
        <Text style={[typography.body, styles.confirmText]}>
          将清空当前填写内容并删除本地草稿，确定继续？
        </Text>
        <View style={styles.confirmActions}>
          <View style={styles.confirmCancel}>
            <Button variant="secondary" label="取消" onPress={() => setConfirmClear(false)} />
          </View>
          <Button variant="danger" label="清除" onPress={handleClearDraft} />
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
  gate: {
    flex: 1,
    justifyContent: 'center',
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radius.sm,
    marginRight: -spacing.xs,
  },
  clearText: {
    color: colors.text.secondary,
    marginLeft: spacing.xxs,
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
  confirmText: {
    color: colors.text.secondary,
    marginBottom: spacing.lg,
  },
  confirmActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  confirmCancel: {
    marginRight: spacing.sm,
  },
})
