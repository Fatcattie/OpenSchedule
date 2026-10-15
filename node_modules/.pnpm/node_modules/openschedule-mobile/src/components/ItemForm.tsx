/**
 * 职责：提报页 / 创建页共用的表单骨架 —— 类型切换 + 字段区 + 底部固定主按钮。
 * 按角色 / 场景分叉按钮文案与顶部提示；切换类型时清空另一分支专属字段并用
 * runLayoutAnimation 重排。**不含 ScreenHeader**（由页面自行提供）。（PRD §7.1 / M2-P0-03/04）
 */
import { useState } from 'react'
import { Feather } from '@expo/vector-icons'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button } from './Button'
import { SegmentedControl } from './SegmentedControl'
import { TextField } from './TextField'
import { PressableScale } from './PressableScale'
import { PickerSheet, type PickerOption } from './PickerSheet'
import { DateTimeField } from './DateTimeField'
import { runLayoutAnimation } from './FadeIn'
import type { TranslationKey } from '@/i18n'
import { useT } from '@/store/I18nProvider'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { layout, radius, spacing, typography, type ThemeColors } from '@/theme'
import type { AppRole, SubmissionKind, TaskPriority } from '@/types'

/** 表单值（页面在提交时解析 estimatedHours） */
export interface ItemFormValue {
  kind: SubmissionKind
  title: string
  description: string
  priority: TaskPriority
  /** kind==='task' 时的目标项目 id */
  projectId: string | null
  /** kind==='project' 时的负责人 id */
  ownerId: string | null
  dueAt: string | null
  /** 预估工时，保持字符串（数字键盘），由页面在提交时解析 */
  estimatedHours: string
  note: string
}

/** ItemForm 入参 */
export interface ItemFormProps {
  mode: 'submission' | 'create'
  role: AppRole
  value: ItemFormValue
  onChange: (next: ItemFormValue) => void
  onSubmit: () => void
  submitting?: boolean
  /** 字段级错误，key 为 ItemFormValue 的字段名 */
  errors?: Partial<Record<keyof ItemFormValue, string>>
  /** 顶部轻提示（如「将直接创建，无需审核」） */
  banner?: string | null
  /** 可选项目（kind==='task' 用） */
  projects: PickerOption<string>[]
  /** 可选负责人（kind==='project' 用） */
  members: PickerOption<string>[]
  /** 允许的类型；默认 ['project','task'] */
  allowedKinds?: SubmissionKind[]
}

/** 优先级全量 4 项顺序（低 / 中 / 高 / 紧急），文案取自领域字典 `priority.*` */
const PRIORITY_ORDER: TaskPriority[] = ['low', 'medium', 'high', 'urgent']

/** 优先级 → 领域字典键（`domain.ts` 同源派生，与 `theme.priorityLabel` 逐字一致） */
const PRIORITY_KEY: Record<TaskPriority, TranslationKey> = {
  low: 'priority.low',
  medium: 'priority.medium',
  high: 'priority.high',
  urgent: 'priority.urgent',
}

/** 类型分段顺序（项目 / 任务） */
const KIND_ORDER: SubmissionKind[] = ['project', 'task']

/** 类型 → 业务字典键 */
const KIND_KEY: Record<SubmissionKind, TranslationKey> = {
  project: 'business.itemForm.kind.project',
  task: 'business.itemForm.kind.task',
}

/** 内部选择字段（外观对齐 TextField：浮动标签 + 描边 + 错误红字 + 右侧箭头） */
interface SelectFieldProps {
  label: string
  value: string | null
  placeholder: string
  onPress: () => void
  disabled?: boolean
  error?: string
}

function SelectField({
  label,
  value,
  placeholder,
  onPress,
  disabled = false,
  error,
}: SelectFieldProps): React.JSX.Element {
  const { colors } = useTheme()
  const styles = useThemedStyles(makeStyles)
  const borderColor = error ? colors.danger : disabled ? colors.border : colors.borderStrong
  const labelColor = error ? colors.danger : colors.text.secondary
  const valueColor = disabled
    ? colors.text.tertiary
    : value
      ? colors.text.primary
      : colors.text.tertiary

  return (
    <View style={styles.fieldWrapper}>
      <PressableScale
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityLabel={label}
        onPress={onPress}
        disabled={disabled}
        scale={1}
        pressedBg={colors.bg.subtle}
        style={[styles.selectField, { borderColor }]}
      >
        <View style={styles.selectBody}>
          <Text style={[typography.label, styles.selectLabel, { color: labelColor }]} numberOfLines={1}>
            {label}
          </Text>
          <Text style={[typography.body, styles.selectValue, { color: valueColor }]} numberOfLines={1}>
            {value ?? placeholder}
          </Text>
        </View>
        <Feather name="chevron-down" size={layout.icon.md} color={colors.text.tertiary} />
      </PressableScale>
      {error ? (
        <Text style={[typography.caption, styles.errorText]} numberOfLines={2}>
          {error}
        </Text>
      ) : null}
    </View>
  )
}

/** 提报 / 创建共用表单骨架 */
export function ItemForm({
  mode,
  role,
  value,
  onChange,
  onSubmit,
  submitting = false,
  errors = {},
  banner,
  projects,
  members,
  allowedKinds = ['project', 'task'],
}: ItemFormProps): React.JSX.Element {
  const styles = useThemedStyles(makeStyles)
  const insets = useSafeAreaInsets()
  const t = useT()
  const [openPicker, setOpenPicker] = useState<'priority' | 'project' | 'owner' | null>(null)
  const locked = submitting

  const priorityOptions: PickerOption<TaskPriority>[] = PRIORITY_ORDER.map((item) => ({
    value: item,
    label: t(PRIORITY_KEY[item]),
  }))
  const kindOptions = KIND_ORDER.filter((option) => allowedKinds.includes(option)).map((item) => ({
    value: item,
    label: t(KIND_KEY[item]),
  }))
  const showKindControl = allowedKinds.length > 1

  // 调用方显式传 banner（含 null）时以其为准；未传时提报页 manager 分支给默认提示
  const resolvedBanner =
    banner !== undefined
      ? banner
      : mode === 'submission' && role === 'manager'
        ? t('business.itemForm.banner.manager')
        : null

  const submitLabel =
    mode === 'create'
      ? t('business.itemForm.submit.create')
      : role === 'manager'
        ? t('business.itemForm.submit.directCreate')
        : t('business.itemForm.submit.submit')

  const priorityText = priorityOptions.find((option) => option.value === value.priority)?.label ?? null
  const projectText = value.projectId
    ? projects.find((option) => option.value === value.projectId)?.label ?? null
    : null
  const ownerText = value.ownerId
    ? members.find((option) => option.value === value.ownerId)?.label ?? null
    : null

  const patch = (partial: Partial<ItemFormValue>): void => {
    onChange({ ...value, ...partial })
  }

  const handleKindChange = (kind: SubmissionKind): void => {
    // 切换类型时重排表单区，并清空另一分支的专属字段（其余字段保留）
    runLayoutAnimation()
    onChange({
      ...value,
      kind,
      ownerId: kind === 'task' ? null : value.ownerId,
      projectId: kind === 'project' ? null : value.projectId,
    })
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {resolvedBanner ? (
          <View style={styles.banner}>
            <Text style={[typography.caption, styles.bannerText]}>{resolvedBanner}</Text>
          </View>
        ) : null}

        {showKindControl ? (
          <View style={styles.fieldWrapper}>
            <SegmentedControl options={kindOptions} value={value.kind} onChange={handleKindChange} />
          </View>
        ) : null}

        <View style={styles.fieldWrapper}>
          <TextField
            label={t('business.itemForm.field.title')}
            value={value.title}
            onChangeText={(next) => patch({ title: next })}
            error={errors.title}
            editable={!locked}
          />
        </View>

        <View style={styles.fieldWrapper}>
          <TextField
            label={t('business.itemForm.field.description')}
            value={value.description}
            onChangeText={(next) => patch({ description: next })}
            error={errors.description}
            editable={!locked}
            multiline
          />
        </View>

        <SelectField
          label={t('business.itemForm.field.priority')}
          value={priorityText}
          placeholder={t('business.itemForm.field.priorityPlaceholder')}
          onPress={() => setOpenPicker('priority')}
          disabled={locked}
          error={errors.priority}
        />

        {value.kind === 'task' ? (
          <SelectField
            label={t('business.itemForm.field.project')}
            value={projectText}
            placeholder={t('business.itemForm.field.projectPlaceholder')}
            onPress={() => setOpenPicker('project')}
            disabled={locked}
            error={errors.projectId}
          />
        ) : (
          <SelectField
            label={t('business.itemForm.field.owner')}
            value={ownerText}
            placeholder={t('business.itemForm.field.ownerPlaceholder')}
            onPress={() => setOpenPicker('owner')}
            disabled={locked}
            error={errors.ownerId}
          />
        )}

        <View style={styles.fieldWrapper}>
          <DateTimeField
            label={t('business.itemForm.field.dueAt')}
            value={value.dueAt}
            onChange={(next) => patch({ dueAt: next })}
            error={errors.dueAt}
            disabled={locked}
          />
        </View>

        <View style={styles.fieldWrapper}>
          <TextField
            label={t('business.itemForm.field.estimatedHours')}
            value={value.estimatedHours}
            onChangeText={(next) => patch({ estimatedHours: next })}
            error={errors.estimatedHours}
            editable={!locked}
            keyboardType="numeric"
          />
        </View>

        <View style={styles.fieldWrapper}>
          <TextField
            label={t('business.itemForm.field.note')}
            value={value.note}
            onChangeText={(next) => patch({ note: next })}
            error={errors.note}
            editable={!locked}
            multiline
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          label={submitLabel}
          onPress={onSubmit}
          loading={submitting}
          disabled={submitting}
        />
      </View>

      <PickerSheet
        visible={openPicker === 'priority'}
        title={t('business.itemForm.field.priority')}
        options={priorityOptions}
        value={value.priority}
        onSelect={(next) => patch({ priority: next })}
        onClose={() => setOpenPicker(null)}
      />

      <PickerSheet
        visible={openPicker === 'project'}
        title={t('business.itemForm.field.project')}
        options={projects}
        value={value.projectId}
        onSelect={(next) => patch({ projectId: next })}
        onClose={() => setOpenPicker(null)}
      />

      <PickerSheet
        visible={openPicker === 'owner'}
        title={t('business.itemForm.field.owner')}
        options={members}
        value={value.ownerId}
        onSelect={(next) => patch({ ownerId: next })}
        onClose={() => setOpenPicker(null)}
      />
    </KeyboardAvoidingView>
  )
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bg.base,
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: layout.screenPadding,
      paddingTop: layout.sectionGap,
      paddingBottom: spacing.xxl,
    },
    banner: {
      backgroundColor: colors.primaryFaint,
      borderRadius: radius.control,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.md,
    },
    bannerText: {
      color: colors.primarySoft,
    },
    fieldWrapper: {
      marginBottom: spacing.md,
    },
    selectField: {
      backgroundColor: colors.bg.surface,
      borderRadius: radius.control,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      // 与 TextField 单行高度对齐（40 + 16 = 56）
      minHeight: spacing.xxxl + spacing.md,
      paddingHorizontal: spacing.sm + spacing.xxs,
    },
    selectBody: {
      flex: 1,
      justifyContent: 'center',
      marginRight: spacing.sm,
      paddingVertical: spacing.xs,
    },
    selectLabel: {
      color: colors.text.secondary,
    },
    selectValue: {
      marginTop: spacing.xxs,
    },
    errorText: {
      color: colors.danger,
      marginTop: spacing.xxs,
      marginLeft: spacing.xxs,
    },
    footer: {
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.sm,
      backgroundColor: colors.bg.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
  })
