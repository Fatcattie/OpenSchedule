/**
 * 职责：项目与看板 —— 【项目汇总】/【任务汇总】双 Tab（需求 2）
 *
 * - 项目汇总：展示当前用户负责的团队协作项目（kind==='project'），管理人员看全部；
 *   右侧「进入项目」跳转项目详情页（需求 3）
 * - 任务汇总：展示最上级任务（父级任务/独立任务），管理人员看全部，普通人员仅看本人相关
 */
import { useMemo } from 'react'
import { Button, Card, Col, Progress, Row, Space, Statistic, Table, Tabs, Tag, Typography } from 'antd'
import { FolderOpenOutlined, ProjectOutlined, ReloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import { mockMe, mockUsers } from '@/api/mock/data'
import { useLocalStorageState } from '@/hooks/useLocalStorageState'
import { useWorkspaceTasks } from '@/hooks/useWorkspaceTasks'
import EmptyView from '@/components/EmptyView'
import { isUserInTaskSubtree, taskRoute } from '@/utils/taskTree'
import type { Task, TaskStatus, TaskPriority, WorkspaceTask } from '@/types'
import { APPROVAL_STATUS_META, TASK_PRIORITY_META, TASK_STATUS_META } from '@/types'

const { Title, Text } = Typography
type WorkspaceRole = 'manager' | 'member'

/** 计算 root 任务子树（非评审）完成百分比 */
function rootProgress(tasks: Task[], rootId: string) {
  const ids = new Set<string>([rootId])
  const walk = (pid: string) => {
    tasks.filter((t) => t.parentId === pid).forEach((t) => { ids.add(t.id); walk(t.id) })
  }
  walk(rootId)
  const children = tasks.filter((t) => ids.has(t.id) && t.id !== rootId && !t.tags?.includes('评审'))
  if (children.length === 0) return null
  const done = children.filter((t) => t.status === 'done').length
  return Math.round((done / children.length) * 100)
}

export default function ProjectListPage() {
  const [role] = useLocalStorageState<WorkspaceRole>('workspace_role', 'manager')
  const isManager = role === 'manager'
  const [tasks] = useWorkspaceTasks()

  /** 需求 2 项目汇总：团队协作项目（kind==='project'） */
  const allProjects = useMemo(() => tasks.filter((t) => t.kind === 'project' && !t.isDraft), [tasks])
  const visibleProjects = useMemo(() => {
    if (isManager) return allProjects
    return allProjects.filter((p) => p.createdBy === mockMe.id || p.assigneeId === mockMe.id)
  }, [allProjects, isManager])

  /** 任务汇总：最上级任务（parentId===null 且非项目实体） */
  const rootTasks = useMemo(() => {
    const roots = tasks.filter((t) => t.parentId === null && t.kind !== 'project' && t.kind !== 'review' && !t.isDraft)
    if (isManager) return roots
    return roots.filter((r) => isUserInTaskSubtree(tasks, r.id, mockMe.id))
  }, [tasks, isManager])

  const projectColumns: ColumnsType<WorkspaceTask> = [
    {
      title: '项目名称',
      dataIndex: 'title',
      render: (title: string, record) => (
        <Space direction="vertical" size={2}>
          <Link to={`/projects/${record.id}`} style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>
            <FolderOpenOutlined style={{ marginRight: 6 }} />{title}
          </Link>
          <Space size={4}>
            <Tag color="purple" style={{ fontSize: 10 }}>团队协作项目</Tag>
            {record.approvalStatus === 'pending' && (
              <Tag color="gold" style={{ fontSize: 10 }}>{APPROVAL_STATUS_META.pending.label}</Tag>
            )}
          </Space>
        </Space>
      ),
    },
    {
      title: '负责人',
      dataIndex: 'assigneeId',
      width: 120,
      render: (id: string | null, record) => (
        id ? (mockUsers.find((u) => u.id === id)?.displayName ?? id) : (mockUsers.find((u) => u.id === record.createdBy)?.displayName ?? '未指派')
      ),
    },
    {
      title: '项目内任务数',
      width: 110,
      render: (_, record) => {
        const list = tasks.filter((t) => t.projectId === record.id && t.kind !== 'project' && t.status !== 'cancelled')
        return <Text style={{ fontFamily: 'var(--font-mono)' }}>{list.length}</Text>
      },
    },
    {
      title: '任务完成数',
      width: 110,
      render: (_, record) => {
        const done = tasks.filter((t) => t.projectId === record.id && t.kind !== 'project' && t.status === 'done').length
        return <Text style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>{done}</Text>
      },
    },
    {
      title: '状态',
      width: 110,
      render: (_: unknown, record: WorkspaceTask) => (
        <Tag color={record.approvalStatus === 'pending' ? 'gold' : 'processing'}>
          {record.approvalStatus === 'pending' ? '审核中' : '进行中'}
        </Tag>
      ),
    },
    {
      title: '截止日期',
      dataIndex: 'endAt',
      width: 130,
      render: (v: string | null) => (v ? dayjs(v).format('YYYY-MM-DD') : '-'),
    },
    {
      title: '操作',
      width: 130,
      render: (_, record) => (
        <Link to={`/projects/${record.id}`}>
          <Button type="primary" size="small" ghost icon={<ProjectOutlined />}>进入项目</Button>
        </Link>
      ),
    },
  ]

  const taskColumns: ColumnsType<Task> = [
    {
      title: '任务名称',
      dataIndex: 'title',
      render: (title: string, record) => (
        // 需求 4：点击任务名称按规则进入详情页（父级/含子任务）或执行页（叶子子任务）
        <Link to={taskRoute(tasks, record as WorkspaceTask)} style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>
          {title}
        </Link>
      ),
    },
    {
      title: '所属项目',
      dataIndex: 'projectId',
      render: (pid: string) => {
        if (!pid) return '-'
        const p = allProjects.find((x) => x.id === pid)
        return p ? <Link to={`/projects/${pid}`} style={{ color: 'var(--accent-purple)' }}>{p.title}</Link> : '-'
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: TaskStatus) => <Tag color={TASK_STATUS_META[status].color}>{TASK_STATUS_META[status].label}</Tag>,
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      width: 80,
      render: (priority: TaskPriority) => <Tag color={TASK_PRIORITY_META[priority].color}>{TASK_PRIORITY_META[priority].label}</Tag>,
    },
    {
      title: '负责人',
      dataIndex: 'assigneeId',
      width: 120,
      render: (id: string | null) => id ? (mockUsers.find((u) => u.id === id)?.displayName ?? '已指派') : '待承接',
    },
    {
      title: '截止日期',
      dataIndex: 'dueAt',
      width: 140,
      render: (v: string | null) => (v ? dayjs(v).format('YYYY-MM-DD') : '-'),
    },
    {
      title: '子任务进度',
      width: 160,
      render: (_, record) => {
        const pct = rootProgress(tasks, record.id)
        return pct === null ? <Text type="secondary" style={{ fontSize: 12 }}>无子任务</Text> : <Progress percent={pct} size="small" showInfo={false} />
      },
    },
  ]

  const activeTaskCount = rootTasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled').length

  const tabs = [
    {
      key: 'projects',
      label: <Space><FolderOpenOutlined />项目汇总<span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{visibleProjects.length}</span></Space>,
      children: (
        <Card>
          <Table<WorkspaceTask>
            rowKey="id"
            dataSource={visibleProjects}
            locale={{ emptyText: <EmptyView description={isManager ? '暂无团队协作项目' : '暂无你负责的团队协作项目'} /> }}
            pagination={false}
            columns={projectColumns}
          />
        </Card>
      ),
    },
    {
      key: 'tasks',
      label: <Space><ProjectOutlined />任务汇总<span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{rootTasks.length}</span></Space>,
      children: (
        <Card>
          <Table<Task>
            rowKey="id"
            dataSource={rootTasks}
            locale={{ emptyText: <EmptyView description={isManager ? '还没有任务' : '暂无你参与的任务'} /> }}
            pagination={false}
            columns={taskColumns}
          />
        </Card>
      ),
    },
  ]

  return (
    <div>
      <Row align="middle" justify="space-between" style={{ marginBottom: 12 }}>
        <Col>
          <Title level={3} style={{ margin: 0, color: 'var(--text-primary)' }}>{isManager ? '项目与看板 · 管理视图' : '项目与看板 · 成员视图'}</Title>
          <Space size={16} style={{ marginTop: 4 }}>
            <Tag color={isManager ? 'blue' : 'gold'}>{isManager ? '管理版面' : '成员版面'}</Tag>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {isManager ? '管理人员可见全部执行事项' : '展示我负责/参与的执行事项'}
            </Text>
            <Space size={4}>
              <Text style={{ fontSize: 13, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>{activeTaskCount} 任务进行中</Text>
            </Space>
          </Space>
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={() => undefined}>刷新</Button>
        </Col>
      </Row>

      {/* 第五批需求 3：双版面顶部概览（管理 / 成员） */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {isManager ? (
          <>
            <Col xs={12} md={6}><Card size="small"><Statistic title="进行中项目" value={allProjects.filter((p) => p.status !== 'done').length} prefix={<FolderOpenOutlined />} /></Card></Col>
            <Col xs={12} md={6}><Card size="small"><Statistic title="顶层任务" value={tasks.filter((t) => t.parentId === null && t.kind !== 'project' && t.kind !== 'review' && !t.isDraft).length} /></Card></Col>
            <Col xs={12} md={6}><Card size="small"><Statistic title="本周完成" value={tasks.filter((t) => t.status === 'done' && t.completedAt && dayjs(t.completedAt).isAfter(dayjs().startOf('week'))).length} valueStyle={{ color: 'green' }} /></Card></Col>
            <Col xs={12} md={6}><Card size="small"><Statistic title="待审核任务" value={tasks.filter((t) => t.approvalStatus === 'pending').length} valueStyle={{ color: 'gold' }} /></Card></Col>
          </>
        ) : (
          <>
            <Col xs={12} md={6}><Card size="small"><Statistic title="我参与项目" value={visibleProjects.length} prefix={<FolderOpenOutlined />} /></Card></Col>
            <Col xs={12} md={6}><Card size="small"><Statistic title="我的任务" value={tasks.filter((t) => t.kind !== 'project' && t.status !== 'done' && t.status !== 'cancelled' && (t.assigneeId === mockMe.id || t.createdBy === mockMe.id)).length} /></Card></Col>
            <Col xs={12} md={6}><Card size="small"><Statistic title="待承接" value={tasks.filter((t) => t.kind !== 'project' && t.status === 'todo' && !t.assigneeId).length} /></Card></Col>
            <Col xs={12} md={6}><Card size="small"><Statistic title="我相关待审" value={tasks.filter((t) => t.approvalStatus === 'pending' && (t.assigneeId === mockMe.id || t.createdBy === mockMe.id)).length} valueStyle={{ color: 'gold' }} /></Card></Col>
          </>
        )}
      </Row>

      <Tabs defaultActiveKey="projects" items={tabs} />
    </div>
  )
}
