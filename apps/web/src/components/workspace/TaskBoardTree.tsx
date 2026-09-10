/**
 * TaskBoardTree.tsx —— 任务树 / 看板视图
 *
 * 覆盖需求：
 * - 需求 3：拆解出的子任务明确展示在主任务下（父任务为主节点，子任务缩进并可折叠）
 * - 需求 8：任务分类保持待办 / 进行中 / 已完成三列；同时提供树形视图
 * - 需求 5：评审任务标记与审批门禁（评审未完成不可审批通过）
 * - 需求 6：管理人员可编辑未承接任务
 * - 需求 7：待审核的提报任务不进入任务看板（由调用方过滤）
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  Col,
  Empty,
  Form,
  Modal,
  Row,
  Segmented,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  CheckCircleOutlined,
  DownOutlined,
  RightOutlined,
  BranchesOutlined,
  EditOutlined,
  AuditOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { mockUsers } from '@/api/mock/data'
import type { TaskStatus, WorkspaceTask } from '@/types'
import {
  APPROVAL_TYPE_META,
  BOARD_COLUMNS,
  PROPOSAL_STATUS_META,
  REVIEW_STATUS_META,
  TASK_KIND_META,
  TASK_MODE_META,
  TASK_PRIORITY_META,
} from '@/types'
import { buildTaskTree, flattenTaskTree, getSubtreeProgress, type TaskNode } from '@/utils/taskTree'

const { Text } = Typography

export type WorkspaceRole = 'manager' | 'member'

export interface TaskBoardActions {
  onClaim: (task: WorkspaceTask) => void
  onEdit: (task: WorkspaceTask) => void
  onMerge: (task: WorkspaceTask) => void
  onComplete: (task: WorkspaceTask) => void
  onApprove: (task: WorkspaceTask) => void
  onOpenReview: (task: WorkspaceTask) => void
  /** 管理重新指派承接人（需求 1） */
  onReassign?: (task: WorkspaceTask, assigneeId: string) => void
  /** 打开任务执行页（需求 2） */
  onOpenExecution: (task: WorkspaceTask) => void
}

interface Props extends TaskBoardActions {
  tasks: WorkspaceTask[]
  role: WorkspaceRole
  currentUserId: string
}

const statusLabels: Record<TaskStatus, string> = {
  todo: '待办',
  in_progress: '进行中',
  blocked: '阻塞',
  done: '已完成',
  cancelled: '已取消',
}

export default function TaskBoardTree({
  tasks,
  role,
  currentUserId,
  onClaim,
  onEdit,
  onMerge,
  onComplete,
  onApprove,
  onOpenReview,
  onReassign,
  onOpenExecution,
}: Props) {
  const navigate = useNavigate()
  const [view, setView] = useState<'tree' | 'board'>('tree')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [reassignForm] = Form.useForm()
  const [reassignTarget, setReassignTarget] = useState<WorkspaceTask | null>(null)
  /** 看板视图的承接状态分类切换（需求：待承接 / 已承接） */
  const [boardClaim, setBoardClaim] = useState<'pending' | 'claimed'>('claimed')

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const tree = useMemo(() => buildTaskTree(tasks), [tasks])

  /** 父级任务集合（含下级子任务的主任务），用于让主任务也展示「执行页」入口 */
  const parentIdSet = useMemo(
    () => new Set(tasks.filter((t) => tasks.some((x) => x.parentId === t.id)).map((t) => t.id)),
    [tasks],
  )

  const userName = (id: string | null) =>
    id ? (mockUsers.find((u) => u.id === id)?.displayName ?? '已指派') : null

  const renderActions = (task: WorkspaceTask, treeView = false) => {
    const buttons: React.ReactNode[] = []
    const isManager = role === 'manager'
    const unassigned = !task.assigneeId
    const mine = task.assigneeId === currentUserId

    if (task.kind === 'review') {
      // 评审任务：管理员处理评审
      if (isManager && task.status !== 'done') {
        buttons.push(
          <Button key="review" type="primary" size="small" icon={<AuditOutlined />} onClick={() => onOpenReview(task)}>
            处理评审
          </Button>,
        )
      }
      return <Space size={4} wrap>{buttons}</Space>
    }

    if (task.kind === 'plan') {
      // 个人计划：仅展示，不做流转
      return null
    }

    // 需求：树形视图下所有任务都展示「执行页」入口；看板视图保留原逻辑（已承接/含下级）
    const executionReady = treeView
      ? task.kind === 'task'
      : Boolean(task.assigneeId) || parentIdSet.has(task.id)
    if (executionReady) {
      buttons.push(
        <Button key="exec" type="link" size="small" onClick={() => onOpenExecution(task)}>
          执行页
        </Button>,
      )
    }

    // 成员：承接未指派任务
    if (!isManager && unassigned && task.status === 'todo') {
      buttons.push(
        <Button key="claim" type="link" size="small" onClick={() => onClaim(task)}>
          承接
        </Button>,
      )
    }

    // 成员：提报完成
    if (mine && (task.status === 'in_progress' || task.status === 'todo' || task.status === 'blocked')) {
      buttons.push(
        <Button key="done" type="link" size="small" icon={<CheckCircleOutlined />} onClick={() => onComplete(task)}>
          {task.needReview ? '提报完成' : '标记完成'}
        </Button>,
      )
    }

    // 管理员：编辑未承接任务（需求 6）
    if (isManager && unassigned) {
      buttons.push(
        <Button key="edit" type="link" size="small" icon={<EditOutlined />} onClick={() => onEdit(task)}>
          编辑
        </Button>,
      )
    }

    // 管理员：合并任务（需求 9）
    if (isManager && task.kind === 'task') {
      buttons.push(
        <Button key="merge" type="link" size="small" icon={<BranchesOutlined />} onClick={() => onMerge(task)}>
          合并
        </Button>,
      )
    }

    // 管理员：重新指派承接人（需求 1）—— 所有任务均可改派
    if (isManager && onReassign) {
      buttons.push(
        <Button
          key="reassign"
          type="link"
          size="small"
          onClick={() => {
            reassignForm.setFieldsValue({ assigneeId: task.assigneeId ?? undefined })
            setReassignTarget(task)
          }}
        >
          重新指派
        </Button>,
      )
    }

    // 管理员：审批通过（需求 5：开启评审的任务必须评审通过后才可审批）
    if (isManager && task.status !== 'done') {
      const reviewBlocked = task.needReview && task.reviewStatus !== 'passed'
      if (reviewBlocked) {
        buttons.push(
          <Tooltip key="wait" title="该任务开启了完成评审，需评审任务完成后才能审批通过">
            <span>
              <Button type="link" size="small" disabled icon={<AuditOutlined />}>
                待评审
              </Button>
            </span>
          </Tooltip>,
        )
      } else {
        buttons.push(
          <Button key="approve" type="link" size="small" icon={<CheckCircleOutlined />} onClick={() => onApprove(task)}>
            审批通过
          </Button>,
        )
      }
    }

    return buttons.length > 0 ? <Space size={4} wrap>{buttons}</Space> : null
  }

  const renderRow = (node: TaskNode) => {
    const { task, depth, children } = node
    const hasChildren = children.length > 0
    const isCollapsed = collapsed.has(task.id)
    const progress = getSubtreeProgress(tasks, task.id)
    const overdue = task.endAt && dayjs(task.endAt).isBefore(dayjs()) && task.status !== 'done'

    return (
      <div
        key={task.id}
        style={{
          paddingLeft: depth * 22,
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 4px',
            background: depth === 0 ? 'var(--bg-card-raised)' : 'transparent',
          }}
        >
          <span style={{ width: 16, flexShrink: 0 }}>
            {hasChildren ? (
              <Button
                type="text"
                size="small"
                style={{ padding: 0, minWidth: 16, height: 16 }}
                icon={isCollapsed ? <RightOutlined /> : <DownOutlined />}
                onClick={() => toggle(task.id)}
              />
            ) : null}
          </span>

          <div style={{ flex: 1, minWidth: 0 }}>
            <Space wrap size={4}>
              <Text
                strong={depth === 0}
                delete={task.status === 'done'}
                type={task.status === 'done' ? 'secondary' : undefined}
                style={{ fontSize: depth === 0 ? 14 : 13 }}
              >
                {task.title}
              </Text>
              {depth === 0 && hasChildren && (
                <Tag color="blue" style={{ fontSize: 11 }}>
                  主任务 · {children.length} 项子任务
                </Tag>
              )}
              {depth > 0 && <Tag style={{ fontSize: 11 }}>子任务</Tag>}
              <Tag color={TASK_PRIORITY_META[task.priority].color} style={{ fontSize: 11 }}>
                {TASK_PRIORITY_META[task.priority].label}
              </Tag>
              <Tag style={{ fontSize: 11 }}>{statusLabels[task.status]}</Tag>
              {task.kind !== 'task' && (
                <Tag color={TASK_KIND_META[task.kind].color} style={{ fontSize: 11 }}>
                  {TASK_KIND_META[task.kind].label}
                </Tag>
              )}
              {task.taskMode === 'individual' && (
                <Tag color={TASK_MODE_META.individual.color} style={{ fontSize: 11 }}>
                  {TASK_MODE_META.individual.label}
                </Tag>
              )}
              {task.reviewStatus !== 'none' && (
                <Tag color={REVIEW_STATUS_META[task.reviewStatus].color} style={{ fontSize: 11 }}>
                  {REVIEW_STATUS_META[task.reviewStatus].label}
                </Tag>
              )}
              {task.proposalStatus !== 'none' && (
                <Tag color={PROPOSAL_STATUS_META[task.proposalStatus].color} style={{ fontSize: 11 }}>
                  {PROPOSAL_STATUS_META[task.proposalStatus].label}
                </Tag>
              )}
              {/* 需求 3：凡需审核的事项，任务表统一显示「待审核」 */}
              {task.approvalStatus === 'pending' && (
                <Tag color="gold" style={{ fontSize: 11 }}>
                  待审核
                  {task.approvalType ? ` · ${APPROVAL_TYPE_META[task.approvalType].label}` : ''}
                </Tag>
              )}
              {overdue && (
                <Tag color="error" style={{ fontSize: 11 }}>
                  逾期
                </Tag>
              )}
              {task.isAiGenerated && (
                <Tag color="purple" style={{ fontSize: 11 }}>
                  AI 生成
                </Tag>
              )}
            </Space>
            <div style={{ marginTop: 4 }}>
              <Space size={8} wrap>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {task.assigneeId ? (
                    <>
                      <UserOutlined /> {userName(task.assigneeId)}
                    </>
                  ) : (
                    '待承接'
                  )}
                </Text>
                {task.participants.length > 0 && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    <TeamOutlined /> 评审 {task.participants.length} 人
                  </Text>
                )}
                {task.startAt && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {dayjs(task.startAt).format('MM-DD HH:mm')} ~ {dayjs(task.endAt ?? task.dueAt).format('MM-DD HH:mm')}
                  </Text>
                )}
                {task.estimatedHours ? (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    估时 {task.estimatedHours}h
                  </Text>
                ) : null}
                {hasChildren && progress.total > 0 && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    子任务 {progress.done}/{progress.total}（{progress.percent}%）
                  </Text>
                )}
              </Space>
            </div>
          </div>

          <div style={{ flexShrink: 0 }}>{renderActions(task, true)}</div>
        </div>
      </div>
    )
  }

  const renderTree = () => {
    const rows = flattenTaskTree(tree, collapsed)
    if (rows.length === 0) return <Empty description="暂无任务" />
    return <div>{rows.map(renderRow)}</div>
  }

  // 需求 8：看板视图使用独立的紧凑卡片，不再复用树形视图的整行布局
  const renderBoardCard = (task: WorkspaceTask, depth: number) => {
    const overdue = task.endAt && dayjs(task.endAt).isBefore(dayjs()) && task.status !== 'done'
    const executionReady = Boolean(task.assigneeId)
    const isSubtask = depth > 0
    const hasChildren = tasks.some((t) => t.parentId === task.id)

    // 需求 4：点击卡片主体/标题 —— 父级任务（或含下级）进详情页；叶子子任务已承接进执行页；未承接管理员可编辑
    const handleCardClick = () => {
      if (hasChildren || task.parentId === null) navigate(`/tasks/${task.id}`)
      else if (executionReady) onOpenExecution(task)
      else if (role === 'manager' && !task.assigneeId) onEdit(task)
    }

    return (
      <Card
        key={task.id}
        size="small"
        hoverable
        styles={{ body: { padding: 12 } }}
        style={{
          background: 'var(--bg-card-raised)',
          borderColor: 'var(--border-subtle)',
          cursor: 'pointer',
          marginBottom: 10,
        }}
        onClick={handleCardClick}
      >
        {/* 标题：最多两行，超出省略，避免逐字换行 */}
        <div
          title={task.title}
          style={{
            marginBottom: 6,
            fontWeight: isSubtask ? 400 : 600,
            textDecoration: task.status === 'done' ? 'line-through' : undefined,
            color: task.status === 'done' ? 'var(--text-secondary)' : undefined,
            fontSize: isSubtask ? 13 : 14,
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {task.title}
        </div>

        {/* 标签行：优先级 / 状态 / 逾期等在同一行，wrap 时对齐 */}
        <Space size={4} wrap style={{ marginBottom: 6, width: '100%' }}>
          {isSubtask && (
            <Tag style={{ fontSize: 11, margin: 0 }}>子任务</Tag>
          )}
          <Tag color={TASK_PRIORITY_META[task.priority].color} style={{ fontSize: 11, margin: 0 }}>
            {TASK_PRIORITY_META[task.priority].label}
          </Tag>
          <Tag style={{ fontSize: 11, margin: 0 }}>{statusLabels[task.status]}</Tag>
          {task.kind !== 'task' && (
            <Tag color={TASK_KIND_META[task.kind].color} style={{ fontSize: 11, margin: 0 }}>
              {TASK_KIND_META[task.kind].label}
            </Tag>
          )}
          {task.taskMode === 'individual' && (
            <Tag color={TASK_MODE_META.individual.color} style={{ fontSize: 11, margin: 0 }}>
              {TASK_MODE_META.individual.label}
            </Tag>
          )}
          {task.reviewStatus !== 'none' && (
            <Tag color={REVIEW_STATUS_META[task.reviewStatus].color} style={{ fontSize: 11, margin: 0 }}>
              {REVIEW_STATUS_META[task.reviewStatus].label}
            </Tag>
          )}
          {task.proposalStatus !== 'none' && (
            <Tag color={PROPOSAL_STATUS_META[task.proposalStatus].color} style={{ fontSize: 11, margin: 0 }}>
              {PROPOSAL_STATUS_META[task.proposalStatus].label}
            </Tag>
          )}
          {task.approvalStatus === 'pending' && (
            <Tag color="gold" style={{ fontSize: 11, margin: 0 }}>
              待审核{task.approvalType ? ` · ${APPROVAL_TYPE_META[task.approvalType].label}` : ''}
            </Tag>
          )}
          {overdue && (
            <Tag color="error" style={{ fontSize: 11, margin: 0 }}>
              逾期
            </Tag>
          )}
          {task.isAiGenerated && (
            <Tag color="purple" style={{ fontSize: 11, margin: 0 }}>
              AI 生成
            </Tag>
          )}
        </Space>

        {/* 元信息行：负责人 / 时间 / 估时，统一 11px 次要色 */}
        <div style={{ marginBottom: 8 }}>
          <Space size={10} wrap>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {task.assigneeId ? (
                <>
                  <UserOutlined /> {userName(task.assigneeId)}
                </>
              ) : (
                '待承接'
              )}
            </Text>
            {task.participants.length > 0 && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                <TeamOutlined /> 评审 {task.participants.length} 人
              </Text>
            )}
            {task.startAt && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                {dayjs(task.startAt).format('MM-DD HH:mm')} ~ {dayjs(task.endAt ?? task.dueAt).format('MM-DD HH:mm')}
              </Text>
            )}
            {task.estimatedHours ? (
              <Text type="secondary" style={{ fontSize: 11 }}>
                估时 {task.estimatedHours}h
              </Text>
            ) : null}
          </Space>
        </div>

        {/* 操作行：底部右对齐，阻止事件冒泡以免误触发卡片跳转 */}
        <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', justifyContent: 'flex-end' }}>
          {renderActions(task)}
        </div>
      </Card>
    )
  }

  const renderBoard = () => {
    // 按承接状态分类：待承接（无负责人）/ 已承接（有负责人）
    const claimFiltered = tasks.filter((t) =>
      boardClaim === 'pending' ? !t.assigneeId : Boolean(t.assigneeId),
    )
    const pendingCount = tasks.filter((t) => !t.assigneeId).length
    const claimedCount = tasks.filter((t) => Boolean(t.assigneeId)).length
    return (
      <>
        <Segmented
          value={boardClaim}
          onChange={(v) => setBoardClaim(v as 'pending' | 'claimed')}
          style={{ marginBottom: 12 }}
          options={[
            { value: 'pending', label: `待承接 (${pendingCount})` },
            { value: 'claimed', label: `已承接 (${claimedCount})` },
          ]}
        />
        <Row gutter={[12, 12]}>
          {BOARD_COLUMNS.map((col) => {
            const colTasks = claimFiltered.filter((t) => t.status === col.status && (t.parentId ?? null) === null)
        const colTree = buildTaskTree(colTasks)
        const rows = flattenTaskTree(colTree, new Set())
        return (
          <Col xs={24} md={8} key={col.status}>
            <div
              style={{
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '8px 12px',
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text strong>{col.label}</Text>
                <Tag>{rows.length}</Tag>
              </div>
              <div style={{ minHeight: 120, padding: '10px 10px 0' }}>
                {rows.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center' }}>
                    <Text type="secondary">暂无任务</Text>
                  </div>
                ) : (
                  rows.map((n) => renderBoardCard(n.task, n.depth))
                )}
              </div>
            </div>
          </Col>
        )
      })}
        </Row>
      </>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text type="secondary">
          树形视图按父子层级展示，子任务缩进在主任务下；看板视图保持待办 / 进行中 / 已完成三分类
        </Text>
        <Segmented
          value={view}
          onChange={(v) => setView(v as 'tree' | 'board')}
          options={[
            { value: 'tree', label: '树形视图' },
            { value: 'board', label: '看板视图' },
          ]}
        />
      </div>
      {view === 'tree' ? renderTree() : renderBoard()}
      <Form
        form={reassignForm}
        layout="vertical"
        onFinish={(values: { assigneeId: string }) => {
          if (reassignTarget && onReassign) onReassign(reassignTarget, values.assigneeId)
          setReassignTarget(null)
        }}
      >
        <Modal
          title="重新指派承接人"
          open={Boolean(reassignTarget)}
          onCancel={() => setReassignTarget(null)}
          onOk={() => reassignForm.submit()}
          okText="确认改派"
          cancelText="取消"
          destroyOnHidden
        >
          <Form.Item
            name="assigneeId"
            label="新的承接人"
            rules={[{ required: true, message: '请选择承接人' }]}
          >
            <Select
              placeholder="选择新的承接人"
              options={mockUsers.map((u) => ({ value: u.id, label: u.displayName }))}
            />
          </Form.Item>
        </Modal>
      </Form>
    </div>
  )
}
