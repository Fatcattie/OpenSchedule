/**
 * 职责：可右滑行容器 —— 右滑露出快捷操作层（PanResponder 实现，零原生依赖）。
 * 操作层位于内容层下方左侧，内容层随位移右移露出；与纵向滚动通过位移比例判定隔离（R3）。
 */
import type { ReactNode } from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSwipeAction, type SwipeAction } from '@/hooks/useSwipeAction'
import { useThemedStyles } from '@/store/ThemeProvider'
import { radius, spacing, typography, type ThemeColors } from '@/theme'

export type { SwipeAction }

/** SwipeableRow 入参 */
export interface SwipeableRowProps {
  actions: SwipeAction[]
  children: ReactNode
  onActionDone?: (key: string) => void
  /** 单个操作按钮宽度 */
  actionWidth?: number
  /** 禁用右滑 */
  disabled?: boolean
}

/** 默认操作按钮宽度 */
const DEFAULT_ACTION_WIDTH = 76

/** 语义色映射（强调色面积克制，仅操作按钮使用）—— 运行时工厂，随主题变化 */
const makeToneColor = (colors: ThemeColors): Record<SwipeAction['tone'], string> => ({
  primary: colors.primary,
  success: colors.success,
  danger: colors.danger,
  warning: colors.warning,
})

/** 右滑操作行容器 */
export function SwipeableRow({
  actions,
  children,
  onActionDone,
  actionWidth = DEFAULT_ACTION_WIDTH,
  disabled = false,
}: SwipeableRowProps): React.JSX.Element {
  const styles = useThemedStyles(makeStyles)
  const toneColor = useThemedStyles(makeToneColor)
  const { translateX, open, panHandlers, runAction } = useSwipeAction({
    actions,
    actionWidth,
    onActionDone,
    disabled,
  })

  return (
    <View style={styles.container}>
      {/* 操作层：位于内容层下方，仅滑开时可点击 */}
      <View style={styles.actionsLayer} pointerEvents={open ? 'auto' : 'none'}>
        {actions.map((action) => (
          <Pressable
            key={action.key}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={() => runAction(action)}
            style={[
              styles.actionButton,
              { width: actionWidth, backgroundColor: toneColor[action.tone] },
            ]}
          >
            <Text style={[typography.label, styles.actionLabel]} numberOfLines={2}>
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* 内容层：随位移右移 */}
      <Animated.View
        style={[styles.contentLayer, { transform: [{ translateX }] }]}
        {...panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  )
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      position: 'relative',
      borderRadius: radius.card,
      overflow: 'hidden',
    },
    actionsLayer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      alignItems: 'stretch',
      justifyContent: 'flex-start',
    },
    actionButton: {
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xs,
    },
    actionLabel: {
      color: colors.text.inverse,
      textAlign: 'center',
    },
    contentLayer: {
      backgroundColor: colors.bg.base,
    },
  })
