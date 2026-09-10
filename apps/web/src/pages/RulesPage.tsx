/**
 * RulesPage —— 自动化规则管理页（B20）
 * 功能：规则列表 + 启停 + 新建/编辑 + 预设模板快速创建 + 测试触发
 */
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import {
  Card,
  Button,
  Switch,
  Tag,
  Typography,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  Space,
  List,
  Empty,
  Popconfirm,
  message,
  Divider,
  Badge,
} from 'antd'
import {
  PlusOutlined,
  BulbOutlined,
  DeleteOutlined,
  EditOutlined,
  RobotOutlined,
  ClockCircleOutlined,
  TagOutlined,
  ArrowUpOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { automationApi } from '@/api/automationApi'
import type { AutomationRule, RuleTemplate, TriggerType, ActionType } from '@/types'

const { Title, Text } = Typography
const { TextArea } = Input
const { Option } = Select

const TRIGGER_LABELS: Record<TriggerType, { label: string; icon: any; color: string }> = {
  task_overdue: { label: '任务逾期', icon: ClockCircleOutlined, color: 'red' },
  task_due_soon: { label: '临期提醒', icon: ClockCircleOutlined, color: 'orange' },
  status_changed: { label: '状态变更', icon: RobotOutlined, color: 'blue' },
  label_added: { label: '添加标签', icon: TagOutlined, color: 'green' },
  label_removed: { label: '移除标签', icon: TagOutlined, color: 'default' },
  priority_changed: { label: '优先级变更', icon: ArrowUpOutlined, color: 'purple' },
}

const ACTION_LABELS: Record<ActionType, string> = {
  set_priority: '设置优先级',
  set_status: '设置状态',
  set_assignee: '设置负责人',
  add_label: '添加标签',
  remove_label: '移除标签',
  add_comment: '添加评论',
  send_notification: '发送通知',
}

export default function RulesPage() {
  const { projectId = '' } = useParams<{ projectId: string }>()
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null)
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [triggerFilter, setTriggerFilter] = useState<string | undefined>()
  const [enabledFilter, setEnabledFilter] = useState<boolean | undefined>(undefined)

  const rulesQuery = useQuery({
    queryKey: ['rules', projectId, triggerFilter, enabledFilter],
    queryFn: () => automationApi.listRules({ projectId, triggerType: triggerFilter, isEnabled: enabledFilter }),
  })

  const templatesQuery = useQuery({
    queryKey: ['rule-templates'],
    queryFn: () => automationApi.listTemplates(),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      automationApi.toggleRule(id, isEnabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] })
      message.success('规则状态已更新')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => automationApi.deleteRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] })
      message.success('规则已删除')
    },
  })

  const handleCreate = () => {
    setEditingRule(null)
    setModalOpen(true)
  }

  const handleEdit = (rule: AutomationRule) => {
    setEditingRule(rule)
    setModalOpen(true)
  }

  const handleUseTemplate = (tpl: RuleTemplate) => {
    setEditingRule({
      ...tpl,
      id: '',
      isEnabled: false,
      isSystem: false,
      triggerCount: 0,
      createdAt: '',
      updatedAt: '',
    } as any)
    setTemplateModalOpen(false)
    setModalOpen(true)
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            <RobotOutlined style={{ marginRight: 8 }} />
            自动化规则
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            通过 IFTTT 规则自动处理重复性工作，让项目管理更轻松
          </Text>
        </div>
        <Space>
          <Button icon={<BulbOutlined />} onClick={() => setTemplateModalOpen(true)}>
            使用模板
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            新建规则
          </Button>
        </Space>
      </div>

      {/* 筛选条 */}
      <Card size="small" style={{ marginBottom: 16 }} bodyStyle={{ padding: '8px 16px' }}>
        <Space>
          <Text type="secondary" style={{ fontSize: 12 }}>触发器：</Text>
          <Select
            size="small"
            style={{ width: 120 }}
            allowClear
            value={triggerFilter}
            onChange={setTriggerFilter}
            placeholder="全部"
          >
            {Object.entries(TRIGGER_LABELS).map(([key, val]) => (
              <Option key={key} value={key}>{val.label}</Option>
            ))}
          </Select>
          <Divider type="vertical" />
          <Text type="secondary" style={{ fontSize: 12 }}>状态：</Text>
          <Select
            size="small"
            style={{ width: 100 }}
            allowClear
            value={enabledFilter === undefined ? undefined : String(enabledFilter)}
            onChange={v => setEnabledFilter(v === undefined ? undefined : v === 'true')}
            placeholder="全部"
          >
            <Option value="true">已启用</Option>
            <Option value="false">已禁用</Option>
          </Select>
        </Space>
      </Card>

      {/* 规则列表 */}
      {rulesQuery.isLoading ? (
        <Card><Empty description="加载中…" /></Card>
      ) : rulesQuery.data?.length === 0 ? (
        <Card>
          <Empty
            description="暂无规则"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
              创建第一条规则
            </Button>
          </Empty>
        </Card>
      ) : (
        <List
          grid={{ gutter: 12, xs: 1, sm: 1, md: 2, lg: 2 }}
          dataSource={rulesQuery.data || []}
          renderItem={rule => (
            <List.Item>
              <Card
                size="small"
                title={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Badge status={rule.isEnabled ? 'processing' : 'default'} />
                    <span style={{ fontWeight: 500 }}>{rule.name}</span>
                    {rule.isSystem && <Tag color="purple">系统</Tag>}
                  </div>
                }
                extra={
                  <Switch
                    size="small"
                    checked={rule.isEnabled}
                    disabled={rule.isSystem}
                    onChange={checked => toggleMutation.mutate({ id: rule.id, isEnabled: checked })}
                  />
                }
                style={{ height: '100%' }}
              >
                <div style={{ marginBottom: 10 }}>
                  <Tag color={TRIGGER_LABELS[rule.triggerType as TriggerType]?.color || 'default'}>
                    {TRIGGER_LABELS[rule.triggerType as TriggerType]?.label || rule.triggerType}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    → {rule.actions.length} 个动作
                  </Text>
                </div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', minHeight: 36 }}>
                  {rule.description || '暂无描述'}
                </Text>
                <Divider style={{ margin: '8px 0' }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    触发 {rule.triggerCount} 次
                    {rule.lastTriggeredAt && ` · ${formatDate(rule.lastTriggeredAt)}`}
                  </Text>
                  <Space size={4}>
                    <Button size="small" type="text" icon={<EditOutlined />} onClick={() => handleEdit(rule)}>
                      编辑
                    </Button>
                    <Popconfirm
                      title="确定删除此规则？"
                      onConfirm={() => deleteMutation.mutate(rule.id)}
                      disabled={rule.isSystem}
                    >
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} disabled={rule.isSystem}>
                        删除
                      </Button>
                    </Popconfirm>
                  </Space>
                </div>
              </Card>
            </List.Item>
          )}
        />
      )}

      {/* 新建/编辑弹窗 */}
      <RuleEditModal
        open={modalOpen}
        rule={editingRule}
        onClose={() => setModalOpen(false)}
        onSuccess={() => {
          setModalOpen(false)
          queryClient.invalidateQueries({ queryKey: ['rules'] })
        }}
      />

      {/* 模板选择弹窗 */}
      <Modal
        title={
          <span>
            <BulbOutlined style={{ marginRight: 8 }} />
            使用预设模板
          </span>
        }
        open={templateModalOpen}
        onCancel={() => setTemplateModalOpen(false)}
        footer={null}
        width={640}
      >
        <List
          dataSource={templatesQuery.data || []}
          renderItem={tpl => (
            <List.Item
              actions={[
                <Button
                  key="use"
                  type="primary"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => handleUseTemplate(tpl)}
                >
                  使用
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space>
                    <span>{tpl.name}</span>
                    <Tag color={TRIGGER_LABELS[tpl.triggerType as TriggerType]?.color}>
                      {TRIGGER_LABELS[tpl.triggerType as TriggerType]?.label}
                    </Tag>
                    <Tag color="blue">{tpl.category}</Tag>
                  </Space>
                }
                description={tpl.description}
              />
            </List.Item>
          )}
        />
      </Modal>
    </div>
  )
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ========== 规则编辑弹窗 ==========

interface RuleEditModalProps {
  open: boolean
  rule: AutomationRule | null
  onClose: () => void
  onSuccess: () => void
}

function RuleEditModal({ open, rule, onClose, onSuccess }: RuleEditModalProps) {
  const [form] = Form.useForm()
  const queryClient = useQueryClient()
  const isEdit = !!rule

  useEffect(() => {
    if (open) {
      if (rule) {
        form.setFieldsValue({
          name: rule.name,
          description: rule.description,
          triggerType: rule.triggerType,
          triggerConfig: rule.triggerConfig,
          conditionConfig: rule.conditionConfig,
          actions: rule.actions,
          isEnabled: rule.isEnabled,
        })
      } else {
        form.resetFields()
      }
    }
  }, [open, rule, form])

  const createMutation = useMutation({
    mutationFn: (values: any) => {
      if (isEdit && rule) {
        return automationApi.updateRule(rule.id, values)
      }
      return automationApi.createRule(values)
    },
    onSuccess: () => {
      message.success(isEdit ? '规则已更新' : '规则已创建')
      queryClient.invalidateQueries({ queryKey: ['rules'] })
      onSuccess()
    },
    onError: (err: any) => {
      message.error(err.message || '操作失败')
    },
  })

  const handleSubmit = async () => {
    const values = await form.validateFields()
    createMutation.mutate(values)
  }

  return (
    <Modal
      title={isEdit ? '编辑规则' : '新建规则'}
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={createMutation.isPending}
      width={600}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" initialValues={{ triggerType: 'task_overdue', isEnabled: true }}>
        <Form.Item name="name" label="规则名称" rules={[{ required: true, message: '请输入规则名称' }]}>
          <Input placeholder="例如：任务逾期自动提醒" maxLength={100} />
        </Form.Item>

        <Form.Item name="description" label="描述">
          <TextArea rows={2} placeholder="简要描述规则的作用" maxLength={200} />
        </Form.Item>

        <Form.Item name="triggerType" label="触发器" rules={[{ required: true }]}>
          <Select>
            {Object.entries(TRIGGER_LABELS).map(([key, val]) => (
              <Option key={key} value={key}>{val.label}</Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item noStyle shouldUpdate={(prev, cur) => prev.triggerType !== cur.triggerType}>
          {({ getFieldValue }) => {
            const trigger = getFieldValue('triggerType') as TriggerType
            if (trigger === 'task_due_soon') {
              return (
                <Form.Item name={['triggerConfig', 'days']} label="临期天数" initialValue={3}>
                  <InputNumber min={1} max={30} style={{ width: 120 }} />
                </Form.Item>
              )
            }
            if (trigger === 'status_changed') {
              return (
                <Space>
                  <Form.Item name={['triggerConfig', 'fromStatus']} label="从状态">
                    <Input placeholder="留空=任意" style={{ width: 120 }} />
                  </Form.Item>
                  <Form.Item name={['triggerConfig', 'toStatus']} label="变为">
                    <Input placeholder="留空=任意" style={{ width: 120 }} />
                  </Form.Item>
                </Space>
              )
            }
            if (trigger === 'label_added' || trigger === 'label_removed') {
              return (
                <Form.Item name={['triggerConfig', 'label']} label="标签名">
                  <Input placeholder="例如：Bug" />
                </Form.Item>
              )
            }
            if (trigger === 'priority_changed') {
              return (
                <Space>
                  <Form.Item name={['triggerConfig', 'fromPriority']} label="从优先级">
                    <Select style={{ width: 120 }} allowClear>
                      <Option value="low">低</Option>
                      <Option value="medium">中</Option>
                      <Option value="high">高</Option>
                      <Option value="urgent">紧急</Option>
                    </Select>
                  </Form.Item>
                  <Form.Item name={['triggerConfig', 'toPriority']} label="变为">
                    <Select style={{ width: 120 }} allowClear>
                      <Option value="low">低</Option>
                      <Option value="medium">中</Option>
                      <Option value="high">高</Option>
                      <Option value="urgent">紧急</Option>
                    </Select>
                  </Form.Item>
                </Space>
              )
            }
            return null
          }}
        </Form.Item>

        <Divider orientation="left" style={{ fontSize: 13 }}>动作（可多个）</Divider>

        <Form.Item
          name="actions"
          label=""
          initialValue={[{ type: 'add_comment', config: { content: '' } }]}
        >
          <SimpleActionsEditor />
        </Form.Item>

        <Form.Item name="isEnabled" label="启用" valuePropName="checked" initialValue={true}>
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  )
}

// 简化版动作编辑器（v1 只用一个简单的 select + input，不做复杂的动态表单）
function SimpleActionsEditor() {
  return (
    <div style={{ padding: '12px', background: '#fafafa', borderRadius: 6, fontSize: 12, color: '#666' }}>
      <Text type="secondary">
        💡 v1 简化版：动作配置以 JSON 格式存储。建议使用预设模板快速创建，再微调动作内容。
      </Text>
      <div style={{ marginTop: 8 }}>
        <Text type="secondary">支持的动作类型：</Text>
        <Space wrap style={{ marginTop: 4 }}>
          {Object.entries(ACTION_LABELS).map(([key, label]) => (
            <Tag key={key}>{label}</Tag>
          ))}
        </Space>
      </div>
    </div>
  )
}
