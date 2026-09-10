/**
 * TimeEditModal.tsx —— 时间冲突事项「调整时间」弹窗（需求 9）。
 *
 * 仅负责时间区间的编辑与回传；保存逻辑（直接生效 / 提交审核）由调用方决定。
 */
import { useEffect, useState } from 'react'
import { DatePicker, Form, Modal, Space, Tag, Typography, Alert } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import type { TaskKind, WorkspaceTask } from '@/types'
import { TASK_KIND_META } from '@/types'

const { Text } = Typography
const { RangePicker } = DatePicker

interface Props {
  open: boolean
  /** 待调整的事项（任务/个人计划） */
  task: WorkspaceTask | null
  /** 是否存在待审核的调整申请（用于提示） */
  hasPending?: boolean
  onCancel: () => void
  onSave: (startAt: string, endAt: string) => void
}

export default function TimeEditModal({ open, task, hasPending, onCancel, onSave }: Props) {
  const [form] = Form.useForm()
  const [, setRange] = useState<[Dayjs, Dayjs] | null>(null)

  useEffect(() => {
    if (!open || !task) return
    setRange(
      task.startAt && task.endAt
        ? [dayjs(task.startAt), dayjs(task.endAt)]
        : [dayjs().hour(9).minute(0), dayjs().hour(10).minute(0)],
    )
    form.setFieldsValue({
      range:
        task.startAt && task.endAt
          ? [dayjs(task.startAt), dayjs(task.endAt)]
          : [dayjs().hour(9).minute(0), dayjs().hour(10).minute(0)],
    })
  }, [open, task, form])

  const handleOk = async () => {
    const values = await form.validateFields()
    const r = values.range as [Dayjs, Dayjs]
    onSave(r[0].toISOString(), r[1].toISOString())
  }

  return (
    <Modal
      title="调整时间"
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okText="保存"
      cancelText="取消"
      destroyOnHidden
    >
      {task && (
        <Form form={form} layout="vertical">
          <Space style={{ marginBottom: 12 }}>
            <Text strong>{task.title}</Text>
            <Tag color={(TASK_KIND_META[task.kind as TaskKind] ?? { color: 'default' }).color}>
              {TASK_KIND_META[task.kind as TaskKind]?.label ?? task.kind}
            </Tag>
          </Space>
          <Form.Item
            name="range"
            label="新的时间区间"
            rules={[{ required: true, message: '请选择时间区间' }]}
          >
            <RangePicker
              showTime
              format="YYYY-MM-DD HH:mm"
              style={{ width: '100%' }}
              onChange={(v) => setRange(v as [Dayjs, Dayjs] | null)}
            />
          </Form.Item>
          {hasPending && (
            <Alert
              type="info"
              showIcon
              message="已有一份时间调整申请待管理人员审核，保存将更新该申请"
            />
          )}
        </Form>
      )}
    </Modal>
  )
}
