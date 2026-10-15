/**
 * 职责：通用选择抽屉 —— 基于 BottomSheet 的选项列表（单选 + 勾选态）。
 * 统一承载优先级 / 类型 / 日期 / 时间 / 项目 / 负责人等选择场景（PRD §7.1 / M2-P0-02）。
 * 高度随选项数自适应、长列表可滚动；样式全部取自 token，无内联魔法数字。
 */
import { Feather } from '@expo/vector-icons'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { BottomSheet } from './BottomSheet'
import { PressableScale } from './PressableScale'
import { useT } from '@/store/I18nProvider'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { layout, radius, spacing, typography, type ThemeColors } from '@/theme'

/** 单个选项 */
export interface PickerOption<T extends string> {
  value: T
  label: string
  /** 可选补充说明（副标题） */
  description?: string
}

/** PickerSheet 入参 */
export interface PickerSheetProps<T extends string> {
  visible: boolean
  title?: string
  options: PickerOption<T>[]
  value: T | null
  onSelect: (value: T) => void
  onClose: () => void
  /** 是否显示「清除」行 */
  clearable?: boolean
  onClear?: () => void
}

/** 抽屉高度自适应参数：占屏比例（纯布局值，非样式像素），上限 / 下限与 BottomSheet 对齐 */
const RATIO_BASE = 0.24
const RATIO_PER_ROW = 0.055
const RATIO_MIN = 0.2
const RATIO_MAX = 0.92

/** 依据行数换算抽屉占屏比例，并夹在 [0.2, 0.92] */
function resolveHeightRatio(rowCount: number): number {
  const raw = RATIO_BASE + rowCount * RATIO_PER_ROW
  return Math.min(RATIO_MAX, Math.max(RATIO_MIN, raw))
}

/** 通用选择抽屉 */
export function PickerSheet<T extends string>({
  visible,
  title,
  options,
  value,
  onSelect,
  onClose,
  clearable = false,
  onClear,
}: PickerSheetProps<T>): React.JSX.Element {
  const { colors } = useTheme()
  const t = useT()
  const styles = useThemedStyles(makeStyles)
  const rowCount = options.length + (clearable ? 1 : 0)
  const heightRatio = resolveHeightRatio(rowCount)

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} heightRatio={heightRatio}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {options.map((option, index) => {
          const selected = option.value === value
          // 有「清除」行时，最后一个选项仍需分隔线（与清除行隔开）
          const lastRow = index === options.length - 1 && !clearable
          return (
            <PressableScale
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              onPress={() => {
                onSelect(option.value)
                onClose()
              }}
              scale={1}
              pressedBg={colors.bg.subtle}
              style={[
                styles.row,
                selected ? styles.rowSelected : null,
                lastRow ? null : styles.rowDivider,
              ]}
            >
              <View style={styles.rowBody}>
                <Text style={[typography.body, styles.label]} numberOfLines={1}>
                  {option.label}
                </Text>
                {option.description ? (
                  <Text style={[typography.caption, styles.description]} numberOfLines={2}>
                    {option.description}
                  </Text>
                ) : null}
              </View>
              {selected ? (
                <Feather name="check" size={layout.icon.md} color={colors.primary} />
              ) : null}
            </PressableScale>
          )
        })}
      </ScrollView>

      {clearable ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t('business.picker.clear')}
          onPress={() => {
            onClear?.()
            onClose()
          }}
          scale={1}
          pressedBg={colors.bg.subtle}
          style={[styles.row, styles.clearRow]}
        >
          <Text style={[typography.body, styles.clearLabel]}>{t('business.picker.clear')}</Text>
        </PressableScale>
      ) : null}
    </BottomSheet>
  )
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    scroll: {
      flex: 1,
    },
    list: {
      paddingBottom: spacing.xs,
    },
    row: {
      // 行高 ≥ spacing.xxl 以保证触摸区
      minHeight: spacing.xxl,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xs,
      borderRadius: radius.sm,
    },
    rowSelected: {
      backgroundColor: colors.primaryFaint,
    },
    rowDivider: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowBody: {
      flex: 1,
      marginRight: spacing.sm,
    },
    label: {
      color: colors.text.primary,
    },
    description: {
      color: colors.text.secondary,
      marginTop: spacing.xxs,
    },
    clearRow: {
      marginTop: spacing.xs,
      justifyContent: 'center',
    },
    clearLabel: {
      color: colors.danger,
      fontWeight: '600',
    },
  })
