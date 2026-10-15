/**
 * 职责：全局离线横幅（增量 8 · Q5 / Q10）—— 全局唯一，挂 `App.tsx` 根布局、`RootNavigator` 之上。
 *
 * - `isOffline` 为假时渲染 `null`（在线不占位）；进出用 RN 内置 `Animated` 淡入淡出；
 * - 文案区分「无网络」（`reason === 'network'`）与「服务暂时不可用」（`reason === 'server'`）；
 * - 配色用 `warning` / `warningFaint`（离线是**降级**而非错误，不用 `danger`），无阴影；
 * - 右侧「重试」为 `PressableScale`（不新增裸 `Pressable`），触发全局重试。
 */
import { Feather } from '@expo/vector-icons'
import { useEffect, useRef, useState } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { PressableScale } from './PressableScale'
import { useConnectivity } from '@/store/ConnectivityProvider'
import { useT } from '@/store/I18nProvider'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { layout, motion, radius, spacing, typography, type ThemeColors } from '@/theme'

/** 全局离线横幅（无 props，读全局连通性） */
export function OfflineBanner(): React.JSX.Element | null {
  const { isOffline, reason, retryNow } = useConnectivity()
  const { colors } = useTheme()
  const t = useT()
  const styles = useThemedStyles(makeStyles)
  const insets = useSafeAreaInsets()
  const opacity = useRef(new Animated.Value(isOffline ? 1 : 0)).current
  const [rendered, setRendered] = useState(isOffline)

  useEffect(() => {
    if (isOffline) {
      setRendered(true)
      Animated.timing(opacity, {
        toValue: 1,
        duration: motion.duration.fast,
        easing: motion.easing.standard,
        useNativeDriver: true,
      }).start()
      return
    }
    Animated.timing(opacity, {
      toValue: 0,
      duration: motion.duration.fast,
      easing: motion.easing.standard,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setRendered(false)
    })
  }, [isOffline, opacity])

  if (!rendered) return null

  const title =
    reason === 'network' ? t('component.offline.title.network') : t('component.offline.title.server')

  return (
    <Animated.View style={[styles.container, { opacity, paddingTop: insets.top + spacing.xs }]}>
      <Feather name="wifi-off" size={layout.icon.sm} color={colors.warning} />
      <View style={styles.textBlock}>
        <Text style={[typography.label, styles.title]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[typography.caption, styles.subtitle]} numberOfLines={1}>
          {t('component.offline.subtitle')}
        </Text>
      </View>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={t('common.retry')}
        onPress={retryNow}
        scale={0.94}
        hitSlop={spacing.xs}
        style={styles.retry}
      >
        <Text style={[typography.label, styles.retryText]}>{t('common.retry')}</Text>
      </PressableScale>
    </Animated.View>
  )
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.warningFaint,
      borderRadius: radius.card,
      marginHorizontal: layout.screenPadding,
      marginTop: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingBottom: spacing.xs,
      gap: spacing.xs,
    },
    textBlock: {
      flex: 1,
    },
    title: {
      color: colors.warning,
    },
    subtitle: {
      color: colors.text.secondary,
      marginTop: spacing.xxs,
    },
    retry: {
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.xxs,
      borderRadius: radius.pill,
      backgroundColor: colors.bg.surface,
    },
    retryText: {
      color: colors.warning,
    },
  })
