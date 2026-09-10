/**
 * 职责：项目详情页 —— 团队协作项目（kind='project' 的任务）详情
 *
 * 覆盖需求（第三批）：
 * - 需求 3：项目负责人/管理人员可调整项目流程顺序（上移/下移，直接生效）
 * - 需求 4：新增项目内任务（除不能发布项目外，与发布任务一致）；任务新增 = 流程末尾新增节点
 * - 需求 5：项目内任务可删除/修改；删除/修改由管理人员审核后生效（非管理操作进入待审核）
 * - 需求 6：仅管理人员与项目负责人可增删改项目内任务；普通承接人员仅对承接任务有操作权
 * 数据契约：项目 = useWorkspaceTasks 中 kind==='project' 的任务；项目内任务 = projectId===项目.id
 */
import { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Progress,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  PlusOutlined,
  UpOutlined,
} from '@ant-design/icons'
import { Link, useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import type { ColumnsType } from 'antd/es/table'
import { mockMe, mockUsers } from '@/api/mock/data'
import { useLocalStorageState } from '@/hooks/useLocalStorageState'
import { useWorkspaceTasks } from '@/hooks/useWorkspaceTasks'
import { taskRoute } from '@/utils/taskTree'
import type { ApprovalStatus, TaskPriority, WorkspaceTask } from '@/types'
import { APPROVAL_STATUS_META, TASK_PRIORITY_META, TASK_STATUS_META } from '@/types'

const { Title, Text } = Typography
const { RangePicker } = DatePicker
type WorkspaceRole = 'manager' | 'member'

export default function ProjectDetailPage() {
  const navigate = useNavigate()
  const { projectId = '' } = useParams()
  const [tasks, setTasks] = useWorkspaceTasks()
  const [role] = useLocalStorageState<WorkspaceRole>('workspace_role', 'manager')
  const isManager = role === 'manager'

  const project = useMemo(() => tasks.find((t) => t.id === projectId && t.kind === 'project'), [tasks, projectId])

  /** 项目内任务：projectId 指向本项目；草稿与已取消不展示 */
  const projTasks = useMemo(() => {
    if (!project) return []
    return tasks
      .filter((t) => t.projectId === project.id && t.kind !== 'project' && t.status !== 'cancelled' && !t.isDraft)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.createdAt.localeCompare(b.createdAt))
  }, [tasks, project])

  const isProjectOwner = project ? project.createdBy === mockMe.id || project.assigneeId === mockMe.id : false
  /** 需求 6：仅管理/项目负责人可增删改项目内任务 */
  const canManage = isManager || isProjectOwner

  const [addOpen, setAddOpen] = useState(false)
  const [editTask, setEditTask] = useState<WorkspaceTask | null>(null)
  const [form] = Form.useForm()
  const [editForm] = Form.useForm()

  const userName = (id: string | null) =>
    id ? (mockUsers.find((u) => u.id === id)?.displayName ?? id) : '未指派'

  if (!project) {
    return (
      <Card>
        <Empty description="项目不存在或已被删除">
          <Link to="/projects">
            <Button icon={<ArrowLeftOutlined />}>返回项目汇总</Button>
          </Link>
        </Empty>
      </Card>
    )
  }

  const doneCount = projTasks.filter((t) => t.status === 'done').length
  const pendingCount = projTasks.filter((t) => t.approvalStatus === 'pending').length
  const progressPct = projTasks.length > 0 ? Math.round((doneCount / projTasks.length) * 100) : 0

  /** 提交创建项目内任务（需求 4）。管理直接生效；项目负责人（非管理）进入待审核 */
  const createTask = async () => {
    const values = await form.validateFields()
    const range = values.range as [dayjs.Dayjs, dayjs.Dayjs] | null
    const now = new Date().toISOString()
    const needsApproval = !isManager
    const sub: WorkspaceTask = {
      id: `sub-${Date.now()}`, tenantId: 'tenant-001', projectId: project.id, parentId: null,
      title: values.title, description: values.description ?? null,
      status: 'todo',
      priority: (values.priority as TaskPriority) ?? 'medium',
      assigneeId: values.assigneeId ?? null,
      dueAt: range?.[1]?.toISOString() ?? null, estimatedHours: 2, actualHours: null,
      completedAt: null, startedAt: null,
      createdBy: mockMe.id, tags: ['项目任务'], sortOrder: projTasks.length + 1,
      workflowColumnId: null, isAiGenerated: false, version: 1, createdAt: now, updatedAt: now,
      taskMode: 'team', kind: 'task', needReview: false, reviewStatus: 'none',
      proposalStatus: needsApproval ? 'pending' : 'none', participants: [], reviewOfTaskId: null,
      startAt: range?.[0]?.toISOString() ?? null, endAt: range?.[1]?.toISOString() ?? null,
      importance: values.importance ?? 'important', urgencyDegree: values.urgencyDegree ?? 'notUrgent',
      sop: null,
      approvalStatus: needsApproval ? ('pending' as ApprovalStatus) : ('none' as ApprovalStatus),
      approvalType: needsApproval ? 'proposal' : null,
      recommendedAssigneeId: null, pendingContent: null, executionLogs: [], comments: [],
      completion: null, auditLogs: [], dailyPlans: [], isDraft: false,
      pendingDelete: false, pendingSop: null,
    }
    setTasks((c) => {
      // 需求 4：项目 SOP 流程末尾同步追加一个节点（标题同任务）
      const proj = c.find((t) => t.id === project.id && t.kind === 'project')
      const next = c.map((t) =>
        t.id === project.id && t.kind === 'project' && proj?.sop
          ? { ...t, sop: { ...proj.sop, steps: [...proj.sop.steps, { id: `sopn-${Date.now()}`, title: values.title, children: [] }], updatedAt: now } }
          : t,
      )
      return [sub, ...next]
    })
    form.resetFields()
    setAddOpen(false)
    message.success(
      needsApproval
        ? '任务已新增到流程末尾，已推送管理人员审核，通过后生效'
        : '任务已新增到流程末尾',
    )
  }

  /** 提交编辑（需求 5）：管理直接生效；项目负责人（非管理）写入待审核内容变更 */
  const submitEdit = async () => {
    if (!editTask) return
    const values = await editForm.validateFields()
    const now = new Date().toISOString()
    if (isManager) {
      setTasks((c) => c.map((t) => (t.id === editTask.id ? { ...t, title: values.title, description: values.description || null, assigneeId: values.assigneeId ?? t.assigneeId, updatedAt: now } : t)))
      message.success('任务已更新')
    } else {
      setTasks((c) =>
        c.map((t) =>
          t.id === editTask.id
            ? {
                ...t,
                approvalStatus: 'pending' as ApprovalStatus,
                approvalType: 'content' as const,
                pendingContent: { title: values.title, description: values.description ?? '', submittedBy: mockMe.id, submittedAt: now },
                updatedAt: now,
              }
            : t,
        ),
      )
      message.success('修改已推送管理人员审核，通过后生效')
    }
    setEditTask(null)
    editForm.resetFields()
  }

  /** 删除（需求 5）：管理直接删；项目负责人（非管理）标记待删进入审核 */
  const requestDelete = (task: WorkspaceTask) => {
    const now = new Date().toISOString()
    if (isManager) {
      setTasks((c) => c.filter((t) => t.id !== task.id))
      message.success('任务已删除')
    } else {
      setTasks((c) =>
        c.map((t) =>
          t.id === task.id
            ? { ...t, pendingDelete: true, approvalStatus: 'pending' as ApprovalStatus, updatedAt: now }
            : t,
        ),
      )
      message.success('删除请求已推送管理人员审核')
    }
  }

  /** 需求 3：调整流程顺序 —— 上移/下移任务并同步项目 SOP 步骤顺序 */
  const moveFlow = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= projTasks.length) return
    const ordered = [...projTasks]
    const [a] = ordered.splice(index, 1)
    ordered.splice(target, 0, a)
    const now = new Date().toISOString()
    const orderMap = new Map(ordered.map((t, i) => [t.id, i + 1]))
    // 任务 sortOrder 与项目 SOP steps 顺序同步
    const sopProject = tasks.find((t) => t.id === project.id && t.kind === 'project')
    const steps = sopProject?.sop?.steps ? [...sopProject.sop.steps] : []
    const byTitle = new Map(projTasks.map((t) => [t.title, t.id]))
    const sortedSteps = ordered.map((t) => steps.find((s) => s.title === t.title) ?? steps.find((s) => s.title === byTitle.get(t.id))).filter(Boolean) as typeof steps
    setTasks((c) =>
      c.map((t) => {
        if (t.id === project.id && t.kind === 'project' && sopProject?.sop && sortedSteps.length === ordered.length) {
          return { ...t, sop: { ...sopProject.sop, steps: sortedSteps, updatedAt: now }, updatedAt: now }
        }
        const nextOrder = orderMap.get(t.id)
        if (nextOrder) return { ...t, sortOrder: nextOrder, updatedAt: now }
        return t
      }),
    )
  }

  const openEdit = (task: WorkspaceTask) => {
    setEditTask(task)
    editForm.setFieldsValue({ title: task.title, description: task.description ?? '', assigneeId: task.assigneeId ?? undefined })
  }

  const columns: ColumnsType<WorkspaceTask> = [
    {
      title: '#',
      width: 50,
      render: (_, __, i) => <Text style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>{String(i + 1).padStart(2, '0')}</Text>,
    },
    {
      title: '任务名称',
      dataIndex: 'title',
      render: (title: string, record) => (
        <Space direction="vertical" size={2}>
          <Link to={taskRoute(tasks, record)} style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>
            {title}
          </Link>
          <Space size={4}>
            {record.approvalStatus === 'pending' && record.pendingDelete && <Tag color="red" style={{ fontSize: 10 }}>待审核删除</Tag>}
            {record.approvalStatus === 'pending' && record.approvalType === 'content' && <Tag color="gold" style={{ fontSize: 10 }}>修改待审核</Tag>}
            {record.approvalStatus === 'pending' && record.approvalType === 'proposal' && <Tag color="gold" style={{ fontSize: 10 }}>待审核生效</Tag>}
            {record.sop && <Tag color="blue" style={{ fontSize: 10 }}>含流程</Tag>}
          </Space>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (s: WorkspaceTask['status']) => <Tag color={TASK_STATUS_META[s].color}>{TASK_STATUS_META[s].label}</Tag>,
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      width: 80,
      render: (p: WorkspaceTask['priority']) => <Tag color={TASK_PRIORITY_META[p].color}>{TASK_PRIORITY_META[p].label}</Tag>,
    },
    {
      title: '负责人',
      dataIndex: 'assigneeId',
      width: 110,
      render: (id) => userName(id),
    },
    {
      title: '截止日期',
      dataIndex: 'dueAt',
      width: 120,
      render: (v) => (v ? dayjs(v).format('YYYY-MM-DD') : '-'),
    },
    ...(canManage
      ? [
          {
            title: '流程顺序',
            width: 110,
            render: (_: unknown, __: WorkspaceTask, i: number) => (
              <Space size={2}>
                <Button size="small" type="text" icon={<UpOutlined />} disabled={i === 0} onClick={() => moveFlow(i, -1)} />
                <Button size="small" type="text" icon={<DownOutlined />} disabled={i === projTasks.length - 1} onClick={() => moveFlow(i, 1)} />
              </Space>
            ),
          } as ColumnsType<WorkspaceTask>[number],
        ]
      : []),
    ...(canManage
      ? [
          {
            title: '操作',
            width: 140,
            render: (_: unknown, record: WorkspaceTask) => (
              <Space size={0}>
                <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>修改</Button>
                <Popconfirm
                  title="确认删除该任务？"
                  description={isManager ? '将删除任务及流程节点' : '删除需管理人员审核通过后生效'}
                  onConfirm={() => requestDelete(record)}
                >
                  <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              </Space>
            ),
          } as ColumnsType<WorkspaceTask>[number],
        ]
      : []),
  ]

  return (
    <div>
      <Row align="middle" justify="space-between" style={{ marginBottom: 8 }}>
        <Col>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/projects')}>返回</Button>
            <Title level={3} style={{ margin: 0, color: 'var(--text-primary)' }}>{project.title}</Title>
            <Tag color="purple">团队协作项目</Tag>
            <Tag color={APPROVAL_STATUS_META[project.approvalStatus]?.color ?? 'default'}>
              {project.approvalStatus === 'pending' ? '项目审核中' : '项目已生效'}
            </Tag>
          </Space>
        </Col>
        {canManage && (
          <Col>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.setFieldsValue({ priority: 'medium' }); setAddOpen(true) }}>
              新增项目任务
            </Button>
          </Col>
        )}
      </Row>

      {project.approvalStatus === 'pending' && (
        <Alert type="warning" showIcon message="该项目仍在管理人员审核中，审核通过后将按 SOP 自动生成项目内任务。" style={{ marginBottom: 16 }} />
      )}

      <Card size="small" style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2, md: 4 }} size="small" colon={false}>
          <Descriptions.Item label="项目负责人">{userName(project.assigneeId)}（{project.createdBy === mockMe.id ? '我' : userName(project.createdBy)} 创建）</Descriptions.Item>
          <Descriptions.Item label="周期">
            {project.startAt && project.endAt
              ? `${dayjs(project.startAt).format('YYYY-MM-DD')} ~ ${dayjs(project.endAt).format('YYYY-MM-DD')}`
              : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="任务进度">
            <Space>
              <Progress percent={progressPct} size="small" style={{ width: 140 }} />
              <Text type="secondary" style={{ fontSize: 12 }}>{doneCount}/{projTasks.length}</Text>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="待审核">{pendingCount} 项</Descriptions.Item>
        </Descriptions>
        {project.description && (
          <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>{project.description}</Text>
        )}
      </Card>

      {!canManage && (
        <Alert type="info" showIcon message="项目内任务仅管理人员与项目负责人可新增/修改/删除；你作为承接人员，可在自己承接任务的执行页中操作。" style={{ marginBottom: 16 }} />
      )}

      <Card
        title={<Space><Text strong>项目流程</Text><Text type="secondary" style={{ fontSize: 12 }}>任务即流程节点，顺序即执行顺序（仅管理/负责人可调整）</Text></Space>}
        styles={{ body: { paddingTop: 8 } }}
      >
        <Table<WorkspaceTask>
          rowKey="id"
          size="middle"
          dataSource={projTasks}
          columns={columns}
          pagination={false}
          locale={{ emptyText: <Empty description={project.approvalStatus === 'pending' ? '项目审核通过后将按 SOP 自动生成任务' : '暂无项目任务，点击右上角新增'} /> }}
        />
      </Card>

      {/* 新增任务（需求 4：除不能发布项目外，其余与发布任务一致） */}
      <Modal
        title="新增项目任务"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={createTask}
        okText={isManager ? '新增并生效' : '提报审核'}
        cancelText="取消"
        width={560}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" initialValues={{ priority: 'medium', importance: 'important', urgencyDegree: 'notUrgent' }}>
          <Form.Item name="title" label="任务标题" rules={[{ required: true, message: '请输入任务标题' }]}>
            <Input placeholder="例如：完成首页设计稿" />
          </Form.Item>
          <Form.Item name="description" label="任务描述">
            <Input.TextArea rows={2} placeholder="可选" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="priority" label="优先级">
                <Select options={Object.entries(TASK_PRIORITY_META).map(([v, m]) => ({ value: v, label: m.label }))} />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="assigneeId" label="承接人">
                <Select allowClear placeholder="待承接（可不指派）" options={mockUsers.map((u) => ({ value: u.id, label: u.displayName }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="range" label="排期">
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
          {!isManager && (
            <Alert type="warning" showIcon message="新增任务需管理人员审核通过后才生效，并自动追加为项目流程末尾节点。" />
          )}
        </Form>
      </Modal>

      {/* 修改任务 */}
      <Modal
        title={isManager ? '修改项目任务' : '修改项目任务（需管理审核）'}
        open={Boolean(editTask)}
        onCancel={() => setEditTask(null)}
        onOk={submitEdit}
        okText="提交"
        cancelText="取消"
        width={560}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="title" label="任务标题" rules={[{ required: true, message: '请输入任务标题' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="任务描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="assigneeId" label="承接人">
            <Select allowClear placeholder="待承接" options={mockUsers.map((u) => ({ value: u.id, label: u.displayName }))} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
