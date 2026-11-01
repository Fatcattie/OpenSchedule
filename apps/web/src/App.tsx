/**
 * 职责：路由表 —— /login 公开；/projects、/projects/:projectId/board、/tasks/:taskId、/search、/import-export、/summary 需登录（RequireAuth + AppLayout 布局）
 *
 * §3.9 R7-6 代码分割：除 /login、/profile、/notifications 这三类高频入口外，所有受保护路由均用 React.lazy 异步加载，
 * 首屏只下载当前可见页面代码；vis-network/antd 等大依赖也按页面分割。主入口仅加载 AppLayout + LoginPage + 关键 store。
 */
import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Result, Spin } from 'antd'
import React from 'react'
import AppLayout from '@/components/AppLayout'
import RequireAuth from '@/components/RequireAuth'
import LoginPage from '@/pages/LoginPage'

/** 异步加载页面统一兜底（按路由显示居中 loading；切错路由时回退到工作台由外层承担） */
function PageFallback() {
  return (
    <div style={{ padding: 96, textAlign: 'center' }} aria-busy="true">
      <Spin size="large" tip="页面加载中…" />
    </div>
  )
}

/** 异步加载失败兜底（chunk 哈希失效/网络断连时给用户清晰反馈，而非白屏） */
function PageError({ error }: { error?: unknown }) {
  const message = error instanceof Error ? error.message : '页面加载失败'
  return (
    <div style={{ padding: 48 }}>
      <Result
        status="warning"
        title="页面加载失败"
        subTitle={message}
        extra={
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid #d9d9d9', background: '#fff', cursor: 'pointer' }}
          >
            重新加载
          </button>
        }
      />
    </div>
  )
}

/** 包装一层：统一 Suspense + 错误兜底，避免每个 Route 重复写 */
function lazyPage(loader: () => Promise<{ default: React.ComponentType }>) {
  const Component = lazy(loader)
  const Wrapper = (props: React.ComponentProps<typeof Component>) => (
    <Suspense fallback={<PageFallback />}>
      <ErrorBoundary>
        <Component {...props} />
      </ErrorBoundary>
    </Suspense>
  )
  Wrapper.displayName = 'LazyPageWrapper'
  return Wrapper
}

/** 简易错误边界：捕获 chunk 加载异常（如 hash 过期）后展示重试入口 */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  override render() {
    if (this.state.error) return <PageError error={this.state.error} />
    return this.props.children
  }
}

// ── 异步页面（按页面大小/用户访问频度决定是否懒加载） ─────────────────────────
// 高频入口（首屏可能立即进入）：保留同步加载
// 协作工作台是登录后默认页（来源 / 重定向），单独保留同步加载以减少首屏闪烁
import CollaborationWorkspacePage from '@/pages/CollaborationWorkspacePage'
// 个人资料、改密路径：按需进入，但体积较小（9K）保留同步以降低 chunk 数
import PersonalProfilePage from '@/pages/PersonalProfilePage'
// 通知中心（顶栏铃铛点击即入，8.6K）：保留同步
import NotificationsPage from '@/pages/NotificationsPage'

// 其余页面一律懒加载（节省首屏 700K+ 代码）
const ProjectListPage = lazyPage(() => import('@/pages/ProjectListPage'))
const ProjectDetailPage = lazyPage(() => import('@/pages/ProjectDetailPage'))
const BoardPage = lazyPage(() => import('@/pages/BoardPage'))
const PlanPage = lazyPage(() => import('@/pages/PlanPage'))
const RulesPage = lazyPage(() => import('@/pages/RulesPage'))
const AuditPage = lazyPage(() => import('@/pages/AuditPage'))
const ReportPage = lazyPage(() => import('@/pages/ReportPage'))
const SearchPage = lazyPage(() => import('@/pages/SearchPage'))
const ImportExportPage = lazyPage(() => import('@/pages/ImportExportPage'))
const SummaryPage = lazyPage(() => import('@/pages/SummaryPage'))
const EvaluationPage = lazyPage(() => import('@/pages/EvaluationPage'))
const AiRulesPage = lazyPage(() => import('@/pages/AiRulesPage'))
const CalendarPage = lazyPage(() => import('@/pages/CalendarPage'))
const ResourcePoolPage = lazyPage(() => import('@/pages/ResourcePoolPage'))
const SettingsPage = lazyPage(() => import('@/pages/SettingsPage'))
const TaskDetailPage = lazyPage(() => import('@/pages/TaskDetailPage'))
const TaskExecutionPage = lazyPage(() => import('@/pages/TaskExecutionPage'))
const TodayFocusPage = lazyPage(() => import('@/pages/TodayFocusPage'))
const WikiKbPage = lazyPage(() => import('@/pages/WikiKbPage'))
const IntelligentAssistancePage = lazyPage(() => import('@/pages/IntelligentAssistancePage'))
const PersonnelPage = lazyPage(() => import('@/features/personnel/PersonnelPage'))

export default function App() {
  return (
    <Routes>
      {/* 公开页 */}
      <Route path="/login" element={<LoginPage />} />

      {/* 受保护页：未登录重定向 /login；进入前恢复用户信息 */}
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/workspace" element={<CollaborationWorkspacePage />} />
          <Route path="/projects" element={<ProjectListPage />} />
          {/* 项目详情页：团队协作项目（kind='project'）的流程与任务管理（需求 3/4/5/6） */}
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="/projects/:projectId/board" element={<BoardPage />} />
          {/* 审核中心：提报审核事项集中处理（需求 4/5/6/7） */}
          <Route path="/audit" element={<AuditPage />} />
          {/* 第四批：提报页 —— 成员/管理在此提报任务或项目（参考协作工作台发布/提报） */}
          <Route path="/report" element={<ReportPage />} />
          {/* Phase 2 B16：计划页（甘特/依赖/燃尽/负载） */}
          <Route path="/projects/:projectId/plan" element={<PlanPage />} />
          {/* Phase 2 B17：智能评估（任务推荐 / 我的画像 / 项目统计） */}
          <Route path="/evaluations" element={<EvaluationPage />} />
          {/* AI 规则与提示词集中管理（需求 1/2） */}
          <Route path="/ai-rules" element={<AiRulesPage />} />
          {/* Phase 2 B20：自动化规则 */}
          <Route path="/projects/:projectId/automation" element={<RulesPage />} />
          {/* Phase 2 B22：开放 API 设置 */}
          <Route path="/settings" element={<SettingsPage />} />
          {/* Phase 2 B21：日历集成 */}
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/resource-pool" element={<ResourcePoolPage />} />
          <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
          {/* 任务执行页：执行记录、协作沟通、完成提报与审核 */}
          <Route path="/tasks/:taskId/execution" element={<TaskExecutionPage />} />
          {/* Phase 1 收尾：全局搜索 / 导入导出 / 个人周期总结 */}
          <Route path="/search" element={<SearchPage />} />
          <Route path="/import-export" element={<ImportExportPage />} />
          <Route path="/summary" element={<SummaryPage />} />
          <Route path="/me/today" element={<TodayFocusPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          {/* 洞察与智能：Wiki 知识库（类 Obsidian 三栏 + 拓扑网络，含 vis-network） */}
          <Route path="/wiki-kb" element={<WikiKbPage />} />
          {/* 洞察与智能：智能协助（原协作工作台 MetaSkill） */}
          <Route path="/intelligent-assistance" element={<IntelligentAssistancePage />} />
          {/* 个人资料 */}
          <Route path="/profile" element={<PersonalProfilePage />} />
          {/* 人员管理（仅管理员可见，页面内再做权限兜底） */}
          <Route path="/users" element={<PersonnelPage />} />
        </Route>
      </Route>

      {/* 兜底重定向 */}
      <Route path="/" element={<Navigate to="/workspace" replace />} />
      <Route path="*" element={<Navigate to="/workspace" replace />} />
    </Routes>
  )
}