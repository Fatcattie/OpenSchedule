/**
 * 职责：双层卡片容器 —— 白底 + 1px 描边 + 低阴影，圆角 20（ARCH §3.5 / §3.7-1）。
 * 可点击时按下「向上浮起 + 阴影增强」：外层 Animated.View 承载位移 / 缩放，
 * 绝对定位的浮动阴影层（shadow.cardLift）以透明度交叉淡入表现阴影变强。
 *
 * 增量 10（深色模式）：样式改为运行时工厂 `makeStyles(colors)`，把样式求值从模块加载期
 * 推迟到渲染期。工厂参数名必须为 `colors`，以保住 `increment-card-lift.test.tsx:132`
 * 的源码字面串断言 `backgroundColor: colors.bg.surface`（L3）。
 */
import type { ReactNode } from 'react'
import { Animated, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { useCardLift } from '@/hooks/useCardLift'
import { useThemedStyles } from '@/store/ThemeProvider'
import { layout, radius, shadow, type ThemeColors } from '@/theme'

/** Card 入参 */
export interface CardProps {
  children: ReactNode
  onPress?: () => void
  /** 是否带内边距（默认 true） */
  padded?: boolean
  style?: StyleProp<ViewStyle>
}

/** 双层卡片容器 */
export function Card({ children, onPress, padded = true, style }: CardProps): React.JSX.Element {
  const styles = useThemedStyles(makeStyles)
  // 仅在可点击时启用浮起；hook 必须无条件调用，故把 onPress 是否存在作为 enabled 传入。
  const lift = useCardLift(onPress !== undefined)
  const contentStyle = [styles.base, padded ? styles.padded : null, style]

  if (!onPress) {
    return <Animated.View style={contentStyle}>{children}</Animated.View>
  }

  return (
    <Animated.View style={lift.wrapStyle}>
      {/* 浮动阴影层：绝对定位、先声明 ⇒ 绘制在卡片本体之后；opacity 交叉淡入 */}
      <Animated.View pointerEvents="none" style={[styles.liftShadow, lift.shadowStyle]} />
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        onPressIn={lift.onPressIn}
        onPressOut={lift.onPressOut}
        onHoverIn={lift.onHoverIn}
        onHoverOut={lift.onHoverOut}
        style={contentStyle}
      >
        {children}
      </Pressable>
    </Animated.View>
  )
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    base: {
      backgroundColor: colors.bg.surface,
      borderRadius: radius.card,
      // 描边 + 低阴影双层，避免阴影发脏
      borderWidth: 1,
      borderColor: colors.border,
      ...shadow.card,
    },
    padded: {
      padding: layout.cardPadding,
    },
    liftShadow: {
      ...StyleSheet.absoluteFill,
      borderRadius: radius.card,
      // 必须：iOS 的 shadow* 由图层 alpha 推导，全透明视图不产生阴影。
      // 该层尺寸与卡片本体完全相同、且位于其下方，会被不透明的卡片本体完全覆盖，故此色不可见。
      backgroundColor: colors.bg.surface,
      ...shadow.cardLift,
    },
  })
