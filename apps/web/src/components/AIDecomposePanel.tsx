/**
 * AIDecomposePanel.tsx —— AI 智能拆解面板
 *
 * 功能：输入目标 → 生成拆解建议 → 预览任务+排期 → 应用/拒绝
 * 设计哲学（方案书 4.1）：AI 提议、人确认 —— 所有操作都是草稿，用户 apply 才落库
 */
import { useState } from 'react'
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Space,
  Tag,
  Table,
  Typography,
  Alert,
  message,
} from 'antd'
import {
  ThunderboltOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  BulbOutlined,
} from '@ant-design/icons'
import { useMutation } from '@tanstack/react-query'
import { createDecompose, applyProposal, rejectProposal } from '@/api/aiApi'
import type { DecomposeSuggestion } from '@/types'

const { Text } = Typography
const { TextArea } = Input

interface Props {
  projectId?: string
  onApplied?: (tasks: any[]) => void
}

export default function AIDecomposePanel({ projectId, onApplied }: Props) {
  const [form] = Form.useForm()
  const [suggestion, setSuggestion] = useState<DecomposeSuggestion | null>(null)

  const decomposeMutation = useMutation({
    mutationFn: (values: any) => createDecompose({
      ...values,
      relatedProjectId: projectId,
    }),
    onSuccess: (data) => {
      setSuggestion(data)
      message.success(`已生成 ${data.tasks.length} 个子任务建议`)
    },
    onError: (err: any) => message.error(err.response?.data?.message || '生成失败'),
  })

  const applyMutation = useMutation({
    mutationFn: (id: string) => applyProposal(id),
    onSuccess: (data) => {
      message.success(`已应用：创建 ${data.taskCount} 个任务 + ${data.dependencyCount} 条依赖`)
      setSuggestion(prev => prev ? { ...prev, status: 'applied' } : null)
      onApplied?.(suggestion?.tasks ?? [])
    },
    onError: (err: any) => message.error(err.response?.data?.message || '应用失败'),
  })

  const rejectMutation = useMutation({
    mutationFn: (id: string) => rejectProposal(id),
    onSuccess: () => {
      message.success('已拒绝建议')
      setSuggestion(prev => prev ? { ...prev, status: 'rejected' } : null)
    },
  })

  const handleSubmit = () => {
    form.validateFields().then(values => {
      decomposeMutation.mutate(values)
    })
  }

  const priorityColor = (p: string) =>
    p === 'urgent' ? 'red' : p === 'high' ? 'orange' : p === 'low' ? 'default' : 'blue'

  const columns = [
    {
      title: '#',
      dataIndex: 'index',
      width: 40,
      render: (_: any, _r: any, i: number) => i + 1,
    },
    {
      title: '任务名称',
      dataIndex: 'title',
      render: (title: string, record: any) => (
        <Space>
          <span>{title}</span>
          {record.isShared && <Tag color="purple">共享</Tag>}
          <Tag color={priorityColor(record.priority)}>{record.priority}</Tag>
        </Space>
      ),
    },
    {
      title: '估时 (h)',
      dataIndex: 'estimatedHours',
      width: 80,
    },
    {
      title: '最早开始',
      dataIndex: 'earliestStart',
      width: 110,
      render: (v?: string) => v ? v.slice(0, 10) : '-',
    },
    {
      title: '最早结束',
      dataIndex: 'earliestFinish',
      width: 110,
      render: (v?: string) => v ? v.slice(0, 10) : '-',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 输入表单 */}
      <Card
        size="small"
        title={
          <Space>
            <BulbOutlined style={{ color: 'var(--accent-amber)' }} />
            <span>AI 智能拆解</span>
            <Tag color="blue">草稿态</Tag>
          </Space>
        }
        extra={
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            onClick={handleSubmit}
            loading={decomposeMutation.isPending}
          >
            生成建议
          </Button>
        }
      >
        <Form form={form} layout="vertical" initialValues={{ totalEstimatedHours: 40 }}>
          <Form.Item
            name="goalTitle"
            label="目标描述"
            rules={[{ required: true, message: '请输入目标' }]}
          >
            <Input placeholder="如：开发用户登录模块；设计数据库；编写测试用例" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <Form.Item name="goalDescription" label="补充说明（可选）">
              <TextArea rows={2} placeholder="更多上下文或约束" />
            </Form.Item>
            <Form.Item name="totalEstimatedHours" label="总估时（小时）">
              <InputNumber min={1} max={1000} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="startDate" label="开始日期（可选）">
              <Input placeholder="YYYY-MM-DD，默认今天" />
            </Form.Item>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            提示：用分号「；」或逗号分隔多个步骤会自动拆分为串联任务；关键词（设计/开发/测试/文档等）会自动匹配估时
          </div>
        </Form>
      </Card>

      {/* 建议结果 */}
      {suggestion && (
        <Card
          size="small"
          title={
            <Space>
              <Text strong>{suggestion.summary}</Text>
              <Tag color={
                suggestion.status === 'applied' ? 'green' :
                suggestion.status === 'rejected' ? 'red' : 'blue'
              }>
                {suggestion.status === 'pending' ? '待确认' :
                 suggestion.status === 'applied' ? '已应用' : '已拒绝'}
              </Tag>
              {suggestion.engine === 'ai'
                ? <Tag color="green">AI 模型生成{suggestion.aiModel ? ` · ${suggestion.aiModel}` : ''}</Tag>
                : <Tag>规则引擎</Tag>}
            </Space>
          }
          extra={
            suggestion.status === 'pending' && (
              <Space>
                <Button
                  danger
                  icon={<CloseCircleOutlined />}
                  onClick={() => rejectMutation.mutate(suggestion.id)}
                  loading={rejectMutation.isPending}
                >
                  拒绝
                </Button>
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={() => applyMutation.mutate(suggestion.id)}
                  loading={applyMutation.isPending}
                  disabled={!projectId}
                >
                  {projectId ? '全部应用' : '请先选择项目'}
                </Button>
              </Space>
            )
          }
        >
          {suggestion.warnings.length > 0 && (
            <Alert
              type="warning"
              showIcon
              message={suggestion.warnings.map((w, i) => <div key={i}>{w}</div>)}
              style={{ marginBottom: 12 }}
            />
          )}

          <Table
            size="small"
            dataSource={suggestion.tasks as any[]}
            columns={columns}
            pagination={false}
            rowKey={(_, i) => String(i)}
          />

          {suggestion.dependencies.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>
              依赖关系：{suggestion.dependencies.length} 条（默认 FS 串联）
            </div>
          )}

          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>
            所有任务以「草稿」形式预览，点击「全部应用」才会真正创建到项目中（AI 提议、人确认）
          </div>
        </Card>
      )}

      {/* 空状态引导 */}
      {!suggestion && !decomposeMutation.isPending && (
        <Card size="small">
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-tertiary)' }}>
            <BulbOutlined style={{ fontSize: 32, marginBottom: 8, color: 'var(--accent-amber)' }} />
            <div>输入目标，让 AI 帮你拆成可执行的子任务 + 依赖关系 + 排期</div>
          </div>
        </Card>
      )}
    </div>
  )
}