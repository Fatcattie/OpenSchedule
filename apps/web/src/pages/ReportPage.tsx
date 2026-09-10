/**
 * 职责：提报页 —— 管理人员与普通成员切割为两个不同版面（第五批需求 3）
 *
 * 管理版：
 *  - 顶部团队提报概览（今日/待审/本周通过/本周驳回）
 *  - 主区：团队最近提报（全员）+ 待审任务
 *  - 快捷：快速发布任务/项目
 *
 * 成员版：
 *  - 顶部个人提报概览（我提报总数 / 待审核 / 通过 / 驳回）
 *  - 主区：我的提报记录
 *  - 右侧：提报任务/项目按钮 + 提报指引
 */
import { useMemo, useState } from 'react'
import { Alert, Button, Card, Col, Empty, List, Row, Space, Statistic, Tag, Typography } from 'antd'
import { PlusOutlined, SendOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { mockMe, mockUsers } from '@/api/mock/data'
import { useLocalStorageState } from '@/hooks/useLocalStorageState'
import { useWorkspaceTasks } from '@/hooks/useWorkspaceTasks'
import PublishTaskModal from '@/components/workspace/PublishTaskModal'
import type { PublishTaskPayload } from '@/components/workspace/PublishTaskModal'
import type { WorkspaceTask } from '@/types'
import { TASK_PRIORITY_META, TASK_STATUS_META } from '@/types'

const { Title, Text, Paragraph } = Typography
type WorkspaceRole = 'manager' | 'member'

export default function ReportPage() {
  const [role] = useLocalStorageState<WorkspaceRole>('workspace_role', 'manager')
  const isManager = role === 'manager'
  const [tasks, setTasks] = useWorkspaceTasks()
  const [open, setOpen] = useState(false)

  /** 提交：成员 → 待审；管理 → 立即生效 */
  const onSubmit = (payload: PublishTaskPayload) => {
    const now = new Date().toISOString()
    const needApproval = !isManager
    const task: WorkspaceTask = {
      id: `t-${Date.now()}`, tenantId: 'tenant-001', projectId: 'project-001', parentId: null,
      title: payload.title,
      description: payload.description || null,
      status: 'todo', priority: payload.priority,
      assigneeId: payload.assigneeId, dueAt: payload.endAt, estimatedHours: 2, actualHours: null,
      completedAt: null, startedAt: null,
      createdBy: mockMe.id, tags: [payload.taskMode === 'individual' ? '独立任务' : payload.taskMode === 'project' ? '团队协作项目' : '团队协作', payload.industry, payload.taskType],
      sortOrder: 0, workflowColumnId: null, isAiGenerated: false, version: 1, createdAt: now, updatedAt: now,
      taskMode: payload.taskMode, kind: 'task', needReview: payload.taskMode === 'team' ? payload.needReview : false,
      reviewStatus: 'none', proposalStatus: needApproval ? 'pending' : 'none',
      participants: [], reviewOfTaskId: null,
      startAt: payload.startAt, endAt: payload.endAt,
      importance: payload.importance, urgencyDegree: payload.urgencyDegree, urgency: payload.urgencyDegree,
      sop: payload.sop ?? null,
      approvalStatus: needApproval ? 'pending' : 'none',
      approvalType: needApproval ? 'proposal' : null,
      recommendedAssigneeId: payload.recommendAssigneeId ?? null,
      pendingContent: null, executionLogs: [], comments: [], completion: null,
      auditLogs: [], dailyPlans: [], isDraft: false, pendingDelete: false, pendingSop: null,
    }
    setTasks((c) => [task, ...c])
    setOpen(false)
  }

  /** 第五批需求 3：成员版概览 —— 我的提报统计 */
  const myReports = useMemo(
    () => tasks.filter((t) => t.createdBy === mockMe.id && t.approvalStatus !== 'none'),
    [tasks],
  )
  const myStats = useMemo(() => ({
    total: myReports.length,
    pending: myReports.filter((t) => t.approvalStatus === 'pending').length,
    approved: myReports.filter((t) => t.approvalStatus === 'approved').length,
    rejected: myReports.filter((t) => t.approvalStatus === 'rejected').length,
  }), [myReports])

  /** 第五批需求 3：管理版概览 —— 团队提报统计 */
  const teamReports = useMemo(
    () => tasks.filter((t) => t.approvalStatus !== 'none' || t.proposalStatus !== 'none'),
    [tasks],
  )
  const teamPending = teamReports.filter((t) => t.approvalStatus === 'pending')
  const teamApprovedThisWeek = teamReports.filter((t) =>
    t.approvalStatus === 'approved' &&
    t.auditLogs.some((l) => l.action === 'approve' && new Date(l.createdAt) >= new Date(Date.now() - 7 * 86400000)),
  )
  const teamRejectedThisWeek = teamReports.filter((t) =>
    t.approvalStatus === 'rejected' &&
    t.auditLogs.some((l) => l.action === 'reject' && new Date(l.createdAt) >= new Date(Date.now() - 7 * 86400000)),
  )
  const teamToday = teamReports.filter((t) => dayjs(t.createdAt).isSame(dayjs(), 'day'))
  const teamStats = {
    today: teamToday.length,
    pending: teamPending.length,
    weekApproved: teamApprovedThisWeek.length,
    weekRejected: teamRejectedThisWeek.length,
  }

  return (
    <div>
      <Row align="middle" justify="space-between" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0, color: 'var(--text-primary)' }}>{isManager ? '提报管理' : '提报'}</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>{isManager ? '管理视图：查看团队提报动态与待审核事项' : '成员视图：提交任务/项目由管理人员审核通过后生效'}</Text>
        </Col>
        <Col>
          <Tag color={isManager ? 'blue' : 'gold'}>{isManager ? '管理版面' : '成员版面'}</Tag>
        </Col>
      </Row>

      {/* 顶部概览（按角色切割） */}
      {isManager ? (
        <Row gutter={[12, 16]} style={{ marginBottom: 16 }}>
          <Col xs={12} md={6}><Card size="small"><Statistic title="今日提报" value={teamStats.today} prefix={<SendOutlined />} valueStyle={{ color: 'var(--accent-cyan)' }} /></Card></Col>
          <Col xs={12} md={6}><Card size="small"><Statistic title="待审任务" value={teamStats.pending} valueStyle={{ color: teamStats.pending > 0 ? 'gold' : undefined }} /></Card></Col>
          <Col xs={12} md={6}><Card size="small"><Statistic title="本周通过" value={teamStats.weekApproved} valueStyle={{ color: 'green' }} /></Card></Col>
          <Col xs={12} md={6}><Card size="small"><Statistic title="本周驳回" value={teamStats.weekRejected} valueStyle={{ color: 'red' }} /></Card></Col>
        </Row>
      ) : (
        <Row gutter={[12, 16]} style={{ marginBottom: 16 }}>
          <Col xs={12} md={6}><Card size="small"><Statistic title="我提报总数" value={myStats.total} /></Card></Col>
          <Col xs={12} md={6}><Card size="small"><Statistic title="待审核" value={myStats.pending} valueStyle={{ color: myStats.pending > 0 ? 'gold' : undefined }} /></Card></Col>
          <Col xs={12} md={6}><Card size="small"><Statistic title="已通过" value={myStats.approved} valueStyle={{ color: 'green' }} /></Card></Col>
          <Col xs={12} md={6}><Card size="small"><Statistic title="已驳回" value={myStats.rejected} valueStyle={{ color: 'red' }} /></Card></Col>
        </Row>
      )}

      <Row gutter={[16, 16]}>
        {/* 左主区：管理 → 团队最近提报；成员 → 我的提报记录 */}
        <Col xs={24} md={16}>
          {isManager ? (
            <Card title="团队最近提报" extra={<Tag color="processing">{teamReports.length} 条</Tag>}>
              {teamReports.length === 0 ? (
                <Empty description="暂无团队提报记录" />
              ) : (
                <List
                  size="small"
                  dataSource={teamReports.slice(0, 30)}
                  renderItem={(t) => {
                    const reporter = mockUsers.find((u) => u.id === t.createdBy)?.displayName ?? t.createdBy
                    return (
                      <List.Item actions={[
                        <Tag key="s" color={TASK_STATUS_META[t.status].color}>{TASK_STATUS_META[t.status].label}</Tag>,
                        <Tag key="a" color={t.approvalStatus === 'pending' ? 'gold' : t.approvalStatus === 'approved' ? 'green' : t.approvalStatus === 'rejected' ? 'red' : 'default'}>
                          {t.approvalStatus === 'pending' ? '审核中' : t.approvalStatus === 'approved' ? '已通过' : t.approvalStatus === 'rejected' ? '已驳回' : '无需审核'}
                        </Tag>,
                        <Tag key="p" color={TASK_PRIORITY_META[t.priority].color}>{TASK_PRIORITY_META[t.priority].label}</Tag>,
                      ]}>
                        <List.Item.Meta
                          title={<Space>{t.title}<Tag color="cyan">{reporter} 提报</Tag></Space>}
                          description={t.description || <Text type="secondary">暂无描述</Text>}
                        />
                      </List.Item>
                    )
                  }}
                />
              )}
            </Card>
          ) : (
            <Card title="我的提报记录" extra={<Tag color="processing">{myReports.length} 条</Tag>}>
              {myReports.length === 0 ? (
                <Empty description="还没有提报记录" />
              ) : (
                <List
                  size="small"
                  dataSource={myReports.slice(0, 30)}
                  renderItem={(t) => (
                    <List.Item actions={[
                      <Tag key="s" color={TASK_STATUS_META[t.status].color}>{TASK_STATUS_META[t.status].label}</Tag>,
                      <Tag key="a" color={t.approvalStatus === 'pending' ? 'gold' : t.approvalStatus === 'approved' ? 'green' : 'red'}>
                        {t.approvalStatus === 'pending' ? '审核中' : t.approvalStatus === 'approved' ? '已通过' : t.approvalStatus === 'rejected' ? '已驳回' : '无需审核'}
                      </Tag>,
                      <Tag key="p" color={TASK_PRIORITY_META[t.priority].color}>{TASK_PRIORITY_META[t.priority].label}</Tag>,
                    ]}>
                      <List.Item.Meta title={<a>{t.title}</a>} description={t.description || <Text type="secondary">暂无描述</Text>} />
                    </List.Item>
                  )}
                />
              )}
            </Card>
          )}
        </Col>

        {/* 右侧：管理 → 待审任务 + 快速发布；成员 → 提报指引 + 提报按钮 */}
        <Col xs={24} md={8}>
          {isManager ? (
            <Card title="待审任务">
              {teamPending.length === 0 ? (
                <Empty description="暂无待审核" />
              ) : (
                <List
                  size="small"
                  dataSource={teamPending.slice(0, 10)}
                  renderItem={(t) => (
                    <List.Item>
                      <Text strong style={{ fontSize: 13 }}>{t.title}</Text>
                      <Tag color="gold" style={{ marginLeft: 8 }}>待审</Tag>
                    </List.Item>
                  )}
                />
              )}
              <Button type="primary" block icon={<PlusOutlined />} onClick={() => setOpen(true)} style={{ marginTop: 12 }}>
                快速发布任务/项目
              </Button>
            </Card>
          ) : (
            <Card title="提报指引">
              <Paragraph style={{ fontSize: 13 }}>
                1. 点击下方「<strong>提报任务/项目</strong>」按钮打开弹窗；
                <br />
                2. 选择<strong>任务模式</strong>（团队协作/独立/团队协作项目）；
                <br />
                3. 填写标题/描述/SOP 流程（团队协作必填）；
                <br />
                4. 选择承接人（团队协作任务仅支持「推荐承接人」，由管理人员审核后生效）；
                <br />
                5. 提交后由<strong>审核中心</strong>统一跟进审核。
              </Paragraph>
              <button
                type="button"
                onClick={() => setOpen(true)}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  border: 'none',
                  borderRadius: 6,
                  background: 'var(--accent-cyan, #1677ff)',
                  color: '#fff',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                提报任务/项目
              </button>
              <Alert
                type="info"
                showIcon
                style={{ marginTop: 12 }}
                message="提报由管理人员审核通过后才会发布到任务协作列表；驳回后可修改并重新提交。"
              />
            </Card>
          )}
        </Col>
      </Row>

      <PublishTaskModal
        open={open}
        role={role}
        tasks={tasks}
        allowedModes="full"
        onCancel={() => setOpen(false)}
        onSubmit={onSubmit}
      />
    </div>
  )
}