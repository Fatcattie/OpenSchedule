/**
 * 职责：日期 / 时间选择字段 —— 点击后经 PickerSheet 两步选择（先日期、后时间），
 * 用 minutesToIso 合成 ISO8601 回调；外观对齐 TextField（浮动标签 + 描边 + 错误红字）。
 * 日期选项 = 未来 14 天（含今天）；时间选项 = 08:00–20:00 每 30 分钟（由 schedule 常量循环生成）。
 * （PRD §7.1 / M2-P0-02）
 */
import { useMemo, useState } from 'react'
import { Feather } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'
import { PickerSheet, type PickerOption } from './PickerSheet'
import { PressableScale } from './PressableScale'
import {
  addDays,
  daysUntil,
  formatDate,
  formatTime,
  formatWeekday,
  minutesFromMidnight,
  startOfDay,
  toDateKey,
} from '@/utils/date'
import {
  AXIS_END_MIN,
  AXIS_START_MIN,
  MINUTES_PER_HOUR,
  SLOT_MINUTES,
  minutesToIso,
} from '@/utils/schedule'
import { useT } from '@/store/I18nProvider'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { layout, radius, spacing, typography, type ThemeColors } from '@/theme'

/** DateTimeField 入参 */
export interface DateTimeFieldProps {
  label: string
  /** ISO8601 字符串；未选为 null */
  value: string | null
  onChange: (next: string | null) => void
  placeholder?: string
  disabled?: boolean
  error?: string
  /** 把分钟偏移换算成目标时区 ISO 用；默认系统时区 */
  timezone?: string | null
  /** 是否允许清除。默认 true */
  clearable?: boolean
}

/** 日期快捷列表天数：未来 14 天（含今天） */
const DAY_OPTION_COUNT = 14

/** 两位补零 */
function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** 分钟偏移 → 「HH:mm」 */
function formatMinutesLabel(minutes: number): string {
  const hour = Math.floor(minutes / MINUTES_PER_HOUR)
  const minute = minutes % MINUTES_PER_HOUR
  return `${pad2(hour)}:${pad2(minute)}`
}

/**
 * 时间选项：由 schedule 常量循环生成（禁止硬编码 24 项数组）。
 * 08:00–20:00，步长 SLOT_MINUTES，含两端点。
 */
const TIME_OPTIONS: PickerOption<string>[] = (() => {
  const options: PickerOption<string>[] = []
  for (let minutes = AXIS_START_MIN; minutes <= AXIS_END_MIN; minutes += SLOT_MINUTES) {
    options.push({ value: String(minutes), label: formatMinutesLabel(minutes) })
  }
  return options
})()

/** 日期 / 时间选择字段 */
export function DateTimeField({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
  error,
  timezone = null,
  clearable = true,
}: DateTimeFieldProps): React.JSX.Element {
  const { colors } = useTheme()
  const t = useT()
  const styles = useThemedStyles(makeStyles)
  /** 当前打开的抽屉步骤：null=关闭 */
  const [step, setStep] = useState<'date' | 'time' | null>(null)
  /** 第一步选中的日期键（待第二步选时间） */
  const [pendingKey, setPendingKey] = useState<string | null>(null)

  // 未来 14 天（含今天），按目标时区取当日 00:00 的 UTC 时刻
  const dayDates = useMemo<Date[]>(() => {
    const base = startOfDay(new Date(), timezone)
    return Array.from({ length: DAY_OPTION_COUNT }, (_, index) => addDays(base, index))
  }, [timezone])

  const dayOptions = useMemo<PickerOption<string>[]>(
    () =>
      dayDates.map((date) => {
        const offset = daysUntil(date, timezone)
        const prefix =
          offset === 0
            ? t('business.dateTimeField.today')
            : offset === 1
              ? t('business.dateTimeField.tomorrow')
              : ''
        return {
          value: toDateKey(date, timezone),
          label: `${prefix}${formatDate(date, timezone)} ${formatWeekday(date, timezone)}`,
        }
      }),
    [dayDates, timezone, t],
  )

  // 当前日期键：优先第一步选择，其次由已选值反推
  const currentKey = pendingKey ?? (value ? toDateKey(value, timezone) : null)
  const currentDay = currentKey
    ? dayDates.find((date) => toDateKey(date, timezone) === currentKey) ?? null
    : null
  const currentMinutes = value ? minutesFromMidnight(value, timezone) : null

  const display = value
    ? `${formatDate(value, timezone)} ${formatWeekday(value, timezone)} ${formatTime(value, timezone)}`
    : null

  const borderColor = error ? colors.danger : disabled ? colors.border : colors.borderStrong
  const labelColor = error ? colors.danger : colors.text.secondary
  const valueColor = disabled ? colors.text.tertiary : value ? colors.text.primary : colors.text.tertiary

  const openPicker = (): void => {
    if (disabled) return
    setPendingKey(null)
    setStep('date')
  }

  const closePicker = (): void => {
    setStep(null)
    setPendingKey(null)
  }

  const handleSelectDate = (key: string): void => {
    setPendingKey(key)
    setStep('time')
  }

  const handleSelectTime = (minutes: string): void => {
    if (currentDay) {
      onChange(minutesToIso(currentDay, Number(minutes), timezone))
    }
    setStep(null)
    setPendingKey(null)
  }

  return (
    <View style={styles.wrapper}>
      <PressableScale
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityLabel={label}
        onPress={openPicker}
        disabled={disabled}
        scale={1}
        pressedBg={colors.bg.subtle}
        style={[styles.field, { borderColor }]}
      >
        <View style={styles.fieldBody}>
          <Text style={[typography.label, styles.label, { color: labelColor }]} numberOfLines={1}>
            {label}
          </Text>
          <Text style={[typography.body, styles.value, { color: valueColor }]} numberOfLines={1}>
            {display ?? placeholder ?? t('business.dateTimeField.placeholder')}
          </Text>
        </View>
        {clearable && value && !disabled ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={t('business.dateTimeField.clear')}
            onPress={() => onChange(null)}
            hitSlop={{
              top: spacing.sm,
              bottom: spacing.sm,
              left: spacing.sm,
              right: spacing.sm,
            }}
            scale={0.92}
            style={styles.trailing}
          >
            <Feather name="x" size={layout.icon.md} color={colors.text.tertiary} />
          </PressableScale>
        ) : (
          <Feather name="calendar" size={layout.icon.md} color={colors.text.tertiary} />
        )}
      </PressableScale>

      {error ? (
        <Text style={[typography.caption, styles.error]} numberOfLines={2}>
          {error}
        </Text>
      ) : null}

      {/* 第一步：日期 */}
      <PickerSheet
        visible={step === 'date'}
        title={label}
        options={dayOptions}
        value={currentKey}
        onSelect={handleSelectDate}
        onClose={closePicker}
      />

      {/* 第二步：时间 */}
      <PickerSheet
        visible={step === 'time'}
        title={label}
        options={TIME_OPTIONS}
        value={currentMinutes != null ? String(currentMinutes) : null}
        onSelect={handleSelectTime}
        onClose={closePicker}
      />
    </View>
  )
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    wrapper: {
      width: '100%',
    },
    field: {
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
    fieldBody: {
      flex: 1,
      justifyContent: 'center',
      marginRight: spacing.sm,
      paddingVertical: spacing.xs,
    },
    label: {
      color: colors.text.secondary,
    },
    value: {
      marginTop: spacing.xxs,
    },
    trailing: {
      justifyContent: 'center',
    },
    error: {
      color: colors.danger,
      marginTop: spacing.xxs,
      marginLeft: spacing.xxs,
    },
  })
