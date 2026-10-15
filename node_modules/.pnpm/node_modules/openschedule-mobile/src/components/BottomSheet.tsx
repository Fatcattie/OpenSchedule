/**
 * 职责：底部抽屉 —— 遮罩淡入 + 内容 spring 弹入（ARCH §3.6 spring.sheet）。
 * 用于依赖查看、退出二次确认、AI 提议等场景。
 *
 * 增量 10（深色模式）：样式改为运行时工厂 `makeStyles(colors)`（模式 A）。
 * 裸 `<Pressable>` 白名单内文件：仅运行化配色，组件结构不动。
 */
import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useT } from '@/store/I18nProvider'
import { useThemedStyles } from '@/store/ThemeProvider'
import { layout, motion, radius, shadow, spacing, typography, type ThemeColors } from '@/theme'

/** BottomSheet 入参 */
export interface BottomSheetProps {
  visible: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /** 占屏高度比例（默认 0.6） */
  heightRatio?: number
}

/** 抽屉顶部把手尺寸 */
const HANDLE_WIDTH = 36
const HANDLE_HEIGHT = 4

/** 底部抽屉 */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  heightRatio = 0.6,
}: BottomSheetProps): React.JSX.Element {
  const styles = useThemedStyles(makeStyles)
  const t = useT()
  const { height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const sheetHeight = Math.round(height * Math.min(0.92, Math.max(0.2, heightRatio)))

  const translateY = useRef(new Animated.Value(sheetHeight)).current
  const backdropOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      translateY.setValue(sheetHeight)
      backdropOpacity.setValue(0)
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          damping: motion.spring.sheet.damping,
          stiffness: motion.spring.sheet.stiffness,
          mass: motion.spring.sheet.mass,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: motion.duration.base,
          easing: motion.easing.standard,
          useNativeDriver: true,
        }),
      ]).start()
    } else {
      Animated.timing(translateY, {
        toValue: sheetHeight,
        duration: motion.duration.slow,
        easing: motion.easing.standard,
        useNativeDriver: true,
      }).start()
    }
  }, [backdropOpacity, sheetHeight, translateY, visible])

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            onPress={handleClose}
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            {
              height: sheetHeight,
              paddingBottom: insets.bottom + spacing.md,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={styles.handle} />
          {title ? (
            <Text style={[typography.title, styles.title]} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          <View style={styles.body}>{children}</View>
        </Animated.View>
      </View>
    </Modal>
  )
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.overlay,
    },
    sheet: {
      backgroundColor: colors.bg.surface,
      borderTopLeftRadius: radius.sheet,
      borderTopRightRadius: radius.sheet,
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.sm,
      ...shadow.raised,
    },
    handle: {
      alignSelf: 'center',
      width: HANDLE_WIDTH,
      height: HANDLE_HEIGHT,
      borderRadius: radius.pill,
      backgroundColor: colors.border,
      marginBottom: spacing.sm,
    },
    title: {
      color: colors.text.primary,
      marginBottom: spacing.sm,
    },
    body: {
      flex: 1,
    },
  })
