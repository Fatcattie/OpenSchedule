/**
 * 职责：审核中心 —— 按角色展示所有提报审核事项
 *
 * 覆盖需求：
 * - 需求 4：四栏展示（待提报 / 待审核 / 审核通过 / 撤回审核），右侧按日期筛选历史
 * - 需求 5：管理人员可查看/修改/审核/撤回；普通人员仅看自己相关
 * - 需求 6：撤回审核退回提报人【待提报】栏
 * - 需求 7：审核必须选择意见（同意/不通过/退回重改/其他），其他需手写原因；悬停展示原因
 */
import { useMemo, useState, type ReactNode } from 'react'
import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Form,
  Input,
  List,
  message,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Statistic,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { AuditOutlined, EditOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { useCurrentRole } from '@/hooks/useCurrentRole'
import { useWorkspaceTasks } from '@/hooks/useWorkspaceTasks'
import { useTaskReview } from '@/hooks/useTaskReview'
import { useDirectory, useMe } from '@/hooks/useWorkspaceIdentity'
import type { AuditLog, WorkspaceTask } from '@/types'
import {
  APPROVAL_TYPE_META,
  TASK_PRIORITY_META,
  TASK_STATUS_META,
} from '@/types'

const { Title, Text } = Typography

const OPINION_OPTIONS = [
  { value: 'agree', label: '同意' },
  { value: 'reject', label: '不通过' },
  { value: 'rework', label: '退回重改' },
  { value: 'other', label: '其他' },
]

const OPINION_META: Record<string, { label: string; color: string }> = {
  agree: { label: '同意', color: 'green' },
  reject: { label: '不通过', color: 'red' },
  rework: { label: '退回重改', color: 'orange' },
  other: { label: '其他', color: 'default' },
}

/** 判断任务是否与当前用户相关（创建/承接/参与） */
function isTaskRelated(task: WorkspaceTask, userId: string, manager: boolean) {
  if (manager) return true
  if (task.assigneeId === userId || task.createdBy === userId) return true
  if (task.participants?.includes(userId)) return true
  return false
}

export default function AuditPage() {
  const navigate = useNavigate()
  const [tasks, setTasks] = useWorkspaceTasks()
  const review = useTaskReview()
  const currentUser = useMe()
  const { teamMembers, nameOf } = useDirectory()
  const role = useCurrentRole()
  const isManager = role === 'manager'

  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [auditTask, setAuditTask] = useState<WorkspaceTask | null>(null)
  const [editTask, setEditTask] = useState<WorkspaceTask | null>(null)
  const [auditForm] = Form.useForm()
  const [editForm] = Form.useForm()

  const userName = (id: string | null) =>
    id ? (nameOf(id) ?? id) : '未指派'

  const gotoBoard = (task: WorkspaceTask) => {
    // 需求 5：项目内的任务 → 跳项目看板详情页；团队协作项目 → 项目详情页；否则 → 任务详情/执行页
    if (task.kind === 'project') {
      navigate(`/projects/${task.id}`)
    } else if (task.projectId && tasks.some((t) => t.id === task.projectId && t.kind === 'project')) {
      navigate(`/projects/${task.projectId}`)
    } else if (task.projectId) {
      navigate(`/projects/${task.projectId}/board?taskId=${task.id}`)
    } else {
      navigate(`/tasks/${task.id}`)
    }
  }

  /** 需求 5：普通人员仅看自己相关 */
  const relatedTasks = useMemo(
    () => tasks.filter((t) => isTaskRelated(t, currentUser.id, isManager)),
    [tasks, isManager, currentUser.id],
  )

  /** 待提报：相关任务中，非 review、未完成、未在审核中 */
  const pendingReport = relatedTasks.filter(
    (t) =>
      t.kind !== 'review' &&
      t.status !== 'done' &&
      t.status !== 'cancelled' &&
      t.approvalStatus !== 'pending',
  )

  /** 待审核 */
  const pendingAudit = relatedTasks.filter((t) => t.approvalStatus === 'pending')

  /** 审核通过（可按日期筛选） */
  const approved = relatedTasks.filter((t) => t.approvalStatus === 'approved')
  const approvedFiltered = useMemo(() => {
    if (!dateRange) return approved
    return approved.filter((t) => {
      const last = [...t.auditLogs].reverse().find((l) => l.action === 'approve')
      if (!last) return false
      const d = dayjs(last.createdAt)
      return d.isAfter(dayjs(dateRange[0]).startOf('day')) && d.isBefore(dayjs(dateRange[1]).endOf('day'))
    })
  }, [approved, dateRange])

  /** 撤回审核历史：auditLogs 中 reject/withdraw，按日期筛选 */
  const withdrawnLogs = useMemo(() => {
    const logs: (AuditLog & { task: WorkspaceTask })[] = []
    relatedTasks.forEach((t) => {
      t.auditLogs.forEach((l) => {
        if (l.action === 'approve') return
        const d = dayjs(l.createdAt)
        if (!dateRange || (d.isAfter(dayjs(dateRange[0]).startOf('day')) && d.isBefore(dayjs(dateRange[1]).endOf('day')))) {
          logs.push({ ...l, task: t })
        }
      })
    })
    return logs.sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf())
  }, [relatedTasks, dateRange])

  /**
   * 审核动作（D-07 二期）：走审核命令，规则与副作用（完成闭环与 SOP 沉淀、内容/承接人生效、
   * 删除级联、项目按 SOP 生成任务、审核留痕）由服务端执行；失败保留弹窗。
   */
  const submitAudit = async (values: {
    action: 'approve' | 'reject' | 'withdraw'
    opinion: 'agree' | 'reject' | 'rework' | 'other'
    reason: string
  }) => {
    if (!auditTask) return
    const res = await review(auditTask.id, { action: values.action, opinion: values.opinion, reason: values.reason })
    if (!res) return
    setAuditTask(null)
    auditForm.resetFields()
    const label = values.action === 'approve' ? '审核已通过' : values.action === 'reject' ? '已驳回' : '已撤回'
    const extra = res.generated > 0 ? `，已按 SOP 生成 ${res.generated} 个项目内任务` : res.sopArchived ? '，SOP 已沉淀' : ''
    message.success(label + extra)
  }

  const submitEdit = (values: { title: string; description: string; assigneeId?: string }) => {
    if (!editTask) return
    setTasks((c) =>
      c.map((t) =>
        t.id === editTask.id
          ? {
              ...t,
              title: values.title,
              description: values.description || null,
              assigneeId: values.assigneeId ?? t.assigneeId,
              updatedAt: new Date().toISOString(),
            }
          : t,
      ),
    )
    setEditTask(null)
    editForm.resetFields()
  }

  const openAudit = (task: WorkspaceTask) => {
    setAuditTask(task)
    auditForm.setFieldsValue({ action: 'approve', opinion: 'agree', reason: '' })
  }

  const openEdit = (task: WorkspaceTask) => {
    setEditTask(task)
    editForm.setFieldsValue({
      title: task.title,
      description: task.description ?? '',
      assigneeId: task.assigneeId ?? undefined,
    })
  }

  const renderTaskCard = (task: WorkspaceTask, actions: ReactNode) => (
    <Card
      size="small"
      hoverable
      style={{ marginBottom: 10, borderColor: 'var(--border-subtle)', background: 'var(--bg-card-raised)', cursor: 'pointer' }}
      onClick={() => gotoBoard(task)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, wordBreak: 'break-word' }}>
            {task.title}
          </div>
          <Space size={4} wrap>
            <Tag color={TASK_PRIORITY_META[task.priority].color} style={{ fontSize: 10 }}>
              {TASK_PRIORITY_META[task.priority].label}
            </Tag>
            <Tag color={TASK_STATUS_META[task.status].color} style={{ fontSize: 10 }}>
              {TASK_STATUS_META[task.status].label}
            </Tag>
            {task.approvalType && (
              <Tag color="gold" style={{ fontSize: 10 }}>
                {APPROVAL_TYPE_META[task.approvalType].label}
              </Tag>
            )}
          </Space>
          <div style={{ marginTop: 6 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              负责人：{userName(task.assigneeId)} · 创建人：{userName(task.createdBy)}
            </Text>
          </div>
        </div>
        <div onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0 }}>
          {actions}
        </div>
      </div>
    </Card>
  )

  const renderAuditColumn = (
    title: string,
    count: number,
    children: ReactNode,
  ) => (
    <Card
      size="small"
      title={
        <Space>
          <AuditOutlined />
          <Text strong>{title}</Text>
          <Tag>{count}</Tag>
        </Space>
      }
      styles={{ body: { padding: 12, minHeight: 240, background: 'var(--bg-card)' } }}
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-subtle)', height: '100%' }}
    >
      {children}
    </Card>
  )

  return (
    <div>
      <Row align="middle" justify="space-between" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0, color: 'var(--text-primary)' }}>{isManager ? '审核中心 · 管理视图' : '审核中心 · 成员视图'}</Title>
          <Space size={12} style={{ marginTop: 4 }}>
            <Tag color={isManager ? 'blue' : 'gold'}>{isManager ? '管理版面' : '成员版面'}</Tag>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {isManager ? '管理人员可处理全部待审事项' : '仅展示与你相关的提报审核任务'}
            </Text>
          </Space>
        </Col>
        <Col>
          <Space>
            <DatePicker.RangePicker
              value={dateRange as any}
              onChange={(v) => setDateRange(v as [Dayjs, Dayjs] | null)}
              allowClear
              placeholder={['开始日期', '结束日期']}
            />
            <Button icon={<ReloadOutlined />} onClick={() => setTasks((c) => [...c])}>
              刷新
            </Button>
          </Space>
        </Col>
      </Row>

      {/* 第五批需求 3：双版面顶部概览 */}
      <Row gutter={[12, 16]} style={{ marginBottom: 16 }}>
        {isManager ? (
          <>
            <Col xs={12} md={6}><Card size="small"><Statistic title="待审核" value={relatedTasks.filter((t) => t.approvalStatus === 'pending').length} valueStyle={{ color: 'gold' }} /></Card></Col>
            <Col xs={12} md={6}><Card size="small"><Statistic title="本周通过" value={relatedTasks.filter((t) => t.approvalStatus === 'approved' && t.auditLogs.some((l) => l.action === 'approve' && new Date(l.createdAt) >= new Date(Date.now() - 7 * 86400000))).length} valueStyle={{ color: 'green' }} /></Card></Col>
            <Col xs={12} md={6}><Card size="small"><Statistic title="本周驳回" value={relatedTasks.filter((t) => t.approvalStatus === 'rejected' && t.auditLogs.some((l) => l.action === 'reject' && new Date(l.createdAt) >= new Date(Date.now() - 7 * 86400000))).length} valueStyle={{ color: 'red' }} /></Card></Col>
            <Col xs={12} md={6}><Card size="small"><Statistic title="团队总任务" value={relatedTasks.length} /></Card></Col>
          </>
        ) : (
          <>
            <Col xs={12} md={6}><Card size="small"><Statistic title="我的待审" value={relatedTasks.filter((t) => t.approvalStatus === 'pending').length} valueStyle={{ color: 'gold' }} /></Card></Col>
            <Col xs={12} md={6}><Card size="small"><Statistic title="我提报中" value={relatedTasks.filter((t) => t.createdBy === currentUser.id && t.approvalStatus === 'pending').length} /></Card></Col>
            <Col xs={12} md={6}><Card size="small"><Statistic title="已通过" value={relatedTasks.filter((t) => t.approvalStatus === 'approved').length} valueStyle={{ color: 'green' }} /></Card></Col>
            <Col xs={12} md={6}><Card size="small"><Statistic title="已驳回" value={relatedTasks.filter((t) => t.approvalStatus === 'rejected').length} valueStyle={{ color: 'red' }} /></Card></Col>
          </>
        )}
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} lg={6}>
          {renderAuditColumn(
            '待提报',
            pendingReport.length,
            pendingReport.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无" />
            ) : (
              pendingReport.map((t) =>
                renderTaskCard(
                  t,
                  <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => gotoBoard(t)}>
                    查看
                  </Button>,
                ),
              )
            ),
          )}
        </Col>
        <Col xs={24} md={12} lg={6}>
          {renderAuditColumn(
            '待审核',
            pendingAudit.length,
            pendingAudit.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无" />
            ) : (
              pendingAudit.map((t) =>
                renderTaskCard(
                  t,
                  <Space direction="vertical" size={4}>
                    <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => gotoBoard(t)}>
                      查看
                    </Button>
                    {isManager && (
                      <>
                        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(t)}>
                          修改
                        </Button>
                        <Button type="primary" size="small" onClick={() => openAudit(t)}>
                          审核
                        </Button>
                      </>
                    )}
                    {!isManager && t.createdBy === currentUser.id && (
                      <Button size="small" danger onClick={() => openAudit(t)}>
                        撤回
                      </Button>
                    )}
                  </Space>,
                ),
              )
            ),
          )}
        </Col>
        <Col xs={24} md={12} lg={6}>
          {renderAuditColumn(
            '审核通过',
            approvedFiltered.length,
            approvedFiltered.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无" />
            ) : (
              approvedFiltered.map((t) => {
                const last = [...t.auditLogs].reverse().find((l) => l.action === 'approve')
                return (
                  <Tooltip key={t.id} title={last ? `审核人：${last.operatorName} · 意见：${OPINION_META[last.opinion]?.label ?? last.opinion}` : ''}>
                    {renderTaskCard(
                      t,
                      <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => gotoBoard(t)}>
                        查看
                      </Button>,
                    )}
                  </Tooltip>
                )
              })
            ),
          )}
        </Col>
        <Col xs={24} md={12} lg={6}>
          {renderAuditColumn(
            '撤回审核',
            withdrawnLogs.length,
            withdrawnLogs.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无" />
            ) : (
              <List
                size="small"
                dataSource={withdrawnLogs}
                renderItem={(log) => (
                  <List.Item style={{ paddingLeft: 0, paddingRight: 0 }}>
                    <Tooltip title={log.reason || '无原因'}>
                      <Card
                        size="small"
                        style={{ width: '100%', cursor: 'pointer', background: 'var(--bg-card-raised)' }}
                        onClick={() => gotoBoard(log.task)}
                      >
                        <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 4 }}>{log.task.title}</div>
                        <Space size={4} wrap>
                          <Tag color={OPINION_META[log.opinion]?.color} style={{ fontSize: 10 }}>
                            {OPINION_META[log.opinion]?.label ?? log.opinion}
                          </Tag>
                          <Tag style={{ fontSize: 10 }}>{log.action === 'withdraw' ? '撤回' : '驳回'}</Tag>
                        </Space>
                        <div style={{ marginTop: 4 }}>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {log.operatorName} · {dayjs(log.createdAt).format('MM-DD HH:mm')}
                          </Text>
                        </div>
                      </Card>
                    </Tooltip>
                  </List.Item>
                )}
              />
            ),
          )}
        </Col>
      </Row>

      {/* 审核意见弹窗 */}
      <Modal
        title={`审核：${auditTask?.title ?? ''}`}
        open={!!auditTask}
        onCancel={() => { setAuditTask(null); auditForm.resetFields() }}
        footer={null}
        destroyOnHidden
      >
        <Form form={auditForm} layout="vertical" onFinish={submitAudit}>
          <Form.Item name="action" label="审核动作" initialValue="approve" rules={[{ required: true }]}>
            <Radio.Group>
              {isManager && (
                <>
                  <Radio.Button value="approve">通过</Radio.Button>
                  <Radio.Button value="reject">驳回</Radio.Button>
                </>
              )}
              <Radio.Button value="withdraw">撤回</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="opinion" label="审核意见" initialValue="agree" rules={[{ required: true, message: '请选择审核意见' }]}>
            <Select options={OPINION_OPTIONS} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.opinion !== cur.opinion}>
            {({ getFieldValue }) =>
              getFieldValue('opinion') === 'other' ? (
                <Form.Item name="reason" label="原因说明" rules={[{ required: true, message: '请填写原因' }]}>
                  <Input.TextArea rows={3} placeholder="请填写审核原因" />
                </Form.Item>
              ) : (
                <Form.Item name="reason" label="原因说明（可选）">
                  <Input.TextArea rows={3} placeholder="补充说明，将展示在审核结果中" />
                </Form.Item>
              )
            }
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">提交审核</Button>
            <Button onClick={() => { setAuditTask(null); auditForm.resetFields() }}>取消</Button>
          </Space>
        </Form>
      </Modal>

      {/* 管理人员修改弹窗 */}
      <Modal
        title="修改任务"
        open={!!editTask}
        onCancel={() => { setEditTask(null); editForm.resetFields() }}
        onOk={() => editForm.submit()}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" onFinish={submitEdit}>
          <Form.Item name="title" label="任务标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="任务描述">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="assigneeId" label="承接人">
            <Select allowClear placeholder="选择承接人" options={teamMembers.map((u) => ({ value: u.id, label: u.displayName }))} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
