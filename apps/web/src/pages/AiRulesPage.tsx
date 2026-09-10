/**
 * AiRulesPage.tsx —— AI 提示词与拆解规则管理页
 *
 * 覆盖需求：
 * - 需求 1：拆解规则集中保存，按「行业 × 任务类型」维护，作为模板参考
 * - 需求 2：所有 AI 辅助场景（拆解 / SOP / 经验 / 总结 / 评估 / 计划）的提示词在此统一管理
 */
import { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Col,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { createEmptyRule, useAiRules } from '@/hooks/useAiRules'
import { getAgentEndpoint, renderTemplate } from '@/utils/aiRules'
import {
  AI_SCENE_META,
  INDUSTRY_OPTIONS,
  PROMPT_VARIABLES,
  TASK_TYPE_OPTIONS,
  type AiRule,
  type AiScene,
} from '@/types'

const { Title, Text, Paragraph } = Typography

export default function AiRulesPage() {
  const { rules, saveRule, removeRule, resetAll } = useAiRules()
  const [form] = Form.useForm()
  const [scene, setScene] = useState<AiScene | 'all'>('all')
  const [editing, setEditing] = useState<AiRule | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [preview, setPreview] = useState<{ name: string; text: string } | null>(null)
  const [sample, setSample] = useState({ title: '开发用户登录模块', hours: 40 })

  const agentEndpoint = getAgentEndpoint()

  const filtered = useMemo(
    () => (scene === 'all' ? rules : rules.filter((r) => r.scene === scene)).slice().sort((a, b) => a.priority - b.priority),
    [rules, scene],
  )

  const openCreate = () => {
    const draft = createEmptyRule(scene === 'all' ? 'decompose' : scene)
    setEditing(draft)
    form.setFieldsValue({
      ...draft,
      stepsText: '',
    })
    setModalOpen(true)
  }

  const openEdit = (rule: AiRule) => {
    setEditing(rule)
    form.setFieldsValue({
      ...rule,
      stepsText: rule.steps.join('\n'),
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    const values = await form.validateFields()
    const stepsText: string = values.stepsText ?? ''
    const steps = stepsText
      .split('\n')
      .map((s: string) => s.trim())
      .filter(Boolean)
    if (!editing) return
    const next: AiRule = {
      ...editing,
      name: values.name,
      scene: values.scene,
      industry: values.industry,
      taskType: values.taskType,
      priority: values.priority,
      enabled: values.enabled,
      promptTemplate: values.promptTemplate ?? '',
      steps,
      updatedAt: new Date().toISOString(),
    }
    saveRule(next)
    setModalOpen(false)
    message.success(`规则「${next.name}」已保存`)
  }

  const openPreview = (rule: AiRule) => {
    const text = renderTemplate(rule.promptTemplate, {
      title: sample.title,
      description: '示例：需要支持手机号与邮箱两种登录方式',
      industry: rule.industry,
      taskType: rule.taskType,
      totalHours: sample.hours,
      startDate: new Date().toISOString().slice(0, 10),
      steps: rule.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
      extra: '',
    })
    setPreview({ name: rule.name, text: text || '（该规则未填写提示词模板）' })
  }

  const columns = [
    {
      title: '规则名称',
      dataIndex: 'name',
      render: (name: string, r: AiRule) => (
        <Space>
          <Text strong>{name}</Text>
          {r.builtin ? <Tag>内置</Tag> : <Tag color="cyan">自定义</Tag>}
        </Space>
      ),
    },
    {
      title: '场景',
      dataIndex: 'scene',
      width: 100,
      render: (s: AiScene) => <Tag color={AI_SCENE_META[s].color}>{AI_SCENE_META[s].label}</Tag>,
    },
    { title: '行业', dataIndex: 'industry', width: 120 },
    { title: '任务类型', dataIndex: 'taskType', width: 120 },
    {
      title: '步骤',
      width: 70,
      render: (_: unknown, r: AiRule) => (r.steps.length > 0 ? `${r.steps.length} 步` : '-'),
    },
    { title: '优先级', dataIndex: 'priority', width: 80 },
    {
      title: '状态',
      dataIndex: 'enabled',
      width: 90,
      render: (enabled: boolean, r: AiRule) => (
        <Switch
          size="small"
          checked={enabled}
          onChange={(v) => saveRule({ ...r, enabled: v, updatedAt: new Date().toISOString() })}
        />
      ),
    },
    {
      title: '操作',
      width: 190,
      render: (_: unknown, r: AiRule) => (
        <Space size={4}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openPreview(r)}>
            预览
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>
            编辑
          </Button>
          <Popconfirm
            title={r.builtin ? '恢复该规则的默认设置？' : '确定删除这条规则？'}
            onConfirm={() => {
              removeRule(r.id)
              message.success(r.builtin ? '已恢复默认' : '已删除')
            }}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              {r.builtin ? '还原' : '删除'}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Row align="middle" justify="space-between" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0, color: 'var(--text-primary)' }}>AI 规则与提示词</Title>
          <Text type="secondary">集中维护 AI 拆解经验模板与各场景提示词，规则按「行业 × 任务类型」自动匹配</Text>
        </Col>
        <Col>
          <Space>
            <Popconfirm title="清空所有自定义规则并恢复内置默认？" onConfirm={() => { resetAll(); message.success('已恢复默认规则') }}>
              <Button icon={<ReloadOutlined />}>恢复默认</Button>
            </Popconfirm>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建规则</Button>
          </Space>
        </Col>
      </Row>

      <Alert
        type={agentEndpoint ? 'success' : 'info'}
        showIcon
        message={
          agentEndpoint
            ? `已接入 Agent 服务：${agentEndpoint}。拆解会先调用模型，失败时自动回退本地规则引擎。`
            : '当前使用本地规则引擎（按行业与任务类型经验模板拆解）。配置环境变量 VITE_AI_AGENT_ENDPOINT 后即可接入真实模型，提示词模板保持不变。'
        }
        style={{ marginBottom: 16 }}
      />

      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Text type="secondary">场景筛选</Text>
          <Select
            value={scene}
            onChange={setScene}
            style={{ width: 160 }}
            options={[
              { value: 'all', label: '全部场景' },
              ...(Object.entries(AI_SCENE_META) as [AiScene, (typeof AI_SCENE_META)[AiScene]][]).map(
                ([value, meta]) => ({ value, label: meta.label }),
              ),
            ]}
          />
          <Text type="secondary">预览示例</Text>
          <Input
            value={sample.title}
            onChange={(e) => setSample((s) => ({ ...s, title: e.target.value }))}
            style={{ width: 220 }}
            placeholder="示例任务标题"
          />
          <Text type="secondary">工时</Text>
          <InputNumber
            value={sample.hours}
            onChange={(v) => setSample((s) => ({ ...s, hours: Number(v) || 40 }))}
            style={{ width: 110 }}
            min={1}
          />
        </Space>
      </Card>

      <Table
        dataSource={filtered}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ x: 900 }}
      />

      <Modal
        title={editing && editing.name ? `编辑规则：${editing.name}` : '新建规则'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        okText="保存规则"
        cancelText="取消"
        width={760}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="规则名称" rules={[{ required: true, message: '请输入规则名称' }]}>
            <Input placeholder="例如：前端开发标准流程" />
          </Form.Item>
          <Space size={12} style={{ display: 'flex' }} align="start" wrap>
            <Form.Item name="scene" label="适用场景" style={{ minWidth: 150 }}>
              <Select
                options={(Object.entries(AI_SCENE_META) as [AiScene, (typeof AI_SCENE_META)[AiScene]][]).map(
                  ([value, meta]) => ({ value, label: meta.label }),
                )}
              />
            </Form.Item>
            <Form.Item name="industry" label="行业类型" style={{ minWidth: 160 }}>
              <Select options={INDUSTRY_OPTIONS.map((v) => ({ value: v, label: v }))} />
            </Form.Item>
            <Form.Item name="taskType" label="任务类型" style={{ minWidth: 160 }}>
              <Select options={TASK_TYPE_OPTIONS.map((v) => ({ value: v, label: v }))} />
            </Form.Item>
            <Form.Item name="priority" label="优先级（小的优先）" style={{ minWidth: 120 }}>
              <InputNumber min={1} max={999} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="enabled" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>

          <Form.Item
            name="stepsText"
            label="拆解步骤模板（每行一步，仅拆解场景需要）"
            extra="留空则该规则只提供提示词，不提供步骤模板"
          >
            <Input.TextArea rows={6} placeholder={'需求确认与技术方案\n组件与页面结构设计\n编码实现\n自测与联调'} />
          </Form.Item>

          <Form.Item name="promptTemplate" label="提示词模板">
            <Input.TextArea rows={10} placeholder="使用 {{变量}} 引用上下文，例如：请拆解任务 {{title}}" />
          </Form.Item>

          <div style={{ marginTop: -8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>可用变量：</Text>
            <Space wrap size={4} style={{ marginTop: 4 }}>
              {PROMPT_VARIABLES.map((v) => (
                <Tag key={v.key} color="blue" style={{ fontSize: 11 }} title={v.desc}>
                  {`{{${v.key}}}`}
                </Tag>
              ))}
            </Space>
            <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
              保存后，任务拆解会优先匹配「行业 + 任务类型」都命中的规则；没有精确匹配时回退到通用规则。
            </Paragraph>
          </div>
        </Form>
      </Modal>

      <Modal
        title={preview ? `提示词预览：${preview.name}` : '提示词预览'}
        open={Boolean(preview)}
        onCancel={() => setPreview(null)}
        footer={null}
        width={760}
        destroyOnHidden
      >
        <Input.TextArea rows={18} value={preview?.text ?? ''} readOnly />
      </Modal>
    </div>
  )
}
