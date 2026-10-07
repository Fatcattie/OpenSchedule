/**
 * 职责：底部 5 Tab（工作台 / 今日 / 项目 / 时间 / 我的），各 Tab 内嵌独立 native-stack 以保留栈状态（ARCH §5）。
 * 交互升级：切换使用 `animation: 'shift'` 平滑过渡；选中态图标带一层圆角胶囊底色。
 *
 * 增量 10（C6）：`screenOptions` / 样式工厂读取运行时 `colors`（工厂参数名 `colors`，保住源码字面串断言，L3）。
 */
import { Feather } from '@expo/vector-icons'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { StyleSheet, View } from 'react-native'
import { useI18n } from '@/store/I18nProvider'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { layout, radius, shadow, spacing, typography, type ThemeColors } from '@/theme'
import type { TabParamList } from '@/types'
import {
  MeStackNavigator,
  ProjectStackNavigator,
  TimeStackNavigator,
  TodayStackNavigator,
  WorkspaceStackNavigator,
} from './stacks'

const Tab = createBottomTabNavigator<TabParamList>()

/** Tab → Feather 线性图标 */
const TAB_ICON: Record<keyof TabParamList, keyof typeof Feather.glyphMap> = {
  Workspace: 'home',
  Today: 'target',
  Project: 'grid',
  Time: 'clock',
  Me: 'user',
}

/**
 * Tab 中文标题（★ 硬边界 F10）。
 *
 * `tests/increment-ui-polish.test.tsx:358-365` 对本文件**源码文本**断言 5 个中文 Tab 字面串，
 * 故本表（含字面串）**必须原样保留**，不得"抽出即删"（§0.2-Q10）。
 */
const TAB_LABEL: Record<keyof TabParamList, string> = {
  Workspace: '工作台',
  Today: '今日',
  Project: '项目',
  Time: '时间',
  Me: '我的',
}

/** Tab 英文标题（术语表见 PRD §6-D12；最短化防 320pt 截断） */
const TAB_LABEL_EN: Record<keyof TabParamList, string> = {
  Workspace: 'Workspace',
  Today: 'Today',
  Project: 'Projects',
  Time: 'Time',
  Me: 'Me',
}

/** 底部 Tab 导航 */
export function MainTabs(): React.JSX.Element {
  const { colors } = useTheme()
  const { locale } = useI18n()
  const styles = useThemedStyles(makeStyles)
  // 渲染期按语言选表（不得是模块级常量）：切英文即时生效，不重载、不 remount
  const tabLabel = locale === 'en-US' ? TAB_LABEL_EN : TAB_LABEL
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        animation: 'shift',
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.text.tertiary,
        tabBarStyle: {
          backgroundColor: colors.bg.surface,
          // 去硬直边：顶部圆角 + 向上柔和投影（shadow.raised 语义即「底部操作条 / 抽屉」）；
          // 同时显式置零 @react-navigation/bottom-tabs 默认的 hairline 上边框，避免与投影重复形成硬边
          borderTopLeftRadius: radius.sheet,
          borderTopRightRadius: radius.sheet,
          borderTopWidth: 0,
          paddingTop: spacing.xxs,
          height: layout.tabBarHeight,
          ...shadow.raised,
        },
        tabBarLabelStyle: {
          fontSize: typography.label.fontSize,
          lineHeight: typography.label.lineHeight,
          fontWeight: '600',
        },
        tabBarIcon: ({ focused, color, size }) => (
          <View style={[styles.iconWrap, focused ? styles.iconWrapActive : null]}>
            <Feather name={TAB_ICON[route.name]} size={size ?? layout.icon.md} color={color} />
          </View>
        ),
      })}
    >
      <Tab.Screen
        name="Workspace"
        component={WorkspaceStackNavigator}
        options={{ title: tabLabel.Workspace }}
      />
      <Tab.Screen name="Today" component={TodayStackNavigator} options={{ title: tabLabel.Today }} />
      <Tab.Screen name="Project" component={ProjectStackNavigator} options={{ title: tabLabel.Project }} />
      <Tab.Screen name="Time" component={TimeStackNavigator} options={{ title: tabLabel.Time }} />
      <Tab.Screen name="Me" component={MeStackNavigator} options={{ title: tabLabel.Me }} />
    </Tab.Navigator>
  )
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    iconWrap: {
      width: layout.icon.lg + spacing.sm,
      height: layout.icon.lg + spacing.sm,
      borderRadius: radius.control,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    iconWrapActive: {
      backgroundColor: colors.primaryFaint,
    },
  })
