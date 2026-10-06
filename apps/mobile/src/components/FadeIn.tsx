/**
 * 职责：入场动画容器 —— 列表 stagger 入场（位移 8px + 淡入，40ms 错峰，最多 6 项）。
 * 供各页面统一复用，避免每页重复实现 Animated（ARCH §3.6 / §3.7-11）。
 */
import { useEffect, useRef, type ReactNode } from 'react'
import {
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { motion } from '@/theme'

// Android 需显式开启 LayoutAnimation（新架构下该 API 可能不存在，故做能力检测）
if (Platform.OS === 'android' && typeof UIManager.setLayoutAnimationEnabledExperimental === 'function') {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

/**
 * 触发一次布局动画（卡片收起 / 移除 / 位置变化，ARCH §7 链路②）。
 * 统一 220ms easeInEaseOut，位移克制、不弹跳。
 */
export function runLayoutAnimation(): void {
  LayoutAnimation.configureNext({
    duration: motion.duration.base,
    update: { type: LayoutAnimation.Types.easeInEaseOut },
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
  })
}

/** FadeIn 入参 */
export interface FadeInProps {
  children: ReactNode
  /** 延迟毫秒（通常用 staggerDelay(index) 计算） */
  delay?: number
  /** 初始位移（px，默认 8） */
  offset?: number
  /** 容器样式 */
  style?: StyleProp<ViewStyle>
}

/**
 * 计算第 index 项的错峰延迟。
 * 超过 staggerMax 项后不再累加，避免长列表尾部等待过久。
 */
export function staggerDelay(index: number): number {
  return Math.min(index, motion.staggerMax - 1) * motion.stagger
}

/** 入场动画容器 */
export function FadeIn({ children, delay = 0, offset = motion.enterOffset, style }: FadeInProps): React.JSX.Element {
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: motion.duration.base,
      delay,
      easing: motion.easing.decelerate,
      useNativeDriver: true,
    }).start()
  }, [delay, progress])

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [offset, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  )
}
