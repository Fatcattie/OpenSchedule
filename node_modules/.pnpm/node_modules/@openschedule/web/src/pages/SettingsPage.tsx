/**
 * SettingsPage —— 系统设置页（B22）
 * 含 AI 模型 / API Keys / Webhook / 通知偏好 / 演示偏好
 */
import { useEffect, useState } from 'react'
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
  Switch,
  List,
  Empty,
  Space,
  Typography,
  Popconfirm,
  message,
  Badge,
  Divider,
  Alert,
} from 'antd'
import {
  PlusOutlined,
  KeyOutlined,
  ApiOutlined,
  DeleteOutlined,
  EditOutlined,
  BulbOutlined,
  SendOutlined,
  CopyOutlined,
  WarningOutlined,
  BellOutlined,
  ExperimentOutlined,
  RobotOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsApi } from '@/api/settingsApi'
import type { WebhookEvent, Webhook } from '@/types'
import { getNotificationPreferences, updateNotificationPreferences } from '@/api/notificationApi'
import { useCurrentRole } from '@/hooks/useCurrentRole'
import LlmSettingsTab from '@/components/settings/LlmSettingsTab'


const { Title, Text } = Typography
const { Option } = Select

const ALL_SCOPES = [
  { value: 'projects:read', label: '项目：读取', group: '项目' },
  { value: 'projects:write', label: '项目：写入', group: '项目' },
  { value: 'tasks:read', label: '任务：读取', group: '任务' },
  { value: 'tasks:write', label: '任务：写入', group: '任务' },
  { value: 'reports:read', label: '报表：读取', group: '报表' },
  { value: 'webhooks:read', label: 'Webhook：读取', group: 'Webhook' },
  { value: 'webhooks:write', label: 'Webhook：写入', group: 'Webhook' },
  { value: '*', label: '全部权限', group: '全部' },
]

export default function SettingsPage() {
  const [activeKey, setActiveKey] = useState('ai-model')

  const items = [
    { key: 'ai-model', label: <span><RobotOutlined /> AI 模型</span>, children: <LlmSettingsTab /> },
    { key: 'api-keys', label: <span><KeyOutlined /> API Keys</span>, children: <ApiKeysTab /> },
    { key: 'webhooks', label: <span><ApiOutlined /> Webhook</span>, children: <WebhooksTab /> },
    { key: 'notifications', label: <span><BellOutlined /> 通知偏好</span>, children: <NotificationPreferencesTab /> },
    { key: 'demo', label: <span><ExperimentOutlined /> 演示偏好</span>, children: <DemoPreferencesTab /> },
  ]

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
      <Title level={4} style={{ marginBottom: 4 }}>
        <BulbOutlined style={{ marginRight: 8 }} />
        系统设置
      </Title>
      <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 20 }}>
        AI 模型、开放 API、Webhook、通知偏好与演示偏好
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

// ========== 通知偏好 Tab ==========

function NotificationPreferencesTab() {
  const queryClient = useQueryClient()
  const preferencesQuery = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: getNotificationPreferences,
  })
  const [eventType, setEventType] = useState('*')
  const [channels, setChannels] = useState({ email: false, push: false, im: false })

  const selected = preferencesQuery.data?.find((item) => item.eventType === eventType)
  useEffect(() => {
    const next = preferencesQuery.data?.find((item) => item.eventType === eventType)
    if (next) setChannels({ email: next.channels.email === true, push: next.channels.push === true, im: next.channels.im === true })
  }, [eventType, preferencesQuery.data])
  const saveMutation = useMutation({
    mutationFn: () => updateNotificationPreferences({ eventType, channels }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] })
      message.success('通知偏好已保存')
    },
  })

  const selectEvent = (value: string) => {
    setEventType(value)
    const next = preferencesQuery.data?.find((item) => item.eventType === value)
    setChannels({ email: next?.channels.email === true, push: next?.channels.push === true, im: next?.channels.im === true })
  }

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        站内通知始终保留；这里控制邮件、推送和 IM 外发通道。
      </Text>
      <Form layout="vertical">
        <Form.Item label="事件类型">
          <Select value={eventType} onChange={selectEvent} style={{ maxWidth: 420 }}>
            {(preferencesQuery.data ?? [{ eventType: '*' }]).map((item) => (
              <Option key={item.eventType} value={item.eventType}>{item.eventType === '*' ? '默认（全部事件）' : item.eventType}</Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item label="外发通道">
          <Space direction="vertical">
            {(['email', 'push', 'im'] as const).map((channel) => (
              <Switch
                key={channel}
                checked={channels[channel]}
                onChange={(checked) => setChannels((current) => ({ ...current, [channel]: checked }))}
                checkedChildren={channel.toUpperCase()}
                unCheckedChildren={channel.toUpperCase()}
              />
            ))}
          </Space>
        </Form.Item>
        <Button type="primary" loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          保存偏好
        </Button>
      </Form>
      {selected && <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>当前配置：{JSON.stringify(selected.channels)}</Text>}
    </div>
  )
}

// ========== 演示偏好 Tab ==========

function DemoPreferencesTab() {
  const role = useCurrentRole()

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <Alert
        type="info"
        showIcon
        message="当前角色"
        description="角色由当前 Bearer 会话的 /auth/me.roles 服务端声明推导，不再支持 localStorage 角色切换。"
        style={{ marginBottom: 16 }}
      />
      <Form layout="vertical">
        <Form.Item label="当前服务端角色">
          <Tag color={role === 'manager' ? 'blue' : 'gold'}>
            {role === 'manager' ? '管理人员' : '普通人员'}
          </Tag>
        </Form.Item>
      </Form>
    </div>
  )
}

// ========== API Keys Tab ==========

function ApiKeysTab() {
  const queryClient = useQueryClient()
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)

  const keysQuery = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => settingsApi.listApiKeys(),
  })

  const createMutation = useMutation({
    mutationFn: (values: any) => {
      const input: any = {
        name: values.name,
        scopes: values.scopes,
      }
      if (values.expiresAt) {
        input.expiresAt = values.expiresAt.toISOString()
      }
      return settingsApi.createApiKey(input)
    },
    onSuccess: data => {
      setCreatedKey(data.secret)
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
    },
  })

  const revokeMutation = useMutation({
    mutationFn: (id: string) => settingsApi.revokeApiKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      message.success('API Key 已吊销')
    },
  })

  const handleCreate = () => {
    setCreatedKey(null)
    setCreateModalOpen(true)
  }

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text type="secondary" style={{ fontSize: 13 }}>
          共 {keysQuery.data?.length || 0} 个 API Key
        </Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          创建 API Key
        </Button>
      </div>

      {keysQuery.data?.length === 0 ? (
        <Card>
          <Empty description="暂无 API Key" image={Empty.PRESENTED_IMAGE_SIMPLE}>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
              创建第一个 API Key
            </Button>
          </Empty>
        </Card>
      ) : (
        <List
          dataSource={keysQuery.data || []}
          renderItem={item => (
            <List.Item
              actions={[
                <Popconfirm
                  key="revoke"
                  title="确定吊销此 API Key？"
                  description="吊销后无法恢复，使用此 Key 的所有集成将立即失效。"
                  okText="吊销"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => revokeMutation.mutate(item.id)}
                >
                  <Button size="small" danger type="text" icon={<DeleteOutlined />}>
                    吊销
                  </Button>
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space>
                    <KeyOutlined />
                    <strong>{item.name}</strong>
                    <Text code copyable>{item.keyPrefix}</Text>
                  </Space>
                }
                description={
                  <Space wrap size={[8, 4]} style={{ marginTop: 4 }}>
                    {item.scopes.includes('*') ? (
                      <Tag color="red">全部权限</Tag>
                    ) : (
                      item.scopes.map(s => <Tag key={s}>{scopeLabel(s)}</Tag>)
                    )}
                    {item.expiresAt ? (
                      <Tag icon={<WarningOutlined />} color={isExpired(item.expiresAt) ? 'default' : 'orange'}>
                        {isExpired(item.expiresAt) ? '已过期' : `过期: ${formatDate(item.expiresAt)}`}
                      </Tag>
                    ) : (
                      <Tag color="green">永不过期</Tag>
                    )}
                    {item.lastUsedAt && (
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        最后使用: {formatDate(item.lastUsedAt)}
                      </Text>
                    )}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}

      {/* 创建弹窗 */}
      <CreateApiKeyModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSubmit={(values: any) => createMutation.mutate(values)}
        loading={createMutation.isPending}
        createdKey={createdKey}
        onCreatedDone={() => {
          setCreateModalOpen(false)
          setCreatedKey(null)
        }}
      />
    </div>
  )
}

function scopeLabel(scope: string): string {
  const found = ALL_SCOPES.find(s => s.value === scope)
  return found ? found.label : scope
}

function isExpired(iso: string): boolean {
  return new Date(iso) < new Date()
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ========== 创建 API Key 弹窗（两步：填表单 → 展示 Key） ==========

function CreateApiKeyModal({
  open, onClose, onSubmit, loading, createdKey, onCreatedDone,
}: any) {
  const [form] = Form.useForm()

  const handleSubmit = async () => {
    const values = await form.validateFields()
    onSubmit(values)
  }

  return (
    <Modal
      title={createdKey ? 'API Key 已创建' : '创建 API Key'}
      open={open}
      onCancel={onClose}
      onOk={createdKey ? onCreatedDone : handleSubmit}
      okText={createdKey ? '完成' : '创建'}
      confirmLoading={loading}
      width={560}
      destroyOnHidden
    >
      {createdKey ? (
        <div>
          <Alert
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            message="请立即复制并妥善保存"
            description="此 Key 仅显示一次，关闭后无法再次查看。如果丢失，请创建新的 Key。"
            style={{ marginBottom: 16 }}
          />
          <div style={{ padding: 12, background: '#f5f5f5', borderRadius: 6, fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {createdKey}
          </div>
          <Button
            icon={<CopyOutlined />}
            style={{ marginTop: 12 }}
            onClick={() => {
              navigator.clipboard?.writeText(createdKey)
              message.success('已复制到剪贴板')
            }}
          >
            复制 Key
          </Button>
        </div>
      ) : (
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="Key 名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="例如：CI/CD 流水线" maxLength={100} />
          </Form.Item>

          <Form.Item
            name="scopes"
            label="权限范围"
            initialValue={['*']}
            rules={[{ required: true, message: '请选择权限范围' }]}
          >
            <Select mode="multiple" placeholder="选择权限范围" style={{ width: '100%' }}>
              <Option value="*">全部权限 (*)</Option>
              <Option value="projects:read">projects:read 读取项目</Option>
              <Option value="projects:write">projects:write 写入项目</Option>
              <Option value="tasks:read">tasks:read 读取任务</Option>
              <Option value="tasks:write">tasks:write 写入任务</Option>
              <Option value="reports:read">reports:read 读取报表</Option>
              <Option value="webhooks:read">webhooks:read 读取 Webhook</Option>
              <Option value="webhooks:write">webhooks:write 写入 Webhook</Option>
            </Select>
          </Form.Item>

          <Form.Item name="expiresAt" label="过期时间（可选）">
            <DatePicker style={{ width: '100%' }} placeholder="选择过期时间，不选则永不过期" />
          </Form.Item>
        </Form>
      )}
    </Modal>
  )
}

// ========== Webhook Tab ==========

function WebhooksTab() {
  const queryClient = useQueryClient()
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editingHook, setEditingHook] = useState<Webhook | null>(null)
  const [createdSecret, setCreatedSecret] = useState<string | null>(null)
  const [testModalOpen, setTestModalOpen] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)
  const [testLoading, setTestLoading] = useState(false)

  const hooksQuery = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => settingsApi.listWebhooks(),
  })

  const eventsQuery = useQuery({
    queryKey: ['webhook-events'],
    queryFn: () => settingsApi.listWebhookEvents(),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      settingsApi.toggleWebhook(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => settingsApi.deleteWebhook(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] })
      message.success('Webhook 已删除')
    },
  })

  const handleCreate = () => {
    setEditingHook(null)
    setCreatedSecret(null)
    setCreateModalOpen(true)
  }

  const handleEdit = (hook: Webhook) => {
    setEditingHook(hook)
    setCreatedSecret(null)
    setCreateModalOpen(true)
  }

  const handleTest = async (id: string) => {
    setTestLoading(true)
    try {
      const result = await settingsApi.testWebhook(id)
      setTestResult(result)
      setTestModalOpen(true)
    } catch (err: any) {
      message.error(err.message || '测试失败')
    } finally {
      setTestLoading(false)
    }
  }

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text type="secondary" style={{ fontSize: 13 }}>
          共 {hooksQuery.data?.length || 0} 个 Webhook ｜ 支持 {eventsQuery.data?.length || 7} 种事件
        </Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          添加 Webhook
        </Button>
      </div>

      {hooksQuery.data?.length === 0 ? (
        <Card>
          <Empty description="暂无 Webhook" image={Empty.PRESENTED_IMAGE_SIMPLE}>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
              创建第一个 Webhook
            </Button>
          </Empty>
        </Card>
      ) : (
        <List
          dataSource={hooksQuery.data || []}
          renderItem={hook => (
            <List.Item
              actions={[
                <Button
                  key="test"
                  size="small"
                  type="text"
                  icon={<SendOutlined />}
                  loading={testLoading}
                  onClick={() => handleTest(hook.id)}
                >
                  测试
                </Button>,
                <Button key="edit" size="small" type="text" icon={<EditOutlined />} onClick={() => handleEdit(hook)}>
                  编辑
                </Button>,
                <Popconfirm
                  key="delete"
                  title="确定删除此 Webhook？"
                  onConfirm={() => deleteMutation.mutate(hook.id)}
                >
                  <Button size="small" danger type="text" icon={<DeleteOutlined />}>
                    删除
                  </Button>
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space>
                    <Badge status={hook.isActive ? 'processing' : 'default'} />
                    <strong>{hook.name}</strong>
                    {hook.failureCount >= 5 && <Tag color="red">已熔断</Tag>}
                  </Space>
                }
                description={
                  <div>
                    <div style={{ marginBottom: 6 }}>
                      <Text code style={{ fontSize: 12 }}>{hook.url}</Text>
                    </div>
                    <Space wrap size={[6, 4]}>
                      {hook.events.slice(0, 4).map(ev => (
                        <Tag key={ev} color="blue">{ev}</Tag>
                      ))}
                      {hook.events.length > 4 && (
                        <Tag>+{hook.events.length - 4}</Tag>
                      )}
                      <Tag>触发 {hook.triggerCount} 次</Tag>
                      {hook.failureCount > 0 && (
                        <Tag color="orange">失败 {hook.failureCount} 次</Tag>
                      )}
                      <Switch
                        size="small"
                        checked={hook.isActive}
                        onChange={checked => toggleMutation.mutate({ id: hook.id, isActive: checked })}
                      />
                    </Space>
                  </div>
                }
              />
            </List.Item>
          )}
        />
      )}

      {/* 新建/编辑弹窗 */}
      <WebhookEditModal
        open={createModalOpen}
        hook={editingHook}
        events={eventsQuery.data || []}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={() => {
          setCreateModalOpen(false)
          queryClient.invalidateQueries({ queryKey: ['webhooks'] })
        }}
        createdSecret={createdSecret}
        onCreated={(secret) => setCreatedSecret(secret)}
      />

      {/* 测试结果弹窗 */}
      <Modal
        title="Webhook 测试"
        open={testModalOpen}
        onCancel={() => setTestModalOpen(false)}
        footer={<Button onClick={() => setTestModalOpen(false)}>关闭</Button>}
        width={640}
      >
        {testResult && (
          <div>
            <Alert
              type="info"
              showIcon
              message={testResult.note}
              style={{ marginBottom: 16 }}
            />
            <Divider orientation="left" style={{ fontSize: 12 }}>目标 URL</Divider>
            <Text code style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
              {testResult.wouldSendTo}
            </Text>
            <Divider orientation="left" style={{ fontSize: 12 }}>请求头</Divider>
            <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 6, fontSize: 12, overflow: 'auto' }}>
              {Object.entries(testResult.headers as Record<string, string>).map(([k, v]) => (
                <div key={k}>{k}: {String(v)}</div>
              ))}
            </pre>
            <Divider orientation="left" style={{ fontSize: 12 }}>Payload</Divider>
            <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 6, fontSize: 12, overflow: 'auto' }}>
              {JSON.stringify(testResult.payload, null, 2)}
            </pre>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ========== Webhook 编辑弹窗 ==========

function WebhookEditModal({
  open, hook, events, onClose, onSuccess, createdSecret, onCreated,
}: {
  open: boolean
  hook: Webhook | null
  events: WebhookEvent[]
  onClose: () => void
  onSuccess: () => void
  createdSecret: string | null
  onCreated: (secret: string) => void
}) {
  const [form] = Form.useForm()
  const queryClient = useQueryClient()
  const isEdit = !!hook

  const createMutation = useMutation({
    mutationFn: (values: any) => settingsApi.createWebhook(values),
    onSuccess: data => {
      onCreated(data.signingSecret)
      queryClient.invalidateQueries({ queryKey: ['webhooks'] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (values: any) => settingsApi.updateWebhook(hook!.id, values),
    onSuccess: () => {
      message.success('Webhook 已更新')
      queryClient.invalidateQueries({ queryKey: ['webhooks'] })
      onSuccess()
    },
  })

  const handleSubmit = async () => {
    const values = await form.validateFields()
    if (isEdit) {
      updateMutation.mutate(values)
    } else {
      createMutation.mutate(values)
    }
  }

  return (
    <Modal
      title={createdSecret ? 'Webhook 已创建' : (isEdit ? '编辑 Webhook' : '添加 Webhook')}
      open={open}
      onCancel={onClose}
      onOk={createdSecret ? onSuccess : handleSubmit}
      okText={createdSecret ? '完成' : (isEdit ? '保存' : '创建')}
      confirmLoading={createMutation.isPending || updateMutation.isPending}
      width={560}
      destroyOnHidden
    >
      {createdSecret ? (
        <div>
          <Alert
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            message="请立即复制签名密钥"
            description="此密钥仅显示一次，用于验证 Webhook 请求签名。请妥善保存，丢失后无法找回。"
            style={{ marginBottom: 16 }}
          />
          <div style={{ padding: 12, background: '#f5f5f5', borderRadius: 6, fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {createdSecret}
          </div>
          <Button
            icon={<CopyOutlined />}
            style={{ marginTop: 12 }}
            onClick={() => {
              navigator.clipboard?.writeText(createdSecret)
              message.success('已复制到剪贴板')
            }}
          >
            复制密钥
          </Button>
        </div>
      ) : (
        <Form
          form={form}
          layout="vertical"
          initialValues={hook ? {
            name: hook.name,
            url: hook.url,
            events: hook.events,
            isActive: hook.isActive,
          } : { isActive: true, events: [] }}
        >
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input placeholder="例如：飞书任务同步" maxLength={100} />
          </Form.Item>

          <Form.Item name="url" label="目标 URL" rules={[{ required: true, type: 'url', message: '请输入有效 URL' }]}>
            <Input placeholder="https://example.com/webhook" />
          </Form.Item>

          <Form.Item
            name="events"
            label="订阅事件"
            rules={[{ required: true, message: '至少选择一个事件' }]}
          >
            <Select mode="multiple" placeholder="选择要订阅的事件" style={{ width: '100%' }}>
              {events.map((e: WebhookEvent) => (
                <Option key={e.type} value={e.type}>
                  {e.name} — {e.description}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="isActive" label="立即启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      )}
    </Modal>
  )
}
