/**
 * 职责：应用根组件 —— 安全区容器 + 主题 Provider + 全局状态 Provider + 连通性 Provider + 根导航装配
 * （ARCH §2 / T01 / T10 / 增量 8 / 增量 10）。
 *
 * 装配顺序（§2.7）：`ThemeProvider` 置于 `AppProvider` **之外**（未登录也需按系统外观渲染，Q7）。
 * `AppContent` 下沉到 `ThemeProvider` 内以消费 `useTheme()`：状态栏随生效方案切换、根容器背景取运行时色板。
 */
import { StatusBar } from 'expo-status-bar'
import { StyleSheet, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { OfflineBanner } from '@/components'
import { RootNavigator } from '@/navigation/RootNavigator'
import { AppProvider } from '@/store/AppProvider'
import { ConnectivityProvider } from '@/store/ConnectivityProvider'
import { ThemeProvider, useTheme, useThemedStyles } from '@/store/ThemeProvider'
import type { ThemeColors } from '@/theme'

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppProvider>
          <ConnectivityProvider>
            <AppContent />
          </ConnectivityProvider>
        </AppProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}

/** 根内容：消费运行时主题（状态栏样式 + 根容器背景）。 */
function AppContent(): React.JSX.Element {
  const { scheme } = useTheme()
  const styles = useThemedStyles(makeStyles)

  return (
    <View style={styles.root}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <OfflineBanner />
      <RootNavigator />
    </View>
  )
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bg.base,
    },
  })
