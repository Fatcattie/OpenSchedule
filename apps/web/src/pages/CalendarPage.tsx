/**
 * CalendarPage —— 时间容器页（B21，第八批需求：改名 + 角色区分 + 飞书日历反向同步为个人计划）
 * 三个 Tab：同步设置 / 忙闲查询 / 同步日志
 * - 同步设置 / 同步日志：普通人员与管理人员功能相同
 * - 忙闲查询：普通人员仅可查询自己；管理人员可查询所有成员
 * - 飞书日历事件反向同步：记录事件作为「个人计划」(kind='plan') 写入工作台
 */
import { useState } from 'react'
import {
  Tabs,
  Card,
  Button,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  Tag,
  List,
  Empty,
  Space,
  Typography,
  Popconfirm,
  message,
  Alert,
  Row,
  Col,
  Drawer,
  Switch,
  Radio,
  Badge,
  Dropdown,
  Divider,
} from 'antd'
import {
  CalendarOutlined,
  PlusOutlined,
  SyncOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  LinkOutlined,
  CloudDownloadOutlined,
  SettingOutlined,
  DownOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { calendarApi } from '@/api/calendarApi'
import BusyFreeHeatmap from '@/components/BusyFreeHeatmap'
import ConflictListPage from '@/components/workspace/ConflictListPage'
import { useCurrentRole } from '@/hooks/useCurrentRole'
import { useWorkspaceTasks } from '@/hooks/useWorkspaceTasks'
import { useSyncSettings } from '@/hooks/useSyncSettings'
import { listProviderEvents, listIntegrationStatus, providerMeta, PROVIDERS } from '@/services/imProvider'
import type { ImProvider, ExternalCalendarEvent } from '@/services/imProvider'
import { useMe } from '@/hooks/useWorkspaceIdentity'
import type { CalendarAccount, DayLoad, DayFreeSlots, WorkspaceTask } from '@/types'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { RangePicker } = DatePicker
const { Option } = Select

export default function CalendarPage() {
  const [activeKey, setActiveKey] = useState('accounts')
  const role = useCurrentRole()
  const isManager = role === 'manager'

  const items = [
    { key: 'accounts', label: <span><LinkOutlined /> 同步设置</span>, children: <AccountsTab /> },
    { key: 'busy-free', label: <span><ClockCircleOutlined /> 忙闲查询</span>, children: <BusyFreeTab isManager={isManager} /> },
    { key: 'conflicts', label: <span><WarningOutlined /> 时间冲突事项</span>, children: <ConflictListPage /> },
    { key: 'logs', label: <span><SyncOutlined /> 同步日志</span>, children: <SyncLogsTab /> },
  ]

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 16px' }}>
      <Title level={4} style={{ marginBottom: 4 }}>
        <CalendarOutlined style={{ marginRight: 8 }} />
        时间容器
      </Title>
      <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 20 }}>
        连接飞书 / 钉钉日历，任务与项目可推送到外部日历，外部日历事件可反向同步为个人计划，并支持查询忙闲辅助排期
        {isManager ? '（管理视图：可查看所有成员忙闲）' : '（成员视图：仅可查看自己的忙闲）'}
      </Text>

      <Card bodyStyle={{ padding: 0 }}>
        <Tabs
          activeKey={activeKey}
          onChange={setActiveKey}
          items={items}
          style={{ padding: '0 16px' }}
        />
      </Card>
    </div>
  )
}

// ========== Tab 1：同步设置（账户列表 + 绑定） ==========

function AccountsTab() {
  const currentUser = useMe()
  const queryClient = useQueryClient()
  const [tasks, setTasks] = useWorkspaceTasks()
  const [bindModalOpen, setBindModalOpen] = useState(false)
  const [syncAllLoading, setSyncAllLoading] = useState(false)
  const [pullEventsLoading, setPullEventsLoading] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { settings, update, reset, isSynced, markSynced } = useSyncSettings()

  const statusQuery = useQuery({
    queryKey: ['integration-status'],
    queryFn: () => listIntegrationStatus(),
  })

  const accountsQuery = useQuery({
    queryKey: ['calendar-accounts'],
    queryFn: () => calendarApi.listCalendarAccounts(),
  })

  const providersQuery = useQuery({
    queryKey: ['calendar-providers'],
    queryFn: () => calendarApi.listCalendarProviders(),
  })

  const unbindMutation = useMutation({
    mutationFn: (id: string) => calendarApi.unbindCalendarAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-accounts'] })
      message.success('已解绑')
    },
  })

  const handleSyncAll = async (accountId: string) => {
    setSyncAllLoading(true)
    try {
      // 用一个假 projectId 演示（真实场景应该选项目）
      const result = await calendarApi.syncProject('demo-project', accountId)
      message.success(`同步完成：成功 ${result.success} / 失败 ${result.failed}`)
      queryClient.invalidateQueries({ queryKey: ['calendar-accounts'] })
    } catch (err: any) {
      message.error(err.message || '同步失败')
    } finally {
      setSyncAllLoading(false)
    }
  }

  /**
   * 外部日历事件反向同步：按渠道拉取记录事件，幂等去重后作为「个人计划」写入工作台。
   * 同一事件以 sourceRef（provider:eventId）判重，重复点击不会产生重复计划。
   */
  const handlePullEvents = async (providers: ImProvider[]) => {
    setPullEventsLoading(true)
    try {
      const all: ExternalCalendarEvent[] = []
      for (const p of providers) {
        const events = await listProviderEvents(p)
        all.push(...events)
      }
      if (all.length === 0) {
        message.info(`${providers.map((p) => providerMeta(p).name).join(' / ')} 暂无近期事件`)
        return
      }
      const fresh = all.filter((e) => !isSynced(e.sourceRef))
      const skipped = all.length - fresh.length
      if (fresh.length === 0) {
        message.info(`没有新的日历事件（已跳过 ${skipped} 条已导入过的事件）`)
        return
      }
      const events = fresh
      const now = new Date().toISOString()
      const newPlans: WorkspaceTask[] = events.map((e, i) => ({
        id: `plan-${e.provider}-${Date.now()}-${i}`,
        tenantId: 'tenant-001',
        projectId: null,
        parentId: null,
        title: e.summary,
        description: e.description,
        status: 'todo' as const,
        priority: 'medium' as const,
        assigneeId: currentUser.id,
        dueAt: e.endAt,
        estimatedHours: e.allDay ? null : Math.max(1, Math.round((new Date(e.endAt).getTime() - new Date(e.startAt).getTime()) / 3600000)),
        actualHours: null,
        completedAt: null,
        startedAt: null,
        createdBy: currentUser.id,
        tags: ['个人计划', `${providerMeta(e.provider).name}日历`],
        sortOrder: tasks.length + i + 1,
        workflowColumnId: null,
        isAiGenerated: false,
        version: 1,
        createdAt: now,
        updatedAt: now,
        taskMode: 'individual' as const,
        kind: 'plan' as const,
        needReview: false,
        reviewStatus: 'none' as const,
        proposalStatus: 'none' as const,
        participants: [],
        reviewOfTaskId: null,
        startAt: e.startAt,
        endAt: e.endAt,
        importance: 'notImportant' as const,
        urgencyDegree: 'notUrgent' as const,
        urgency: 'notUrgent' as const,
        sop: null,
        approvalStatus: 'none' as const,
        approvalType: null,
        recommendedAssigneeId: null,
        pendingContent: null,
        executionLogs: [],
        comments: [],
        completion: null,
        auditLogs: [],
        dailyPlans: [],
        isDraft: false,
        pendingDelete: false,
        pendingSop: null,
      }))
      setTasks((c) => [...newPlans, ...c])
      markSynced(events.map((e) => e.sourceRef))
      message.success(
        `已同步 ${events.length} 条日历事件为个人计划` +
          (skipped > 0 ? `（跳过 ${skipped} 条已导入）` : ''),
      )
      queryClient.invalidateQueries({ queryKey: ['calendar-accounts'] })
    } catch (err: any) {
      message.error(err.message || '同步失败')
    } finally {
      setPullEventsLoading(false)
    }
  }

  const accounts = accountsQuery.data || []

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text type="secondary" style={{ fontSize: 13 }}>
          已绑定 {accounts.length} 个日历账户
        </Text>
        <Space wrap>
          <Dropdown
            menu={{
              items: [
                { key: 'all', label: '全部渠道（飞书 + 钉钉）' },
                { key: 'feishu', label: '仅飞书' },
                { key: 'dingtalk', label: '仅钉钉' },
              ],
              onClick: ({ key }) =>
                handlePullEvents(key === 'all' ? ['feishu', 'dingtalk'] : [key as ImProvider]),
            }}
          >
            <Button icon={<CloudDownloadOutlined />} loading={pullEventsLoading}>
              同步日历事件为个人计划 <DownOutlined />
            </Button>
          </Dropdown>
          <Button icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)}>
            同步设置
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setBindModalOpen(true)}>
            绑定日历
          </Button>
        </Space>
      </div>

      {/* 渠道连接状态 */}
      <Card size="small" style={{ marginBottom: 16 }} title="渠道状态">
        <Row gutter={[12, 12]}>
          {(statusQuery.data ?? []).map((s) => {
            const meta = providerMeta(s.provider)
            return (
              <Col key={s.provider} xs={24} sm={12}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <Space>
                    <Badge status={s.connected ? 'success' : 'default'} />
                    <Text strong>{meta.name}</Text>
                    <Tag color={meta.color} style={{ marginInlineEnd: 0 }}>
                      {s.channel === 'mcp' ? 'MCP' : s.channel === 'openapi' ? 'OpenAPI' : 'Mock'}
                    </Tag>
                  </Space>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {s.connected
                      ? `${s.accountName ?? '已连接'}${
                          s.lastSyncAt
                            ? ` · 上次同步 ${dayjs(s.lastSyncAt).format('MM-DD HH:mm')}`
                            : ''
                        }`
                      : s.error ?? '未连接'}
                  </Text>
                </div>
              </Col>
            )
          })}
        </Row>
        <Divider style={{ margin: '12px 0' }} />
        <Text type="secondary" style={{ fontSize: 12 }}>
          当前为演示通道：MCP / OpenAPI 未接入时自动降级为 Mock，接口形状与真实实现一致；配置后端
          /integrations 代理并连接钉钉、飞书 MCP 后即可切换真实链路。
        </Text>
      </Card>

      {accounts.length === 0 ? (
        <Card>
          <Empty
            description="暂无绑定的日历"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setBindModalOpen(true)}>
              绑定飞书日历
            </Button>
          </Empty>
        </Card>
      ) : (
        <List
          dataSource={accounts}
          renderItem={(account: CalendarAccount) => (
            <List.Item
              actions={[
                <Button
                  key="sync"
                  size="small"
                  type="text"
                  icon={<SyncOutlined />}
                  loading={syncAllLoading}
                  onClick={() => handleSyncAll(account.id)}
                >
                  全量同步
                </Button>,
                <Popconfirm
                  key="unbind"
                  title="确定解绑此日历账户？"
                  description="解绑后所有同步的日历事件不会自动删除，但将停止后续同步。"
                  okText="解绑"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => unbindMutation.mutate(account.id)}
                >
                  <Button size="small" danger type="text" icon={<DeleteOutlined />}>
                    解绑
                  </Button>
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space>
                    <CalendarOutlined />
                    <strong>{account.accountName}</strong>
                    <Tag color="blue">{providerName(account.provider)}</Tag>
                    {account.failureCount >= 5 ? (
                      <Tag color="red">已暂停</Tag>
                    ) : account.isActive ? (
                      <Tag color="green">已启用</Tag>
                    ) : (
                      <Tag>已停用</Tag>
                    )}
                  </Space>
                }
                description={
                  <Space wrap size={[8, 4]} style={{ marginTop: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      日历 ID: {account.calendarId}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      已同步 {account.syncCount} 次
                    </Text>
                    {account.failureCount > 0 && (
                      <Text type="warning" style={{ fontSize: 12 }}>
                        连续失败 {account.failureCount} 次
                      </Text>
                    )}
                    {account.lastSyncedAt && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        最后同步: {new Date(account.lastSyncedAt).toLocaleString('zh-CN')}
                      </Text>
                    )}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}

      {/* 绑定弹窗 */}
      <BindCalendarModal
        open={bindModalOpen}
        onClose={() => setBindModalOpen(false)}
        providers={providersQuery.data || []}
        onSuccess={() => {
          setBindModalOpen(false)
          queryClient.invalidateQueries({ queryKey: ['calendar-accounts'] })
          message.success('绑定成功')
        }}
      />

      {/* 同步设置抽屉 */}
      <Drawer
        title="同步设置"
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        width={420}
        destroyOnHidden
        extra={
          <Button
            size="small"
            onClick={() => {
              reset()
              message.success('已恢复默认设置')
            }}
          >
            恢复默认
          </Button>
        }
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div>
            <Text strong>同步渠道</Text>
            <div style={{ marginTop: 8 }}>
              <Space wrap>
                {PROVIDERS.map((p) => {
                  const on = settings.providers.includes(p.id)
                  return (
                    <Tag
                      key={p.id}
                      color={on ? p.color : 'default'}
                      style={{ cursor: 'pointer', marginInlineEnd: 0 }}
                      onClick={() =>
                        update({
                          providers: on
                            ? settings.providers.filter((x) => x !== p.id)
                            : [...settings.providers, p.id],
                        })
                      }
                    >
                      {p.name}
                      {on ? ' · 已启用' : ' · 未启用'}
                    </Tag>
                  )
                })}
              </Space>
            </div>
          </div>

          <Divider style={{ margin: 0 }} />

          <SettingRow title="推送到外部日历" desc="任务 / 项目单向推送为日历事件">
            <Switch
              checked={settings.pushEnabled}
              onChange={(v) => update({ pushEnabled: v })}
            />
          </SettingRow>

          <SettingRow title="拉取为个人计划" desc="外部日历事件反向同步进工作台">
            <Switch
              checked={settings.pullEnabled}
              onChange={(v) => update({ pullEnabled: v })}
            />
          </SettingRow>

          <Divider style={{ margin: 0 }} />

          <div>
            <Text>同步范围</Text>
            <div style={{ marginTop: 8 }}>
              <Radio.Group
                value={settings.scope}
                onChange={(e) => update({ scope: e.target.value })}
              >
                <Radio value="mine">仅我</Radio>
                <Radio value="team">全团队</Radio>
              </Radio.Group>
            </div>
          </div>

          <div>
            <Text>同步频率</Text>
            <div style={{ marginTop: 8 }}>
              <Radio.Group
                value={settings.frequency}
                onChange={(e) => update({ frequency: e.target.value })}
              >
                <Radio value="manual">手动</Radio>
                <Radio value="hourly">每小时</Radio>
                <Radio value="daily">每日</Radio>
              </Radio.Group>
            </div>
          </div>

          <div>
            <Text>冲突策略</Text>
            <div style={{ marginTop: 8 }}>
              <Radio.Group
                value={settings.conflict}
                onChange={(e) => update({ conflict: e.target.value })}
              >
                <Radio value="skip">跳过（保留工作台数据）</Radio>
                <Radio value="overwrite">覆盖（以外部为准）</Radio>
                <Radio value="duplicate">新建副本</Radio>
              </Radio.Group>
            </div>
          </div>

          <Alert
            type="info"
            showIcon
            message="关于同步方向"
            description="任务/项目可同步到飞书、钉钉日历（单向推送到日历）；飞书、钉钉日历中的记录事件可作为「个人计划」反向同步进工作台。反向同步以「渠道 + 事件 ID」判重，重复点击不会产生重复计划。"
          />
        </Space>
      </Drawer>

      <Alert
        type="info"
        showIcon
        message="关于同步方向"
        description="支持双向同步：任务/项目可同步到飞书、钉钉日历（单向推送到日历）；两个渠道中的记录事件均可作为「个人计划」反向同步进工作台（点击上方「同步日历事件为个人计划」选择渠道）。"
        style={{ marginTop: 20 }}
      />
    </div>
  )
}

/** 设置行：标题 + 说明 + 右侧控件 */
function SettingRow({
  title,
  desc,
  children,
}: {
  title: string
  desc: string
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <Text strong>{title}</Text>
        <div style={{ fontSize: 12, marginTop: 2 }}>
          <Text type="secondary">{desc}</Text>
        </div>
      </div>
      {children}
    </div>
  )
}

function providerName(provider: string): string {
  const map: Record<string, string> = { feishu: '飞书日历' }
  return map[provider] || provider
}

function BindCalendarModal({ open, onClose, providers, onSuccess }: any) {
  const [form] = Form.useForm()

  const bindMutation = useMutation({
    mutationFn: (values: any) => calendarApi.bindCalendarAccount(values),
    onSuccess: () => {
      onSuccess()
    },
  })

  const handleSubmit = async () => {
    const values = await form.validateFields()
    bindMutation.mutate(values)
  }

  return (
    <Modal
      title="绑定日历账户"
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      okText="绑定"
      confirmLoading={bindMutation.isPending}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="provider"
          label="日历提供商"
          initialValue="feishu"
          rules={[{ required: true }]}
        >
          <Select>
            {providers.map((p: any) => (
              <Option key={p.provider} value={p.provider}>
                {p.name}
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="accountName"
          label="账户名称"
          rules={[{ required: true, message: '请输入账户名称' }]}
        >
          <Input placeholder="例如：我的飞书日历" maxLength={50} />
        </Form.Item>

        <Form.Item name="calendarId" label="日历 ID（可选）">
          <Input placeholder="留空使用主日历" />
        </Form.Item>
      </Form>

      <Alert
        type="warning"
        showIcon
        message="v1 说明"
        description="当前为开发模式，绑定使用 mock 数据。生产环境将跳转到飞书 OAuth 授权页面。"
        style={{ marginTop: 8 }}
      />
    </Modal>
  )
}

// ========== Tab 2：忙闲查询 ==========

function BusyFreeTab({ isManager }: { isManager: boolean }) {
  const currentUser = useMe()
  const [selectedUsers, setSelectedUsers] = useState<string[]>(isManager ? ['user-001', 'user-002', 'user-003'] : ['user-001'])
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('week'),
    dayjs().endOf('week'),
  ])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const userOptions = [
    { id: 'user-001', name: '张三（产品）' },
    { id: 'user-002', name: '李四（前端）' },
    { id: 'user-003', name: '王五（后端）' },
    { id: 'user-004', name: '赵六（设计）' },
    { id: 'user-005', name: '钱七（测试）' },
  ]

  // 普通人员仅可查询自己：固定为当前登录用户，且禁用多选
  const selfOption = userOptions.find((u) => u.id === currentUser.id) ?? userOptions[0]

  const handleQuery = async () => {
    if (selectedUsers.length === 0) {
      message.warning('请选择至少一个成员')
      return
    }
    setLoading(true)
    try {
      const start = dateRange[0].format('YYYY-MM-DD')
      const end = dateRange[1].format('YYYY-MM-DD')
      const data = await calendarApi.getBatchBusyFree(selectedUsers, start, end)
      setResult(data)
    } catch (err: any) {
      message.error(err.message || '查询失败')
    } finally {
      setLoading(false)
    }
  }

  // 构造热力图数据
  const heatmapData: Record<string, DayLoad[]> = {}
  const userNames: Record<string, string> = {}
  if (result) {
    const users = isManager ? selectedUsers : [currentUser.id]
    for (const uid of users) {
      const userResult = result.perUser[uid]
      if (userResult) {
        heatmapData[uid] = userResult.dayLoads
        const found = userOptions.find(u => u.id === uid)
        userNames[uid] = found ? found.name : uid
      }
    }
  }

  // 普通人员查询的直接限定为自己的 userId（currentUser.id）
  const effectiveUsers = isManager ? selectedUsers : [currentUser.id]

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: 16 }}>
        <Row gutter={16} align="middle">
          <Col flex="200px">
            <Text strong style={{ display: 'block', marginBottom: 4 }}>选择成员</Text>
            {isManager ? (
              <Select
                mode="multiple"
                placeholder="选择团队成员"
                value={selectedUsers}
                onChange={setSelectedUsers}
                style={{ width: '100%' }}
                maxTagCount={3}
              >
                {userOptions.map(u => (
                  <Option key={u.id} value={u.id}>{u.name}</Option>
                ))}
              </Select>
            ) : (
              <Select
                value={currentUser.id}
                disabled
                style={{ width: '100%' }}
              >
                <Option value={selfOption.id}>{selfOption.name}（仅自己）</Option>
              </Select>
            )}
          </Col>
          <Col flex="260px">
            <Text strong style={{ display: 'block', marginBottom: 4 }}>日期范围</Text>
            <RangePicker
              value={dateRange as any}
              onChange={(vals: any) => vals && setDateRange(vals)}
              style={{ width: '100%' }}
            />
          </Col>
          <Col flex="auto">
            <Button
              type="primary"
              icon={<TeamOutlined />}
              loading={loading}
              onClick={handleQuery}
              style={{ marginTop: 22 }}
            >
              查询忙闲
            </Button>
          </Col>
        </Row>
      </Card>

      {result ? (
        <>
          {/* 热力图 */}
          <Card title="忙闲热力图" size="small" style={{ marginBottom: 16 }}>
            <BusyFreeHeatmap userLoads={heatmapData} userNames={userNames} />
          </Card>

          {/* 共同空闲时段 */}
          <Card
            title={
              <span>
                <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 6 }} />
                共同空闲时段（{effectiveUsers.length} 人都有空）
              </span>
            }
            size="small"
          >
            {result.commonFreeSlots?.length > 0 ? (
              result.commonFreeSlots.map((day: DayFreeSlots) => (
                <div key={day.date} style={{ marginBottom: 12 }}>
                  <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>
                    {day.date}（周{['日','一','二','三','四','五','六'][new Date(day.date).getDay()]}）
                  </Text>
                  <Space wrap>
                    {day.slots.map((slot, i) => (
                      <Tag key={i} color="green" style={{ fontSize: 12, padding: '4px 10px' }}>
                        {formatTime(slot.start)} – {formatTime(slot.end)}
                      </Tag>
                    ))}
                  </Space>
                </div>
              ))
            ) : (
              <Empty description="这段时间没有共同空闲" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </>
      ) : (
        <Empty
          description="选择成员和日期范围后点击查询"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      )}
    </div>
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ========== Tab 3：同步日志 ==========

function SyncLogsTab() {
  // v1 简化：展示 mock 日志列表
  const logs = [
    { id: 1, time: '2026-08-21 10:30:00', action: '全量同步', account: '我的飞书日历', status: 'success', detail: '成功 23 条 / 跳过 2 条' },
    { id: 2, time: '2026-08-21 09:15:00', action: '单任务同步', account: '我的飞书日历', status: 'success', detail: '任务「完成 API 设计」已同步' },
    { id: 3, time: '2026-08-20 18:00:00', action: '全量同步', account: '我的飞书日历', status: 'success', detail: '成功 25 条 / 失败 0 条' },
    { id: 4, time: '2026-08-20 14:20:00', action: '单任务同步', account: '我的飞书日历', status: 'failed', detail: '错误：日历 API 调用超时' },
    { id: 5, time: '2026-08-20 10:00:00', action: '绑定账户', account: '我的飞书日历', status: 'success', detail: '飞书日历绑定成功' },
  ]

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <Card size="small" bodyStyle={{ padding: 0 }}>
        <List
          dataSource={logs}
          renderItem={(item: any) => (
            <List.Item>
              <List.Item.Meta
                avatar={
                  item.status === 'success'
                    ? <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />
                    : <ExclamationCircleOutlined style={{ color: '#ff4d4f', fontSize: 20 }} />
                }
                title={
                  <Space>
                    <strong>{item.action}</strong>
                    <Tag>{item.account}</Tag>
                    {item.status === 'success' ? (
                      <Tag color="green">成功</Tag>
                    ) : (
                      <Tag color="red">失败</Tag>
                    )}
                  </Space>
                }
                description={item.detail}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>{item.time}</Text>
            </List.Item>
          )}
        />
      </Card>

      <Alert
        type="info"
        showIcon
        message="日志范围"
        description="v1 同步日志为静态演示数据。生产环境将记录最近 30 天的同步操作日志，包含成功/失败详情和耗时。"
        style={{ marginTop: 12 }}
      />
    </div>
  )
}
