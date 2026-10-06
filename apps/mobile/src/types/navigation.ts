/**
 * 职责：导航路由参数类型（ARCH §5）。
 * TaskDetail 注册在 MainRootStack（Tab 之上），实现「跨 Tab 共享任务详情」。
 */
import type { NavigationProp, NavigatorScreenParams, RouteProp } from '@react-navigation/native'
import type { SubmissionKind } from './task'

/** 任务详情来源（用于返回逻辑与埋点） */
export type TaskDetailFrom = 'workspace' | 'today' | 'board' | 'time' | 'notification'

/** 根级共享栈 */
export type MainRootStackParamList = {
  /** 底部 Tab 容器（含各 Tab 内嵌栈，支持跨 Tab 跳转） */
  Tabs: NavigatorScreenParams<TabParamList> | undefined
  TaskDetail: { taskId: string; from?: TaskDetailFrom }
  Notifications: undefined
  AiProposalSheet: { proposalId: string }
  /** 提报事项页（member 待审 / manager 免审落地，增量 1） */
  Submission: { kind?: SubmissionKind } | undefined
  /** 创建事项页（manager 直接创建项目 / 任务，增量 1） */
  CreateItem: { kind?: SubmissionKind; projectId?: string } | undefined
  /** 个人计划页（列表 + 排期，增量 1） */
  PersonalPlan: undefined
  /** 我的提报页（状态查看 + 撤回，增量 1 · P1） */
  MySubmissions: undefined
  /** 审核中心页（四栏：待提报 / 待审核 / 审核通过 / 撤回审核，增量 7） */
  AuditCenter: undefined
}

/** 底部 5 Tab */
export type TabParamList = {
  Workspace: undefined
  Today: undefined
  Project: undefined
  Time: undefined
  Me: undefined
}

/** 工作台栈 */
export type WorkspaceStackParamList = { Workspace: undefined }
/** 今日聚焦栈 */
export type TodayStackParamList = { TodayFocus: undefined }
/** 项目栈 */
export type ProjectStackParamList = { ProjectList: undefined; Board: { projectId: string } }
/** 时间容器栈 */
export type TimeStackParamList = { Calendar: undefined }
/** 我的栈 */
export type MeStackParamList = { Profile: undefined; NotificationSettings: undefined; About: undefined }
/** 登录栈 */
export type AuthStackParamList = { Login: undefined }

/**
 * 应用内通用导航类型：合并根栈与各 Tab 栈的路由表，
 * 使任意页面都能 `navigate('TaskDetail', …)` 或 `navigate('Board', …)` 且保持类型安全。
 */
export type AppParamList = MainRootStackParamList &
  WorkspaceStackParamList &
  TodayStackParamList &
  ProjectStackParamList &
  TimeStackParamList &
  MeStackParamList

/** 通用导航对象类型（页面 useNavigation 泛型） */
export type AppNavigationProp = NavigationProp<AppParamList>

/** 通用路由对象类型（页面 useRoute 泛型） */
export type AppRouteProp<RouteName extends keyof AppParamList> = RouteProp<AppParamList, RouteName>

/** 全局 RootParamList 增强：使 useNavigation 无需显式泛型即可获得类型提示 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends MainRootStackParamList {}
  }
}
