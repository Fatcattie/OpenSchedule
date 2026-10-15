/**
 * 职责：路由表 —— /login 公开；/projects、/projects/:projectId/board、/tasks/:taskId、/search、/import-export、/summary 需登录（RequireAuth + AppLayout 布局）
 */
import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from '@/components/AppLayout'
import RequireAuth from '@/components/RequireAuth'
import BoardPage from '@/pages/BoardPage'
import CollaborationWorkspacePage from '@/pages/CollaborationWorkspacePage'
import EvaluationPage from '@/pages/EvaluationPage'
import ImportExportPage from '@/pages/ImportExportPage'
import LoginPage from '@/pages/LoginPage'
import PlanPage from '@/pages/PlanPage'
import ProjectDetailPage from '@/pages/ProjectDetailPage'
import ProjectListPage from '@/pages/ProjectListPage'
import ReportPage from '@/pages/ReportPage'
import SearchPage from '@/pages/SearchPage'
import RulesPage from '@/pages/RulesPage'
import SettingsPage from '@/pages/SettingsPage'
import CalendarPage from '@/pages/CalendarPage'
import ResourcePoolPage from '@/pages/ResourcePoolPage'
import SummaryPage from '@/pages/SummaryPage'
import TaskDetailPage from '@/pages/TaskDetailPage'
import WikiKbPage from '@/pages/WikiKbPage'
import IntelligentAssistancePage from '@/pages/IntelligentAssistancePage'
import TodayFocusPage from '@/pages/TodayFocusPage'
import PersonalProfilePage from '@/pages/PersonalProfilePage'
import UserManagementPage from '@/pages/UserManagementPage'
import NotificationsPage from '@/pages/NotificationsPage'
import AiRulesPage from '@/pages/AiRulesPage'
import TaskExecutionPage from '@/pages/TaskExecutionPage'
import AuditPage from '@/pages/AuditPage'

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
          {/* 洞察与智能：Wiki 知识库（类 Obsidian 三栏 + 拓扑网络） */}
          <Route path="/wiki-kb" element={<WikiKbPage />} />
          {/* 洞察与智能：智能协助（原协作工作台 MetaSkill） */}
          <Route path="/intelligent-assistance" element={<IntelligentAssistancePage />} />
          {/* 个人资料 */}
          <Route path="/profile" element={<PersonalProfilePage />} />
          {/* 人员管理（仅管理员可见，页面内再做权限兜底） */}
          <Route path="/users" element={<UserManagementPage />} />
        </Route>
      </Route>

      {/* 兜底重定向 */}
      <Route path="/" element={<Navigate to="/workspace" replace />} />
      <Route path="*" element={<Navigate to="/workspace" replace />} />
    </Routes>
  )
}
