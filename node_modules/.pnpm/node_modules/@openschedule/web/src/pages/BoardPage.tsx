/**
 * 职责：项目看板页 —— 默认三列（待办/进行中/已完成）+ 任务卡片 + 状态快捷移动（乐观更新）
 * 需求 2：看板展示当前角色下所有承接任务（管理人员看全部，普通人员仅看本人参与的父级任务）
 * 需求 3：点击父级任务进入父级详情页；点击叶子任务进入任务执行页
 */
import { useEffect, useMemo, useRef } from 'react'
import { Avatar, Button, Card, Col, Dropdown, Empty, message, Progress, Row, Space, Tag, Timeline, Typography } from 'antd'
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  MoreOutlined,
  ReloadOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { getErrorMessage } from '@/api/errors'
import { mockMe, mockUsers } from '@/api/mock/data'
import { projectApi } from '@/api/projectApi'
import { taskApi } from '@/api/taskApi'
import { useBoardStore } from '@/stores/boardStore'
import { useLocalStorageState } from '@/hooks/useLocalStorageState'
import ErrorView from '@/components/ErrorView'
import LoadingView from '@/components/LoadingView'
import StatusTag from '@/components/StatusTag'
import { isUserInTaskSubtree } from '@/utils/taskTree'
import {
  BOARD_COLUMNS,
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  TASK_TRANSITIONS,
  type Task,
  type TaskStatus,
} from '@/types'

const { Title, Text } = Typography

type WorkspaceRole = 'manager' | 'member'

/** 看板任务卡片：父级进详情页，叶子进执行页；「更多」菜单快捷移动状态（乐观更新） */
function TaskCard({ task, allTasks, highlighted }: { task: Task; allTasks: Task[]; highlighted?: boolean }) {
  const navigate = useNavigate()
  const cardRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const upsertTask = useBoardStore((s) => s.upsertTask)
  const hasChildren = allTasks.some((t) => t.parentId === task.id)

  const handleMove = async (to: TaskStatus) => {
    const { rollback } = useBoardStore.getState().moveTaskOptimistic(task.id, to)
    try {
      const updated = await taskApi.moveTask(task.id, { status: to, version: task.version })
      upsertTask(updated)
      message.success(`已移动到「${TASK_STATUS_META[to].label}」`)
      if (task.projectId) queryClient.invalidateQueries({ queryKey: ['tasks', task.projectId] })
    } catch (e) {
      rollback()
      message.error(getErrorMessage(e))
    }
  }

  const moves = TASK_TRANSITIONS[task.status]
  const overdue = task.dueAt ? dayjs(task.dueAt).isBefore(dayjs(), 'day') && task.status !== 'done' : false

  return (
    <Card
      ref={cardRef}
      size="small"
      hoverable
      style={{
        marginBottom: 8,
        borderColor: highlighted ? 'var(--accent-cyan)' : overdue ? 'var(--accent-coral)' : 'var(--border-subtle)',
        background: highlighted ? 'var(--accent-blue-bg, rgba(22,119,255,0.08))' : 'var(--bg-card-raised)',
        boxShadow: highlighted ? '0 0 0 1px var(--accent-cyan)' : undefined,
      }}
      // 需求 4：父级任务（或含下级）进详情页；叶子子任务进执行页
      onClick={() => navigate(hasChildren || task.parentId === null ? `/tasks/${task.id}` : `/tasks/${task.id}/execution`)}
    >
      <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13, color: 'var(--text-primary)', wordBreak: 'break-word', lineHeight: 1.4 }}>{task.title}</div>
      <Space size={4} wrap>
        <Tag color={TASK_PRIORITY_META[task.priority].color} style={{ fontSize: 10 }}>{TASK_PRIORITY_META[task.priority].label}</Tag>
        {task.status === 'blocked' && <StatusTag status={task.status} />}
        {overdue && <Tag color="error" style={{ fontSize: 10 }}>已逾期</Tag>}
        {hasChildren && <Tag style={{ fontSize: 10 }}>含子任务</Tag>}
        <Text type="secondary" style={{ fontSize: 11 }}>
          {task.assigneeId
            ? mockUsers.find((u) => u.id === task.assigneeId)?.displayName ?? '已指派'
            : '待承接'}
        </Text>
        {task.dueAt && <Text type={overdue ? 'danger' : 'secondary'} style={{ fontSize: 11 }}>{dayjs(task.dueAt).format('MM-DD 截止')}</Text>}
        {moves.length > 0 && (
          <Dropdown trigger={['click']} menu={{ items: moves.map((status) => ({ key: status, label: `移动到「${TASK_STATUS_META[status].label}」` })), onClick: ({ key }) => handleMove(key as TaskStatus) }}>
            <Button type="text" size="small" icon={<MoreOutlined />} onClick={(e) => e.stopPropagation()} />
          </Dropdown>
        )}
      </Space>
    </Card>
  )
}

export default function BoardPage() {
  const { projectId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const highlightTaskId = searchParams.get('taskId')
  const setTasks = useBoardStore((s) => s.setTasks)
  const [role] = useLocalStorageState<WorkspaceRole>('workspace_role', 'manager')
  const isManager = role === 'manager'

  const projectQuery = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectApi.getProject(projectId),
    enabled: !!projectId,
    retry: false,
  })

  const tasksQuery = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => taskApi.listProjectTasks(projectId),
    enabled: !!projectId,
  })

  useEffect(() => {
    if (tasksQuery.data) setTasks(tasksQuery.data.items)
  }, [tasksQuery.data, setTasks])

  const allTasks = tasksQuery.data?.items ?? []
  const rootTasks = useMemo(() => {
    const parents = allTasks.filter((t: Task) => !t.parentId)
    if (isManager) return parents
    return parents.filter((t) => isUserInTaskSubtree(allTasks, t.id, mockMe.id))
  }, [allTasks, isManager])

  const columns = useMemo(() => BOARD_COLUMNS.map((col) => ({ ...col, tasks: rootTasks.filter((t: Task) => t.status === col.status || (col.status === 'in_progress' && t.status === 'blocked')) })), [rootTasks])

  const doneCount = rootTasks.filter((t) => t.status === 'done').length
  const progressPct = rootTasks.length > 0 ? Math.round((doneCount / rootTasks.length) * 100) : 0
  const blockedCount = rootTasks.filter((t) => t.status === 'blocked').length

  /** 需求 8：执行流程按计划时间排序，承接待办统计 */
  const activeTasks = rootTasks.filter((t) => t.status !== 'cancelled')
  const flowTasks = [...activeTasks].sort(
    (a, b) => dayjs(a.dueAt ?? a.createdAt).valueOf() - dayjs(b.dueAt ?? b.createdAt).valueOf(),
  )
  const unassignedCount = activeTasks.filter((t) => !t.assigneeId && t.status !== 'done').length

  if (projectQuery.isError) return <ErrorView error={projectQuery.error} extra={<Link to="/projects">返回项目列表</Link>} onRetry={() => projectQuery.refetch()} />
  if (tasksQuery.isLoading) return <LoadingView height={400} tip="正在加载看板任务…" />
  if (tasksQuery.isError) return <ErrorView error={tasksQuery.error} onRetry={() => tasksQuery.refetch()} />

  const projectName = projectQuery.data?.name ?? '看板'

  return (
    <div>
      <Row align="middle" justify="space-between" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0, color: 'var(--text-primary)' }}>{projectName}</Title>
          <Space size={16} style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 13 }}>{rootTasks.length} 个任务{!isManager && '（仅显示我参与的）'}</Text>
            <Space size={4}>
              <CheckCircleOutlined style={{ color: 'var(--accent-cyan)' }} />
              <Text style={{ fontSize: 13, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>{doneCount} 已完成</Text>
            </Space>
            {blockedCount > 0 && (
              <Space size={4}>
                <ExclamationCircleOutlined style={{ color: 'var(--accent-coral)' }} />
                <Text style={{ fontSize: 13, color: 'var(--accent-coral)' }}>{blockedCount} 阻塞</Text>
              </Space>
            )}
          </Space>
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={() => tasksQuery.refetch()}>刷新</Button>
        </Col>
      </Row>

      <Card size="small" style={{ marginBottom: 16, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
        <Row align="middle" gutter={16}>
          <Col flex="auto">
            <Progress percent={progressPct} strokeColor="var(--accent-cyan)" trailColor="var(--border-subtle)" format={() => `${progressPct}%`} />
          </Col>
          <Col>
            <Text type="secondary" style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>{doneCount}/{rootTasks.length}</Text>
          </Col>
        </Row>
      </Card>

      {/* 需求 8：任务执行流程（体现完成先后） + 承接人员与各自完成情况 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={14}>
          <Card
            size="small"
            title="任务执行流程"
            extra={<Text type="secondary" style={{ fontSize: 12 }}>按计划时间排序，体现任务先后</Text>}
          >
            {flowTasks.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary">暂无任务</Text>} />
            ) : (
              <Timeline
                items={flowTasks.slice(0, 12).map((t: Task, i: number) => ({
                  color:
                    t.status === 'done' ? 'green'
                      : t.status === 'in_progress' ? 'blue'
                        : t.status === 'blocked' ? 'red'
                          : 'gray',
                  children: (
                    <Space wrap size={6}>
                      <Text type="secondary" style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                        {String(i + 1).padStart(2, '0')}
                      </Text>
                      <Text
                        delete={t.status === 'done'}
                        type={t.status === 'done' ? 'secondary' : undefined}
                        style={{ fontSize: 13 }}
                      >
                        {t.title}
                      </Text>
                      <Tag color={TASK_PRIORITY_META[t.priority].color} style={{ fontSize: 10 }}>
                        {TASK_PRIORITY_META[t.priority].label}
                      </Tag>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {t.assigneeId
                          ? mockUsers.find((u) => u.id === t.assigneeId)?.displayName ?? t.assigneeId.slice(0, 8)
                          : '待承接'}
                      </Text>
                      {t.dueAt && (
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {dayjs(t.dueAt).format('MM-DD 截止')}
                        </Text>
                      )}
                    </Space>
                  ),
                }))}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card
            size="small"
            title="承接人员"
            extra={<Text type="secondary" style={{ fontSize: 12 }}>待承接 {unassignedCount} 项</Text>}
          >
            {mockUsers.map((u) => {
              const list = activeTasks.filter((t) => t.assigneeId === u.id)
              if (list.length === 0) return null
              const done = list.filter((t) => t.status === 'done').length
              const pct = Math.round((done / list.length) * 100)
              return (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <Avatar size={28} icon={<UserOutlined />} style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <Text style={{ fontSize: 12 }}>{u.displayName}</Text>
                      <Text type="secondary" style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                        {done}/{list.length}
                      </Text>
                    </div>
                    <Progress
                      percent={pct}
                      size="small"
                      showInfo={false}
                      strokeColor="var(--accent-cyan)"
                      trailColor="var(--border-subtle)"
                    />
                  </div>
                </div>
              )
            })}
            {activeTasks.every((t) => !t.assigneeId) && (
              <Text type="secondary" style={{ fontSize: 12 }}>该项目任务尚未分配承接人</Text>
            )}
          </Card>
        </Col>
      </Row>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, alignItems: 'start' }}>
        {columns.map((col) => (
          <Card
            key={col.status}
            title={
              <Space>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: col.color, boxShadow: `0 0 6px ${col.color}` }} />
                <Text strong style={{ color: 'var(--text-primary)' }}>{col.label}</Text>
                <Text type="secondary" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{col.tasks.length}</Text>
              </Space>
            }
            styles={{ body: { padding: 8, minHeight: 280, background: 'var(--bg-card)' } }}
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-subtle)' }}
          >
            {col.tasks.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary">暂无任务</Text>} style={{ margin: '40px 0' }} />
            ) : (
              col.tasks.map((t: Task) => <TaskCard key={t.id} task={t} allTasks={allTasks} highlighted={highlightTaskId === t.id} />)
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
