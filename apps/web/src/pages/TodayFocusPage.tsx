/**
 * 今日聚焦 —— 展示今日的任务（成员版面）/ 团队任务与节点（管理版面）
 *
 * 数据源（R7-7 TanStack Query 全量迁移）：
 * - 成员版面：服务端 `GET /me/today`（`useTodayFocus`）为唯一来源，只读消费；
 *   排序口径与服务端一致（逾期 → 截止时间 → 优先级，见 `@/utils/today`）。
 * - 管理版面：团队聚合（全部成员）无后端端点，暂由 `useWorkspaceTasks` 本地数据承担
 *   （D-07 待拍板，见 docs/ddd/production-progress.md §R7-7）。
 *
 * 覆盖需求：
 * - 需求 3：今日事宜按重要紧急程度排序展示（成员版面为服务端逾期/截止/优先级口径），
 *   已移除原「优先级列表」侧栏
 * - 需求 4：点击任务名称按统一规则跳转（父级任务→详情页，叶子子任务→执行页；
 *   服务端个人任务无前端详情页，暂不跳转）
 * - 需求 5：周期超过一天的任务，按执行页设置的每日完成节点在今天展示（管理版面本地数据）
 * - 第九批：新增「提报提醒」窗口，可自提报今日提醒事宜，面板展示「今日需提醒事宜」
 */
import { useMemo, useState } from 'react'
import { useCurrentRole } from '@/hooks/useCurrentRole'
import { useWorkspaceState } from '@/hooks/useWorkspaceState'
import { Button, Card, Checkbox, Col, DatePicker, Empty, Form, Input, List, Modal, Row, Space, Statistic, Tag, TimePicker, Typography, message } from 'antd'
import { BellOutlined, CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined, FieldTimeOutlined, PlusOutlined, ThunderboltOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useAuthStore } from '@/stores/authStore'
import { useUsers } from '@/hooks/useUsers'
import { useTodayFocus } from '@/hooks/useTodayFocus'
import { useWorkspaceTasks } from '@/hooks/useWorkspaceTasks'
import { taskRoute } from '@/utils/taskTree'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '@/hooks/useNotifications'
import { type TodayItem } from '@/utils/today'
import {
  TASK_KIND_META,
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  TASK_URGENCY_META,
  URGENCY_SORT_WEIGHT,
  deriveTaskUrgency,
  type Reminder,
  type TaskPriority,
  type TaskStatus,
  type TaskUrgency,
  type WorkspaceTask,
} from '@/types'

const { Title, Text } = Typography

/** 四级优先级文案（需求 3 排序口径） */
const URGENCY_RANK_LABEL: Record<TaskUrgency, string> = {
  urgent: '重要紧急',
  notImportant: '紧急不重要',
  important: '重要不紧急',
  notUrgent: '不重要不紧急',
}

/** 任务的紧急度（未设置时按默认 重要+不紧急 推导） */
const urgencyOf = (t: WorkspaceTask): TaskUrgency =>
  t.urgency ?? deriveTaskUrgency(t.importance ?? 'important', t.urgencyDegree ?? 'notUrgent')

export default function TodayFocusPage() {
  const navigate = useNavigate()
  const [tasks, setTasks] = useWorkspaceTasks()
  const today = dayjs().format('YYYY-MM-DD')

  // 第九批：角色由当前用户推导
  const role = useCurrentRole()
  const isManager = role === 'manager'

  // 当前登录用户（提醒 createdBy / 服务端今日聚焦的鉴权前提）
  const me = useAuthStore((s) => s.user)
  // 管理版面成员姓名映射（真实模式 /users；mock 模式回退种子，见 useUsers）
  const { users } = useUsers()
  // 成员版面唯一数据源：服务端 /me/today（只读）
  const {
    items: serverItems,
    overdue: serverOverdue,
    blocked: serverBlocked,
    isLoading: serverLoading,
    error: serverError,
  } = useTodayFocus()

  // 自提报提醒（独立持久化，今日聚焦面板展示今日需提醒事宜）
  const [reminders, setReminders] = useWorkspaceState<Reminder[]>('reminders', [])
  const [remindOpen, setRemindOpen] = useState(false)
  const [remindForm] = Form.useForm<{ content: string; date: dayjs.Dayjs; time: dayjs.Dayjs }>()
  const { addNotification } = useNotifications()

  /** 提报提醒：写入 reminders（提醒时间=日期+时间） */
  const submitReminder = () => {
    remindForm.validateFields().then((values) => {
      const remindAt = `${values.date.format('YYYY-MM-DD')} ${values.time.format('HH:mm')}`
      const reminder: Reminder = {
        id: `reminder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        content: values.content.trim(),
        remindAt,
        done: false,
        createdBy: me?.id ?? 'local',
        createdAt: new Date().toISOString(),
      }
      setReminders((c) => [...c, reminder])
      setRemindOpen(false)
      remindForm.resetFields()
      // 提醒时间已到（今天当前时间）→ 立即写入通知中心；未来提醒由到期扫描触发
      const due = dayjs(remindAt, 'YYYY-MM-DD HH:mm')
      if (due.isSame(dayjs(), 'day') && due.isBefore(dayjs())) {
        addNotification({
          eventType: 'reminder_due',
          title: `提醒：${reminder.content}`,
          body: `提醒时间 ${remindAt} 已到`,
          scope: 'personal',
          relatedUserIds: [],
          data: { reminderId: reminder.id },
          dedupKey: `reminder_due:${reminder.id}:${dayjs().format('YYYY-MM-DD')}`,
        })
      }
      message.success(due.isBefore(dayjs()) ? '提醒已提报并推送通知' : '提醒已提报，将在提醒时间到达后通知')
    })
  }

  /** 今日需提醒事宜：提醒时间在今天（含已过期且未处理的提醒） */
  const todayReminders = useMemo(
    () =>
      reminders
        .filter((r) => !r.done && dayjs(r.remindAt, 'YYYY-MM-DD HH:mm').isSame(dayjs(), 'day'))
        .sort((a, b) => dayjs(a.remindAt, 'YYYY-MM-DD HH:mm').valueOf() - dayjs(b.remindAt, 'YYYY-MM-DD HH:mm').valueOf()),
    [reminders],
  )

  /** 标记提醒已处理 */
  const toggleReminder = (id: string) => {
    setReminders((c) => c.map((r) => (r.id === id ? { ...r, done: !r.done } : r)))
  }

  /** 勾选/取消「今日节点」完成状态（需求 5：跨天任务每日节点可在今日聚焦直接勾选） */
  const toggleNode = (taskId: string, nodeId: string) => {
    setTasks((c) =>
      (c as WorkspaceTask[]).map((t) => {
        if (t.id !== taskId) return t
        return {
          ...t,
          dailyPlans: (t.dailyPlans ?? []).map((n) =>
            n.id === nodeId ? { ...n, done: !n.done } : n,
          ),
          updatedAt: new Date().toISOString(),
        }
      }),
    )
  }

  /** 第五批需求 3：管理版 —— 团队今日聚焦（全部成员 + 项目任务，按成员聚合），普通版不使用 */
  const teamScope = useMemo(
    () => tasks.filter((t) => !t.isDraft && t.kind !== 'project' && t.status !== 'done' && t.status !== 'cancelled'),
    [tasks],
  )
  const teamTodayItems = useMemo(
    () =>
      teamScope.filter((t) => {
        if (t.dueAt && dayjs(t.dueAt).isSame(dayjs(), 'day')) return true
        if (t.startAt && t.endAt) {
          const s = dayjs(t.startAt).startOf('day')
          const e = dayjs(t.endAt).endOf('day')
          if (!s.isAfter(dayjs()) && !e.isBefore(dayjs())) return true
        }
        return t.dailyPlans.some((n) => n.date === today)
      }),
    [teamScope, today],
  )
  const teamStats = useMemo(() => {
    const overdue = teamTodayItems.filter((t) => t.dueAt && dayjs(t.dueAt).isBefore(dayjs(), 'day')).length
    const blocked = teamTodayItems.filter((t) => t.status === 'blocked').length
    const todayNodes = teamTodayItems.flatMap((t) => t.dailyPlans.filter((n) => n.date === today))
    return { total: teamTodayItems.length, overdue, blocked, nodes: todayNodes.length, nodesDone: todayNodes.filter((n) => n.done).length }
  }, [teamTodayItems, today])
  const teamByMember = useMemo(() => {
    const map = new Map<string, { userId: string; name: string; items: typeof teamTodayItems }>()
    teamTodayItems.forEach((t) => {
      const uid = t.assigneeId ?? t.createdBy
      const user = users.find((u) => u.id === uid)
      const key = uid || 'unassigned'
      if (!map.has(key)) map.set(key, { userId: key, name: user?.displayName ?? '未指派', items: [] })
      map.get(key)!.items.push(t)
    })
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length)
  }, [teamTodayItems, users])

  /** 数据源：管理看板 = 团队今日（本地工作区数据）；成员看板改由服务端 `serverItems` 直供，不再走此源 */
  const source = teamTodayItems

  /** 需求 3：今日任务（kind !== 'plan'）—— 按 重要紧急 > 紧急不重要 > 重要不紧急 > 不重要不紧急 排序，同级按截止时间 */
  const taskItems = useMemo(
    () =>
      source
        .filter((t) => t.kind !== 'plan')
        .sort((a, b) => {
          const w = URGENCY_SORT_WEIGHT[urgencyOf(a)] - URGENCY_SORT_WEIGHT[urgencyOf(b)]
          if (w !== 0) return w
          const ad = a.dueAt ? dayjs(a.dueAt).valueOf() : Number.MAX_SAFE_INTEGER
          const bd = b.dueAt ? dayjs(b.dueAt).valueOf() : Number.MAX_SAFE_INTEGER
          return ad - bd
        }),
    [source],
  )

  /** 今日个人计划（kind === 'plan'）—— 按开始时间（startAt）先后展示 */
  const planItems = useMemo(
    () =>
      source
        .filter((t) => t.kind === 'plan')
        .sort((a, b) => {
          const av = a.startAt ? dayjs(a.startAt).valueOf() : Number.MAX_SAFE_INTEGER
          const bv = b.startAt ? dayjs(b.startAt).valueOf() : Number.MAX_SAFE_INTEGER
          return av - bv
        }),
    [source],
  )

  /** 成员版面统计（服务端 /me/today）：今日事宜 / 已逾期 / 阻塞中 / 个人任务 */
  const stats = useMemo(
    () => ({
      total: serverItems.length,
      overdue: serverOverdue,
      blocked: serverBlocked,
      personal: serverItems.filter((t) => t.type === 'personal').length,
    }),
    [serverItems, serverOverdue, serverBlocked],
  )

  /** 今天的节点（含所属任务） */
  const todayNodes = useMemo(
    () =>
      [...taskItems, ...planItems]
        .flatMap((t) => t.dailyPlans.filter((n) => n.date === today).map((n) => ({ task: t, node: n })))
        .sort((a, b) => a.node.time.localeCompare(b.node.time)),
    [taskItems, planItems, today],
  )

  const timeDesc = (t: WorkspaceTask) => {
    if (t.startAt && t.endAt) {
      if (dayjs(t.endAt).diff(dayjs(t.startAt), 'day') >= 1) {
        return `${dayjs(t.startAt).format('MM-DD')} ~ ${dayjs(t.endAt).format('MM-DD')}（跨天）`
      }
      return `${dayjs(t.startAt).format('MM-DD HH:mm')} ~ ${dayjs(t.endAt).format('HH:mm')}`
    }
    if (t.dueAt) return `${dayjs(t.dueAt).format('MM-DD HH:mm')} 截止`
    return '今日事宜'
  }

  const renderItem = (t: WorkspaceTask) => {
    const urg = urgencyOf(t)
    const node = t.dailyPlans.find((n) => n.date === today)
    const overdue = t.dueAt && dayjs(t.dueAt).isBefore(dayjs(), 'day')
    return (
      <List.Item
        style={{ padding: '10px 0', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer' }}
        onClick={() => navigate(taskRoute(tasks, t))}
        actions={[
          <Space key="rank" size={4}>
            {overdue && <Tag color="error" style={{ fontSize: 10 }}>已逾期</Tag>}
            <Tag color={TASK_URGENCY_META[urg].color} style={{ fontSize: 10 }}>{URGENCY_RANK_LABEL[urg]}</Tag>
          </Space>,
        ]}
      >
        <List.Item.Meta
          title={
            <Space size={6} wrap>
              <Text strong style={{ color: 'var(--text-primary)' }}>{t.title}</Text>
              <Tag color={TASK_KIND_META[t.kind].color} style={{ fontSize: 10 }}>{TASK_KIND_META[t.kind].label}</Tag>
              {t.parentId && <Tag style={{ fontSize: 10 }}>子任务</Tag>}
            </Space>
          }
          description={
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>{timeDesc(t)}</Text>
              {node && (
                <div style={{ marginTop: 2 }}>
                  <Tag color="blue" style={{ fontSize: 10 }}>今日节点 {node.time}</Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {node.goal}{node.done ? '（已完成）' : ''}
                  </Text>
                </div>
              )}
            </div>
          }
        />
      </List.Item>
    )
  }

  /** 成员版面行（服务端 /me/today 项）：类型/优先级/状态徽标 + 截止时间；个人任务无前端详情页，不跳转 */
  const renderServerItem = (t: TodayItem) => {
    const overdue = !!t.dueAt && t.dueAt.getTime() < Date.now()
    const statusMeta = TASK_STATUS_META[t.status as TaskStatus] ?? { label: t.status, color: 'default' }
    const priorityMeta = TASK_PRIORITY_META[t.priority as TaskPriority] ?? { label: t.priority, color: 'default' }
    return (
      <List.Item
        style={{ padding: '10px 0', borderBottom: '1px solid var(--border-subtle)', cursor: t.type === 'team' ? 'pointer' : 'default' }}
        onClick={t.type === 'team' ? () => navigate(`/tasks/${t.id}`) : undefined}
        actions={[
          <Space key="meta" size={4}>
            {overdue && <Tag color="error" style={{ fontSize: 10 }}>已逾期</Tag>}
            <Tag color={t.type === 'team' ? 'geekblue' : 'cyan'} style={{ fontSize: 10 }}>{t.type === 'team' ? '团队任务' : '个人任务'}</Tag>
            <Tag color={priorityMeta.color} style={{ fontSize: 10 }}>{priorityMeta.label}优先级</Tag>
            <Tag color={statusMeta.color} style={{ fontSize: 10 }}>{statusMeta.label}</Tag>
          </Space>,
        ]}
      >
        <List.Item.Meta
          title={<Text strong style={{ color: 'var(--text-primary)' }}>{t.title}</Text>}
          description={
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t.dueAt ? `${dayjs(t.dueAt).format('MM-DD HH:mm')} 截止` : '无截止时间'}
            </Text>
          }
        />
      </List.Item>
    )
  }

  return (
    <div>
      <Row align="middle" justify="space-between" style={{ marginBottom: 20 }}>
        <Col>
          <Title level={3} style={{ margin: 0, color: 'var(--text-primary)' }}>{isManager ? '今日聚焦 · 管理视图' : '今日聚焦'}</Title>
          <Text type="secondary">{isManager ? `${dayjs().format('YYYY年MM月DD日 dddd')} · 团队全部成员的今日任务与节点` : `${dayjs().format('YYYY年MM月DD日 dddd')} · 今日的任务（团队 + 个人），按逾期 / 截止时间 / 优先级排序`}</Text>
        </Col>
        <Col>
          <Tag color={isManager ? 'blue' : 'gold'}>{isManager ? '管理版面' : '成员版面'}</Tag>
        </Col>
      </Row>

      {/* 第五批需求 3：管理版顶部展示团队统计 */}
      {isManager && (
        <Row gutter={14} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic title="团队今日待办" value={teamStats.total} prefix={<ThunderboltOutlined />} valueStyle={{ color: 'var(--accent-cyan)' }} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic title="团队已逾期" value={teamStats.overdue} prefix={<ExclamationCircleOutlined />} valueStyle={{ color: teamStats.overdue > 0 ? 'var(--accent-coral)' : 'var(--text-secondary)' }} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic title="团队阻塞中" value={teamStats.blocked} valueStyle={{ color: teamStats.blocked > 0 ? 'gold' : 'var(--text-secondary)' }} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic title="团队节点完成" value={teamStats.nodesDone} suffix={`/ ${teamStats.nodes}`} valueStyle={{ color: 'var(--accent-blue)' }} />
            </Card>
          </Col>
        </Row>
      )}

      {/* 第五批需求 3：管理版按成员分组展示团队今日聚焦 */}
      {isManager && (
        <Card title="团队今日聚焦（按成员）" style={{ marginBottom: 16 }}>
          {teamByMember.length === 0 ? (
            <Empty description="今天团队没有待处理的任务" />
          ) : (
            <Row gutter={[12, 12]}>
              {teamByMember.map((m) => (
                <Col xs={24} md={12} lg={8} key={m.userId}>
                  <Card size="small" type="inner" title={`${m.name} · ${m.items.length} 项`}>
                    <List
                      size="small"
                      dataSource={m.items.slice(0, 6)}
                      renderItem={(t) => (
                        <List.Item style={{ padding: '4px 0', cursor: 'pointer' }} onClick={() => navigate(taskRoute(tasks, t))}>
                          <Text style={{ fontSize: 12 }}>{t.title}</Text>
                          <Tag color={TASK_STATUS_META[t.status].color} style={{ fontSize: 10 }}>{TASK_STATUS_META[t.status].label}</Tag>
                        </List.Item>
                      )}
                    />
                  </Card>
                </Col>
              ))}
            </Row>
          )}
        </Card>
      )}

      <Row gutter={14} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <Statistic title={<Text style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>今日事宜</Text>} value={stats.total} prefix={<ThunderboltOutlined />} valueStyle={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', fontSize: 24 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <Statistic title={<Text style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>已逾期</Text>} value={stats.overdue} prefix={<ExclamationCircleOutlined />} valueStyle={{ color: stats.overdue > 0 ? 'var(--accent-coral)' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 24 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <Statistic title={<Text style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>阻塞中</Text>} value={stats.blocked} prefix={<ExclamationCircleOutlined />} valueStyle={{ color: stats.blocked > 0 ? 'gold' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 24 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <Statistic title={<Text style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>个人任务</Text>} value={stats.personal} prefix={<FieldTimeOutlined />} valueStyle={{ color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)', fontSize: 24 }} />
          </Card>
        </Col>
      </Row>

      {((isManager ? taskItems.length + planItems.length : serverItems.length) === 0 && todayReminders.length === 0) ? (
        <Card><Empty description="今天没有待处理的任务/计划，也没有待提醒事宜，享受专注时间" /></Card>
      ) : (
        <Row gutter={20}>
          <Col xs={24} lg={16}>
            <Space direction="vertical" style={{ width: '100%' }} size={16}>
              {isManager ? (
                <Card title={<Space><ThunderboltOutlined />团队今日任务（{taskItems.length}）</Space>}>
                  {taskItems.length === 0 ? (
                    <Empty description="今天团队没有待处理的任务" />
                  ) : (
                    <List dataSource={taskItems} renderItem={renderItem} split={false} />
                  )}
                </Card>
              ) : (
                <Card title={<Space><ThunderboltOutlined />今日任务（{serverItems.length}）</Space>}>
                  {serverItems.length === 0 ? (
                    <Empty
                      description={
                        serverError
                          ? '今日聚焦加载失败，请稍后重试'
                          : serverLoading
                            ? '正在加载今日聚焦…'
                            : '今天没有待处理的任务'
                      }
                    />
                  ) : (
                    <List dataSource={serverItems} renderItem={renderServerItem} split={false} />
                  )}
                </Card>
              )}
              {isManager && (
                <Card title={<Space><FieldTimeOutlined />今日个人计划（{planItems.length}）</Space>}>
                  {planItems.length === 0 ? (
                    <Empty description="今天没有安排个人计划" />
                  ) : (
                    <List dataSource={planItems} renderItem={renderItem} split={false} />
                  )}
                </Card>
              )}
            </Space>
          </Col>
          <Col xs={24} lg={8}>
            {/* 提报提醒窗口 */}
            <Card style={{ marginBottom: 16 }}>
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                <Text strong style={{ color: 'var(--text-primary)' }}><BellOutlined /> 提报提醒</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  为自己提报今天需要的提醒事项，将展示在下方「今日需提醒事宜」中。
                </Text>
                <Button type="primary" block icon={<PlusOutlined />} onClick={() => { remindForm.setFieldsValue({ date: dayjs(), time: dayjs() }); setRemindOpen(true) }}>
                  提报提醒
                </Button>
              </Space>
            </Card>

            {/* 今日需提醒事宜 */}
            <Card
              title={<Space><BellOutlined />今日需提醒事宜（{todayReminders.length}）</Space>}
              size="small"
              style={{ marginBottom: 16 }}
            >
              {todayReminders.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="今天暂无提醒事项" />
              ) : (
                <List
                  dataSource={todayReminders}
                  renderItem={(r) => (
                    <List.Item
                      style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}
                      actions={[
                        <Button
                          key="done"
                          type="text"
                          size="small"
                          icon={<CheckCircleOutlined />}
                          onClick={() => toggleReminder(r.id)}
                        />,
                      ]}
                    >
                      <List.Item.Meta
                        title={
                          <Space size={6}>
                            <ClockCircleOutlined style={{ color: 'var(--accent-cyan)' }} />
                            <Text style={{ fontSize: 13, textDecoration: r.done ? 'line-through' : undefined, color: r.done ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>
                              {dayjs(r.remindAt, 'YYYY-MM-DD HH:mm').format('HH:mm')}
                            </Text>
                          </Space>
                        }
                        description={<Text style={{ fontSize: 13 }}>{r.content}</Text>}
                      />
                    </List.Item>
                  )}
                />
              )}
            </Card>

            {isManager && todayNodes.length > 0 && (
              <Card title={<Space><FieldTimeOutlined />今日节点（{todayNodes.length}）</Space>} size="small">
                <List
                  size="small"
                  dataSource={todayNodes}
                  renderItem={({ task, node }) => (
                    <List.Item style={{ padding: '8px 0', cursor: 'pointer' }} onClick={() => navigate(taskRoute(tasks, task))}>
                      <Checkbox
                        checked={node.done}
                        style={{ marginRight: 8 }}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation()
                          toggleNode(task.id, node.id)
                        }}
                      />
                      <List.Item.Meta
                        title={<Text style={{ fontSize: 13 }}>{node.time} · {task.title}</Text>}
                        description={<Text type="secondary" style={{ fontSize: 11 }}>{node.goal}</Text>}
                      />
                    </List.Item>
                  )}
                />
              </Card>
            )}
          </Col>
        </Row>
      )}

      {/* 提报提醒弹窗 */}
      <Modal
        title={<Space><BellOutlined />提报提醒</Space>}
        open={remindOpen}
        onCancel={() => setRemindOpen(false)}
        onOk={submitReminder}
        okText="提交"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={remindForm} layout="vertical">
          <Form.Item
            name="content"
            label="提醒内容"
            rules={[{ required: true, whitespace: true, message: '请输入提醒内容' }, { max: 200, message: '不超过 200 字符' }]}
          >
            <Input placeholder="例如：下午 3 点参加项目复盘会" maxLength={200} />
          </Form.Item>
          <Form.Item name="date" label="提醒日期" rules={[{ required: true, message: '请选择日期' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="time" label="提醒时间" rules={[{ required: true, message: '请选择时间' }]}>
            <TimePicker format="HH:mm" style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
