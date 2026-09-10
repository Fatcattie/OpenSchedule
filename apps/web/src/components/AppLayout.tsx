/**
 * 应用主布局：未来指挥舱导航、全局检索与用户入口。
 *
 * 第六批需求：
 * - 需求 1：顶栏搜索输入即时模糊搜索（下拉展示命中，点击直达任务执行页/详情页/项目详情页），
 *   回车仍跳转原全局搜索页；普通人员仅搜索自己涉及的事项（承接/创建/参与/评论/@到我/祖先链相关）。
 * - 需求 3：普通人员不显示【资源池】菜单；【时间容器】对两类角色均开放（忙闲查询按角色区分）。
 */
import { useMemo, useRef, useState } from 'react'
import { Avatar, Badge, Button, Dropdown, Empty, Input, Layout, Menu, Space, Spin, Tag, Tooltip } from 'antd'
import {
  AppstoreOutlined,
  AuditOutlined,
  BellOutlined,
  CalendarOutlined,
  ExperimentOutlined,
  FileAddOutlined,
  FileTextOutlined,
  ImportOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ProjectOutlined,
  ReadOutlined,
  RobotOutlined,
  SearchOutlined,
  SettingOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { authApi } from '@/api/authApi'
import { useAuthStore } from '@/stores/authStore'
import { useNotifications } from '@/hooks/useNotifications'
import { useLocalStorageState } from '@/hooks/useLocalStorageState'
import { useWorkspaceTasks } from '@/hooks/useWorkspaceTasks'
import { mockMe } from '@/api/mock/data'
import { searchWorkspace, type WorkspaceSearchHit } from '@/utils/searchWorkspace'
import { taskRoute } from '@/utils/taskTree'

const { Sider, Header, Content } = Layout

const HIT_TYPE_META: Record<WorkspaceSearchHit['type'], { label: string; color: string }> = {
  task: { label: '任务', color: 'blue' },
  project: { label: '项目', color: 'purple' },
  comment: { label: '评论', color: 'cyan' },
}

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const clear = useAuthStore((s) => s.clear)
  const { unreadCount } = useNotifications()
  const [collapsed, setCollapsed] = useState(false)
  // 按角色过滤菜单（普通人员不显示资源池；时间容器两类角色均显示）
  const [role] = useLocalStorageState<'manager' | 'member'>('workspace_role', 'manager')
  const isManager = role === 'manager'
  // 第六批需求 1：顶栏即时搜索
  const [tasks] = useWorkspaceTasks()
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)

  const selectedKey = useMemo(() => {
    if (location.pathname.startsWith('/projects')) return '/projects'
    if (location.pathname.startsWith('/workspace')) return '/workspace'
    return location.pathname
  }, [location.pathname])

  const handleLogout = async () => {
    try { await authApi.logout() } catch { /* 本地清理兜底 */ }
    clear()
    navigate('/login', { replace: true })
  }

  const items = useMemo(() => {
    const deliveryChildren = [
      { key: '/projects', icon: <ProjectOutlined />, label: '项目与看板' },
      { key: '/audit', icon: <AuditOutlined />, label: '审核中心' },
      // 第八批需求 1：时间容器对普通人员/管理人员都显示（忙闲查询按角色区分）
      { key: '/calendar', icon: <CalendarOutlined />, label: '时间容器' },
      // 资源池仍仅管理人员可见
      ...(isManager ? [
        { key: '/resource-pool', icon: <UserOutlined />, label: '资源池' },
      ] : []),
    ]
    return [
      { type: 'group' as const, label: '指挥中心', children: [
        { key: '/workspace', icon: <AppstoreOutlined />, label: '协作工作台' },
        { key: '/me/today', icon: <CalendarOutlined />, label: '今日聚焦' },
        { key: '/report', icon: <FileAddOutlined />, label: '提报' },
      ] },
      { type: 'group' as const, label: '交付空间', children: deliveryChildren },
      { type: 'group' as const, label: '洞察与智能', children: [
        { key: '/evaluations', icon: <ThunderboltOutlined />, label: '智能评估' },
        { key: '/ai-rules', icon: <ExperimentOutlined />, label: 'AI 规则' },
        { key: '/summary', icon: <FileTextOutlined />, label: '周期总结' },
        { key: '/wiki-kb', icon: <ReadOutlined />, label: 'Wiki知识库' },
        { key: '/intelligent-assistance', icon: <RobotOutlined />, label: '智能协助' },
        ...(isManager ? [{ key: '/import-export', icon: <ImportOutlined />, label: '数据中枢' }] : []),
      ] },
    ]
  }, [isManager])

  /** 顶栏即时搜索结果（防抖 200ms；member 仅自己涉及的事项） */
  const searchHits = useMemo(() => {
    if (!searchKeyword.trim()) return []
    return searchWorkspace(tasks, searchKeyword, { userId: mockMe.id, displayName: mockMe.displayName, isManager }, 'all', 8)
  }, [tasks, searchKeyword, isManager])

  /** 命中跳转：项目→项目详情/看板；任务/评论→taskRoute（父级详情 / 叶子执行页） */
  const gotoHit = (hit: WorkspaceSearchHit) => {
    setSearchOpen(false)
    setSearchKeyword('')
    if (hit.type === 'project') {
      navigate(`/projects/${hit.id}`)
      return
    }
    const targetId = hit.type === 'comment' && hit.taskId ? hit.taskId : hit.id
    const task = tasks.find((t) => t.id === targetId)
    if (task) {
      navigate(taskRoute(tasks, task))
      return
    }
    navigate(`/tasks/${targetId}`)
  }

  const onSearchChange = (value: string) => {
    setSearchKeyword(value)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    if (!value.trim()) {
      setSearchOpen(false)
      setSearchLoading(false)
      return
    }
    setSearchLoading(true)
    searchDebounceRef.current = setTimeout(() => {
      setSearchLoading(false)
      setSearchOpen(true)
    }, 200)
  }

  const searchDropdown = (
    <div
      style={{
        width: 460, maxHeight: 420, overflowY: 'auto',
        background: 'var(--bg-card, #fff)', borderRadius: 8,
        border: '1px solid var(--border-subtle, #f0f0f0)',
        boxShadow: '0 6px 24px rgba(0,0,0,0.12)', padding: 8,
      }}
    >
      <div style={{ padding: '4px 8px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          {isManager ? '搜索全部任务 / 项目 / 评论' : '仅搜索与我相关的事项'}
        </span>
        <Tag color={isManager ? 'blue' : 'gold'} style={{ fontSize: 10 }}>{isManager ? '管理' : '成员'}</Tag>
      </div>
      {searchLoading ? (
        <div style={{ textAlign: 'center', padding: 24 }}><Spin size="small" /></div>
      ) : searchHits.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={searchKeyword.trim() ? '没有匹配结果' : '输入关键词即时搜索'} style={{ margin: '12px 0' }} />
      ) : (
        searchHits.map((hit) => (
          <div
            key={`${hit.type}-${hit.id}`}
            onClick={() => gotoHit(hit)}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-card-raised, #f5f5f5)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <Tag color={HIT_TYPE_META[hit.type].color} style={{ fontSize: 10, flexShrink: 0, marginTop: 2 }}>
              {HIT_TYPE_META[hit.type].label}
            </Tag>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {hit.title}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {hit.snippet}
              </div>
            </div>
          </div>
        ))
      )}
      {searchKeyword.trim() && (
        <div
          onClick={() => { setSearchOpen(false); navigate(`/search?q=${encodeURIComponent(searchKeyword)}`) }}
          style={{ textAlign: 'center', padding: 8, fontSize: 12, color: 'var(--accent-cyan)', cursor: 'pointer', borderTop: '1px solid var(--border-subtle)' }}
        >
          查看全部结果 →
        </div>
      )}
    </div>
  )

  return (
    <Layout className="command-shell">
      <Sider className="command-sider" width={248} collapsedWidth={76} collapsible trigger={null} collapsed={collapsed}>
        <button className="brand-lockup" onClick={() => navigate('/workspace')} aria-label="返回工作台">
          <span className="brand-mark"><span /></span>
          {!collapsed && <span className="brand-copy"><b>OPEN</b><b>SCHEDULE</b></span>}
        </button>
        {!collapsed && <div className="workspace-pill"><span className="signal-dot" />北极星研发组<span className="workspace-plan">PRO</span></div>}
        <Menu className="command-menu" mode="inline" selectedKeys={[selectedKey]} items={items} onClick={({ key }) => navigate(key)} />
        <div className="sider-foot">
          <Button type="text" icon={<SettingOutlined />} onClick={() => navigate('/settings')}>{!collapsed && '系统设置'}</Button>
          <Button type="text" icon={<UserOutlined />} onClick={() => navigate('/profile')}>{!collapsed && '个人资料'}</Button>
          {isManager && (
            <Button type="text" icon={<TeamOutlined />} onClick={() => navigate('/users')}>{!collapsed && '人员管理'}</Button>
          )}
          <Button type="text" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setCollapsed(!collapsed)}>{!collapsed && '收起导航'}</Button>
        </div>
      </Sider>
      <Layout className="command-stage">
        <Header className="command-header">
          <Button className="mobile-menu" type="text" icon={<MenuUnfoldOutlined />} onClick={() => setCollapsed(!collapsed)} aria-label="切换导航" />
          {/* 第六批需求 1：顶栏即时模糊搜索（下拉直达），回车仍进全局搜索页 */}
          <Dropdown
            trigger={['click']}
            open={searchOpen && Boolean(searchKeyword.trim())}
            onOpenChange={(open) => { if (!open) setSearchOpen(false) }}
            popupRender={() => searchDropdown}
          >
            <Input
              className="global-search"
              prefix={<SearchOutlined />}
              placeholder="搜索任务、项目或评论，输入即搜  /"
              value={searchKeyword}
              onChange={(e) => onSearchChange(e.target.value)}
              onPressEnter={(event) => navigate(`/search?q=${encodeURIComponent(event.currentTarget.value)}`)}
            />
          </Dropdown>
          <Space size={10}>
            <Tooltip title="通知中心">
              <Badge count={unreadCount} size="small" offset={[-2, 4]}>
                <Button className="header-action" type="text" icon={<BellOutlined />} onClick={() => navigate('/notifications')} />
              </Badge>
            </Tooltip>
            <Dropdown menu={{ items: [
              { key: 'profile', icon: <UserOutlined />, label: '个人资料', onClick: () => navigate('/profile') },
              ...(isManager ? [{ key: 'users', icon: <TeamOutlined />, label: '人员管理', onClick: () => navigate('/users') }] : []),
              { type: 'divider' },
              { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: handleLogout },
            ] }}>
              <button className="user-control">
                <Avatar src={user?.avatarUrl || undefined} icon={<UserOutlined />} />
                <span className="app-layout-user-name"><b>{user?.displayName ?? '张伟'}</b><small>项目负责人</small></span>
              </button>
            </Dropdown>
          </Space>
        </Header>
        <Content className="app-layout-content"><Outlet /></Content>
      </Layout>
    </Layout>
  )
}