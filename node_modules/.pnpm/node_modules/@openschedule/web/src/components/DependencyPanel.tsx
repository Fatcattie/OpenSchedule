/**
 * 职责：依赖管理面板 —— 依赖列表 + 新增表单（选择前置/后置任务 + type + lagDays + isShared）+ 删除按钮
 */
import { useState } from 'react'
import { Alert, Button, Form, InputNumber, Modal, Select, Space, Switch, Table, Tag, Typography, message } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getErrorMessage } from '@/api/errors'
import { reportApi } from '@/api/reportApi'
import { taskApi } from '@/api/taskApi'
import type { TaskDependency, DependencyType } from '@/types'

const { Text } = Typography

/** 依赖类型映射 */
const DEP_TYPE_META: Record<DependencyType, { label: string; color: string }> = {
  FS: { label: 'FS（完成→开始）', color: 'blue' },
  SS: { label: 'SS（开始→开始）', color: 'green' },
  FF: { label: 'FF（完成→完成）', color: 'purple' },
  SF: { label: 'SF（开始→完成）', color: 'orange' },
}

interface DependencyPanelProps {
  projectId: string
}

export default function DependencyPanel({ projectId }: DependencyPanelProps) {
  const queryClient = useQueryClient()

  // 加载项目任务列表（用于下拉选择）
  const tasksQuery = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => taskApi.listProjectTasks(projectId),
    enabled: !!projectId,
  })

  // 加载依赖列表
  const depsQuery = useQuery({
    queryKey: ['dependencies', projectId],
    queryFn: () => reportApi.listDependencies(projectId),
    enabled: !!projectId,
  })

  const [form] = Form.useForm()
  const [addOpen, setAddOpen] = useState(false)

  // 删除依赖
  const deleteMutation = useMutation({
    mutationFn: (id: string) => reportApi.deleteDependency(id),
    onSuccess: () => {
      message.success('依赖已删除')
      queryClient.invalidateQueries({ queryKey: ['dependencies', projectId] })
    },
    onError: (e) => message.error(getErrorMessage(e)),
  })

  // 创建依赖
  const createMutation = useMutation({
    mutationFn: (input: Parameters<typeof reportApi.createDependency>[1]) =>
      reportApi.createDependency(projectId, input),
    onSuccess: () => {
      message.success('依赖创建成功')
      setAddOpen(false)
      form.resetFields()
      queryClient.invalidateQueries({ queryKey: ['dependencies', projectId] })
    },
    onError: (e) => message.error(getErrorMessage(e)),
  })

  const tasks = tasksQuery.data?.items ?? []
  const deps = depsQuery.data ?? []

  const columns = [
    {
      title: '前置任务',
      dataIndex: ['prevTask', 'title'],
      key: 'prevTask',
      render: (title: string, record: TaskDependency) => (
        <Text>{title || record.prevTaskId.slice(0, 8)}</Text>
      ),
    },
    {
      title: '依赖类型',
      dataIndex: 'type',
      key: 'type',
      width: 140,
      render: (type: DependencyType) => (
        <Tag color={DEP_TYPE_META[type]?.color}>{DEP_TYPE_META[type]?.label ?? type}</Tag>
      ),
    },
    {
      title: '滞后天数',
      dataIndex: 'lagDays',
      key: 'lagDays',
      width: 80,
    },
    {
      title: '共享',
      dataIndex: 'isShared',
      key: 'isShared',
      width: 60,
      render: (v: boolean) => v ? <Tag color="success">是</Tag> : <Tag>否</Tag>,
    },
    {
      title: '后置任务',
      dataIndex: ['nextTask', 'title'],
      key: 'nextTask',
      render: (title: string, record: TaskDependency) => (
        <Text>{title || record.nextTaskId.slice(0, 8)}</Text>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: unknown, record: TaskDependency) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          size="small"
          onClick={() => {
            if (window.confirm(`确认删除依赖 ${record.prevTask?.title ?? record.prevTaskId} → ${record.nextTask?.title ?? record.nextTaskId}？`)) {
              deleteMutation.mutate(record.id)
            }
          }}
          loading={deleteMutation.isPending}
        />
      ),
    },
  ]

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Text strong>依赖管理</Text>
        <Text type="secondary">（{deps.length} 条）</Text>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setAddOpen(true)}
          disabled={tasksQuery.isLoading || tasks.length === 0}
        >
          新增依赖
        </Button>
      </Space>

      {depsQuery.isLoading ? (
        <Text type="secondary">加载中…</Text>
      ) : deps.length === 0 ? (
        <Alert
          message="暂无依赖关系"
          description="添加任务间的依赖关系后，这里会显示依赖列表，甘特图会据此计算关键路径。"
          type="info"
          showIcon
        />
      ) : (
        <Table
          dataSource={deps}
          columns={columns}
          rowKey="id"
          pagination={false}
          size="small"
          scroll={{ x: 600 }}
        />
      )}

      {/* 新增依赖弹窗 */}
      <Modal
        title="新增依赖关系"
        open={addOpen}
        onOk={() => form.submit()}
        onCancel={() => { setAddOpen(false); form.resetFields() }}
        confirmLoading={createMutation.isPending}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => createMutation.mutate(values as Parameters<typeof reportApi.createDependency>[1])}
        >
          <Form.Item
            name="prevTaskId"
            label="前置任务"
            rules={[{ required: true, message: '请选择前置任务' }]}
          >
            <Select
              showSearch
              placeholder="搜索任务…"
              options={tasks.map(t => ({ value: t.id, label: t.title }))}
              filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>

          <Form.Item
            name="nextTaskId"
            label="后置任务"
            rules={[
              { required: true, message: '请选择后置任务' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (value && value !== getFieldValue('prevTaskId')) return Promise.resolve()
                  return Promise.reject(new Error('前置任务与后置任务不能相同'))
                },
              }),
            ]}
          >
            <Select
              showSearch
              placeholder="搜索任务…"
              options={tasks.map(t => ({ value: t.id, label: t.title }))}
              filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>

          <Form.Item name="type" label="依赖类型" initialValue="FS">
            <Select
              options={(Object.keys(DEP_TYPE_META) as DependencyType[]).map(t => ({
                value: t,
                label: DEP_TYPE_META[t].label,
              }))}
            />
          </Form.Item>

          <Form.Item name="lagDays" label="滞后天数" initialValue={0}>
            <InputNumber min={0} max={365} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="isShared" label="共享子任务" valuePropName="checked" initialValue={false}>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
