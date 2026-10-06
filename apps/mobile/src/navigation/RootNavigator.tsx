/**
 * 职责：根导航 —— NavigationContainer + 深链 + 未登录 / 已登录分支切换（ARCH §5）。
 * 冷启动恢复会话期间展示品牌启动态，避免登录页闪现。
 *
 * 增量 10（C5）：导航主题（`navigationTheme`）由模块级常量移入组件 + `useMemo`（依赖运行时 `colors`）；
 * `BootSplash` 配色运行化（样式工厂，参数名 `colors`，L3）。
 */
import { Feather } from '@expo/vector-icons'
import { DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native'
import { useMemo } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { BrandGradient } from '@/components'
import { useAppContext } from '@/store/AppProvider'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { layout, radius, spacing, typography, type ThemeColors } from '@/theme'
import { linking } from './linking'
import { AuthStackNavigator, MainRootStackNavigator } from './stacks'

/** 根导航 */
export function RootNavigator(): React.JSX.Element {
  const { isAuthenticated, isBootstrapping } = useAppContext()
  const { colors } = useTheme()

  /** 导航主题：底色与卡片色对齐运行时 token，避免切换时白屏闪烁 */
  const navigationTheme = useMemo<Theme>(
    () => ({
      ...DefaultTheme,
      colors: {
        ...DefaultTheme.colors,
        primary: colors.primary,
        background: colors.bg.base,
        card: colors.bg.surface,
        text: colors.text.primary,
        border: colors.border,
      },
    }),
    [colors],
  )

  if (isBootstrapping) {
    return <BootSplash />
  }

  return (
    <NavigationContainer linking={linking} theme={navigationTheme}>
      {isAuthenticated ? <MainRootStackNavigator /> : <AuthStackNavigator />}
    </NavigationContainer>
  )
}

/** 冷启动品牌态 */
function BootSplash(): React.JSX.Element {
  const { colors } = useTheme()
  const styles = useThemedStyles(makeStyles)
  return (
    <BrandGradient direction="vertical" style={styles.splash}>
      <View style={styles.logo}>
        <Feather name="calendar" size={layout.icon.lg + spacing.xxs} color={colors.text.inverse} />
      </View>
      <Text style={[typography.display, styles.title]}>OpenSchedule</Text>
      <Text style={[typography.caption, styles.subtitle]}>正在恢复会话…</Text>
      <ActivityIndicator color={colors.text.inverse} style={styles.spinner} />
    </BrandGradient>
  )
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    splash: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logo: {
      width: spacing.xxxl + spacing.md,
      height: spacing.xxxl + spacing.md,
      borderRadius: radius.card,
      backgroundColor: `${colors.text.inverse}22`,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    title: {
      color: colors.text.inverse,
    },
    subtitle: {
      color: `${colors.text.inverse}CC`,
      marginTop: spacing.xxs,
    },
    spinner: {
      marginTop: spacing.lg,
    },
  })
