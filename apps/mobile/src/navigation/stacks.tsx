/**
 * 职责：各栈导航定义 —— AuthStack / 5 个 Tab 内嵌栈 / 根共享栈（含 TaskDetail、Notifications、AI 提议抽屉）。
 * TaskDetail 注册在根栈（Tab 之上），实现「跨 Tab 共享任务详情」（ARCH §5）。
 * 本次新增 4 个根栈共享页（增量 1）：Submission（提报事项）/ CreateItem（创建事项）/
 * PersonalPlan（个人计划）/ MySubmissions（我的提报）—— 均与 TaskDetail / Notifications 同级，
 * 位于 Tab 之上、全屏覆盖 TabBar，供任意 Tab 或深链直接 push。
 *
 * 增量 10：`stackScreenOptions` 由模块级常量改为运行时 hook（读 `colors.bg.base`）；样式工厂化（参数名 `colors`，L3）。
 */
import { useNavigation, useRoute } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { BottomSheet, Button, EmptyState, LoadingView, Tag } from '@/components'
import { focusService } from '@/services'
import { useAppContext } from '@/store/AppProvider'
import { useT } from '@/store/I18nProvider'
import { useThemeColors, useThemedStyles } from '@/store/ThemeProvider'
import { motion, spacing, typography, type ThemeColors } from '@/theme'
import type {
  AiProposal,
  AppNavigationProp,
  AppRouteProp,
  AuthStackParamList,
  MainRootStackParamList,
  MeStackParamList,
  ProjectStackParamList,
  TimeStackParamList,
  TodayStackParamList,
  WorkspaceStackParamList,
} from '@/types'
import { AI_PROPOSAL_TYPE_LABEL } from '@/types'
import { AboutScreen } from '@/screens/AboutScreen'
import { AuditCenterScreen } from '@/screens/AuditCenterScreen'
import { BoardScreen } from '@/screens/BoardScreen'
import { CalendarScreen } from '@/screens/CalendarScreen'
import { CreateItemScreen } from '@/screens/CreateItemScreen'
import { LoginScreen } from '@/screens/LoginScreen'
import { MySubmissionsScreen } from '@/screens/MySubmissionsScreen'
import { NotificationSettingsScreen } from '@/screens/NotificationSettingsScreen'
import { NotificationsScreen } from '@/screens/NotificationsScreen'
import { PersonalPlanScreen } from '@/screens/PersonalPlanScreen'
import { ProfileScreen } from '@/screens/ProfileScreen'
import { ProjectListScreen } from '@/screens/ProjectListScreen'
import { SubmissionScreen } from '@/screens/SubmissionScreen'
import { TaskDetailScreen } from '@/screens/TaskDetailScreen'
import { TodayFocusScreen } from '@/screens/TodayFocusScreen'
import { WorkspaceScreen } from '@/screens/WorkspaceScreen'
import { MainTabs } from './MainTabs'

/**
 * 统一栈外观（运行时取色）：隐藏原生页头（各页自带 ScreenHeader），底色为页面底色；
 * 页面推入 / 返回使用右侧滑入转场。
 */
function useStackScreenOptions() {
  const colors = useThemeColors()
  return useMemo(
    () =>
      ({
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg.base },
        animation: 'slide_from_right',
        animationDuration: motion.duration.slow,
      }) as const,
    [colors],
  )
}

const AuthStack = createNativeStackNavigator<AuthStackParamList>()
const WorkspaceStack = createNativeStackNavigator<WorkspaceStackParamList>()
const TodayStack = createNativeStackNavigator<TodayStackParamList>()
const ProjectStack = createNativeStackNavigator<ProjectStackParamList>()
const TimeStack = createNativeStackNavigator<TimeStackParamList>()
const MeStack = createNativeStackNavigator<MeStackParamList>()
const MainRootStack = createNativeStackNavigator<MainRootStackParamList>()

/** 登录栈（未登录） */
export function AuthStackNavigator(): React.JSX.Element {
  const stackScreenOptions = useStackScreenOptions()
  return (
    <AuthStack.Navigator screenOptions={stackScreenOptions}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
    </AuthStack.Navigator>
  )
}

/** 工作台栈 */
export function WorkspaceStackNavigator(): React.JSX.Element {
  const stackScreenOptions = useStackScreenOptions()
  return (
    <WorkspaceStack.Navigator screenOptions={stackScreenOptions}>
      <WorkspaceStack.Screen name="Workspace" component={WorkspaceScreen} />
    </WorkspaceStack.Navigator>
  )
}

/** 今日聚焦栈 */
export function TodayStackNavigator(): React.JSX.Element {
  const stackScreenOptions = useStackScreenOptions()
  return (
    <TodayStack.Navigator screenOptions={stackScreenOptions}>
      <TodayStack.Screen name="TodayFocus" component={TodayFocusScreen} />
    </TodayStack.Navigator>
  )
}

/** 项目栈 */
export function ProjectStackNavigator(): React.JSX.Element {
  const stackScreenOptions = useStackScreenOptions()
  return (
    <ProjectStack.Navigator screenOptions={stackScreenOptions}>
      <ProjectStack.Screen name="ProjectList" component={ProjectListScreen} />
      <ProjectStack.Screen name="Board" component={BoardScreen} />
    </ProjectStack.Navigator>
  )
}

/** 时间容器栈 */
export function TimeStackNavigator(): React.JSX.Element {
  const stackScreenOptions = useStackScreenOptions()
  return (
    <TimeStack.Navigator screenOptions={stackScreenOptions}>
      <TimeStack.Screen name="Calendar" component={CalendarScreen} />
    </TimeStack.Navigator>
  )
}

/** 我的栈 */
export function MeStackNavigator(): React.JSX.Element {
  const stackScreenOptions = useStackScreenOptions()
  return (
    <MeStack.Navigator screenOptions={stackScreenOptions}>
      <MeStack.Screen name="Profile" component={ProfileScreen} />
      <MeStack.Screen name="NotificationSettings" component={NotificationSettingsScreen} />
      <MeStack.Screen name="About" component={AboutScreen} />
    </MeStack.Navigator>
  )
}

/** 根共享栈（已登录）：Tab 容器 + 全局共享页 */
export function MainRootStackNavigator(): React.JSX.Element {
  const stackScreenOptions = useStackScreenOptions()
  return (
    <MainRootStack.Navigator screenOptions={stackScreenOptions}>
      <MainRootStack.Screen name="Tabs" component={MainTabs} />
      {/* 任意 Tab / 通知深链 push 到此层，全屏覆盖 TabBar */}
      <MainRootStack.Screen name="TaskDetail" component={TaskDetailScreen} />
      <MainRootStack.Screen name="Notifications" component={NotificationsScreen} />
      {/* 增量 1 根栈共享页：全屏覆盖 TabBar，供工作台快捷入口 / 我的设置入口 / 深链直达 */}
      <MainRootStack.Screen name="Submission" component={SubmissionScreen} />
      <MainRootStack.Screen name="CreateItem" component={CreateItemScreen} />
      <MainRootStack.Screen name="PersonalPlan" component={PersonalPlanScreen} />
      <MainRootStack.Screen name="MySubmissions" component={MySubmissionsScreen} />
      {/* 增量 7：审核中心（四栏：待提报 / 待审核 / 审核通过 / 撤回审核） */}
      <MainRootStack.Screen name="AuditCenter" component={AuditCenterScreen} />
      <MainRootStack.Screen
        name="AiProposalSheet"
        component={AiProposalSheetScreen}
        options={{ presentation: 'transparentModal', animation: 'fade' }}
      />
    </MainRootStack.Navigator>
  )
}

/**
 * AI 提议确认抽屉（路由级 transparentModal）。
 * 内容与「今日聚焦」内的提议卡片一致，供深链 / 通知直接打开。
 */
function AiProposalSheetScreen(): React.JSX.Element {
  const navigation = useNavigation<AppNavigationProp>()
  const route = useRoute<AppRouteProp<'AiProposalSheet'>>()
  const { user } = useAppContext()
  const t = useT()
  const styles = useThemedStyles(makeStyles)
  const { proposalId } = route.params
  const approverId = user?.id ?? ''
  const [proposal, setProposal] = useState<AiProposal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setProposal(await focusService.getAiProposal(proposalId))
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [proposalId])

  useEffect(() => {
    void load()
  }, [load])

  const close = useCallback(() => {
    navigation.goBack()
  }, [navigation])

  const handleApprove = useCallback(async () => {
    if (!proposal) return
    setSubmitting(true)
    try {
      await focusService.approveAiProposal(proposal.id, approverId)
      close()
    } finally {
      setSubmitting(false)
    }
  }, [approverId, close, proposal])

  const handleReject = useCallback(async () => {
    if (!proposal) return
    setSubmitting(true)
    try {
      await focusService.rejectAiProposal(proposal.id, t('nav.proposal.demoReason'), approverId)
      close()
    } finally {
      setSubmitting(false)
    }
  }, [approverId, close, proposal, t])

  return (
    <BottomSheet visible onClose={close} title={t('nav.proposal.title')} heightRatio={0.62}>
      {loading ? (
        <LoadingView variant="spinner" />
      ) : error || !proposal ? (
        <EmptyState
          icon="alert-circle"
          title={t('nav.proposal.missingTitle')}
          description={t('nav.proposal.missingDescription')}
          actionLabel={t('common.close')}
          onAction={close}
        />
      ) : (
        <>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.proposalHeader}>
              <Tag text={AI_PROPOSAL_TYPE_LABEL[proposal.type]} tone="neutral" />
              <Text style={[typography.caption, styles.proposalStatus]}>
                {t('nav.proposal.status', { status: proposal.status })}
              </Text>
            </View>
            <Text style={[typography.body, styles.proposalSummary]}>{proposal.payload.summary}</Text>
            <View style={styles.proposalList}>
              {proposal.payload.tasks.map((item, index) => (
                <View key={`${proposal.id}-${index}`} style={styles.proposalRow}>
                  <Text style={[typography.caption, styles.proposalIndex]}>{index + 1}</Text>
                  <Text style={[typography.caption, styles.proposalText]} numberOfLines={2}>
                    {item.title} · {item.estimatedHours}h · {item.priority}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>
          <View style={styles.proposalActions}>
            <View style={styles.proposalButton}>
              <Button label={t('nav.proposal.reject')} variant="secondary" fullWidth loading={submitting} onPress={() => void handleReject()} />
            </View>
            <View style={styles.proposalButton}>
              <Button label={t('nav.proposal.confirm')} fullWidth loading={submitting} onPress={() => void handleApprove()} />
            </View>
          </View>
        </>
      )}
    </BottomSheet>
  )
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    proposalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    proposalStatus: {
      color: colors.text.tertiary,
    },
    proposalSummary: {
      color: colors.text.primary,
      marginTop: spacing.sm,
    },
    proposalList: {
      marginTop: spacing.sm,
    },
    proposalRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginTop: spacing.xs,
    },
    proposalIndex: {
      width: spacing.md,
      color: colors.text.tertiary,
    },
    proposalText: {
      flex: 1,
      color: colors.text.secondary,
    },
    proposalActions: {
      flexDirection: 'row',
      marginTop: spacing.md,
    },
    proposalButton: {
      flex: 1,
      marginRight: spacing.sm,
    },
  })
