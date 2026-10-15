/**
 * PersonalPlanModal.tsx —— 日历页个人计划弹窗
 *
 * 覆盖需求 4：普通人员与管理人员都可在日历页安排个人计划；
 * 计划时间不得与已有任务时间冲突（实时检测，冲突时禁止提交）。
 */
import { useEffect, useState } from 'react'
import { Alert, Button, DatePicker, Form, Input, List, Modal, Select, Space, Tag, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import type { Importance, RecurrenceRule, UrgencyDegree, WorkspaceTask } from '@/types'
import { IMPORTANCE_META, TASK_KIND_META, URGENCY_DEGREE_META } from '@/types'
import { detectPersonTimeConflict } from '@/utils/taskTree'
import { mockMe } from '@/api/mock/data'
import RecurrenceEditor from '@/components/workspace/RecurrenceEditor'
import ImageUpload from '@/components/workspace/ImageUpload'

const { Text } = Typography
const { RangePicker } = DatePicker

export interface PersonalPlanPayload {
  title: string
  note: string
  /** 重要程度：重要/不重要（需求：关联日历看板便签） */
  importance: Importance
  /** 紧急程度：紧急/不紧急 */
  urgencyDegree: UrgencyDegree
  startAt: string
  endAt: string
  /** 重复规则（定期/循环） */
  recurrence?: RecurrenceRule | null
  /** 说明图片（base64） */
  images?: string[]
}

interface Props {
  open: boolean
  /** 预填时间区间（从日历格点点击传入） */
  initialRange?: { start: string; end: string } | null
  /** 全量任务，用于冲突检测 */
  tasks: WorkspaceTask[]
  onCancel: () => void
  onSubmit: (payload: PersonalPlanPayload) => void
}

export default function PersonalPlanModal({ open, initialRange, tasks, onCancel, onSubmit }: Props) {
  const [form] = Form.useForm()
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [conflicts, setConflicts] = useState<WorkspaceTask[]>([])
  const [acknowledged, setAcknowledged] = useState(false)
  const [recurrence, setRecurrence] = useState<RecurrenceRule | null>(null)
  const [images, setImages] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    const init: [Dayjs, Dayjs] | null = initialRange
      ? [dayjs(initialRange.start), dayjs(initialRange.end)]
      : [dayjs().hour(9).minute(0), dayjs().hour(10).minute(0)]
    setRange(init)
    form.setFieldsValue({ range: init })
    setRecurrence(null)
    setImages([])
    setAcknowledged(false)
  }, [open, initialRange, form])

  // 区间变化时实时检测冲突：仅与「同人」（本人承接/创建/参与）的其他事项比对
  useEffect(() => {
    if (!range?.[0] || !range?.[1]) {
      setConflicts([])
      return
    }
    const hit = detectPersonTimeConflict(
      { start: range[0].toISOString(), end: range[1].toISOString() },
      tasks,
      mockMe.id,
    )
    setConflicts(hit)
    setAcknowledged(false)
  }, [range, tasks])

  const handleSubmit = async () => {
    const values = await form.validateFields()
    const r = values.range as [Dayjs, Dayjs]
    onSubmit({
      title: values.title,
      note: values.note ?? '',
      importance: values.importance ?? 'important',
      urgencyDegree: values.urgencyDegree ?? 'notUrgent',
      startAt: r[0].toISOString(),
      endAt: r[1].toISOString(),
      recurrence: recurrence
        ? { ...recurrence, startDate: r[0].toISOString() }
        : null,
      images,
    })
  }

  return (
    <Modal
      title="安排个人计划"
      open={open}
      onCancel={onCancel}
      onOk={handleSubmit}
      okText="保存计划"
      cancelText="取消"
      okButtonProps={{ disabled: conflicts.length > 0 && !acknowledged }}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" initialValues={{ importance: 'important', urgencyDegree: 'notUrgent' }}>
        <Form.Item name="title" label="计划内容" rules={[{ required: true, message: '请输入计划内容' }]}>
          <Input placeholder="例如：整理本周复盘材料" />
        </Form.Item>
        <Form.Item name="note" label="备注（可选）">
          <Input.TextArea rows={2} placeholder="补充说明" />
        </Form.Item>
        <Space size={12} style={{ display: 'flex' }} align="start">
          <Form.Item name="importance" label="重要程度" style={{ minWidth: 110 }}>
            <Select options={Object.entries(IMPORTANCE_META).map(([value, meta]) => ({ value, label: meta.label }))} />
          </Form.Item>
          <Form.Item name="urgencyDegree" label="紧急程度" style={{ minWidth: 110 }}>
            <Select options={Object.entries(URGENCY_DEGREE_META).map(([value, meta]) => ({ value, label: meta.label }))} />
          </Form.Item>
        </Space>
        <Form.Item
          name="range"
          label="计划时间"
          rules={[{ required: true, message: '请选择计划时间' }]}
        >
          <RangePicker
            showTime
            format="YYYY-MM-DD HH:mm"
            style={{ width: '100%' }}
            onChange={(v) => setRange(v as [Dayjs, Dayjs] | null)}
          />
        </Form.Item>
        <Form.Item label="重复设置">
          <RecurrenceEditor value={recurrence} onChange={setRecurrence} />
        </Form.Item>
        <Form.Item label="说明图片">
          <ImageUpload value={images} onChange={setImages} />
        </Form.Item>
      </Form>

      {conflicts.length > 0 ? (
        <Alert
          type={acknowledged ? 'warning' : 'error'}
          showIcon
          message={acknowledged ? '已确认时间冲突，仍将创建该计划' : '计划时间与以下事项冲突'}
          description={
            <div>
              <List
                size="small"
                dataSource={conflicts}
                renderItem={(t) => (
                  <List.Item style={{ padding: '6px 0' }}>
                    <Space wrap>
                      <Text>{t.title}</Text>
                      <Tag color={TASK_KIND_META[t.kind].color}>{TASK_KIND_META[t.kind].label}</Tag>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {dayjs(t.startAt ?? t.dueAt).format('MM-DD HH:mm')} ~ {dayjs(t.endAt ?? t.dueAt).format('MM-DD HH:mm')}
                      </Text>
                    </Space>
                  </List.Item>
                )}
              />
              {!acknowledged && (
                <Button danger size="small" style={{ marginTop: 8 }} onClick={() => setAcknowledged(true)}>
                  已知悉并继续
                </Button>
              )}
            </div>
          }
        />
      ) : (
        range && (
          <Alert type="success" showIcon message="该时间段空闲，可以安排" />
        )
      )}
    </Modal>
  )
}
