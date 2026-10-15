/**
 * ReviewActionModal.tsx —— 评审任务处理弹窗
 *
 * 覆盖需求 5：需要评审的任务在成员完成后自动生成「项目评审」子任务，
 * 由管理员自动承接；管理员可邀请多人参与评审，填写结论后完成评审。
 * 评审未完成时，管理人员无法审批通过主任务。
 */
import { useEffect, useState } from 'react'
import { Alert, Button, Descriptions, Input, Modal, Select, Space, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { mockUsers } from '@/api/mock/data'
import type { WorkspaceTask } from '@/types'
import { TASK_PRIORITY_META } from '@/types'

const { Text } = Typography

export interface ReviewActionPayload {
  participants: string[]
  conclusion: string
}

interface Props {
  open: boolean
  reviewTask: WorkspaceTask | null
  /** 评审任务所属的主任务 */
  parentTask: WorkspaceTask | null
  onCancel: () => void
  onInvite: (participants: string[]) => void
  onComplete: (payload: ReviewActionPayload) => void
}

export default function ReviewActionModal({
  open,
  reviewTask,
  parentTask,
  onCancel,
  onInvite,
  onComplete,
}: Props) {
  const [participants, setParticipants] = useState<string[]>([])
  const [conclusion, setConclusion] = useState('')

  useEffect(() => {
    if (!open || !reviewTask) return
    setParticipants(reviewTask.participants ?? [])
    setConclusion('')
  }, [open, reviewTask])

  if (!reviewTask) return null

  const handleInvite = () => {
    onInvite(participants)
  }

  const handleComplete = () => {
    if (conclusion.trim().length < 4) return
    onComplete({ participants, conclusion })
  }

  return (
    <Modal
      title="项目评审"
      open={open}
      onCancel={onCancel}
      width={640}
      footer={[
        <Space key="footer">
          <Button onClick={handleInvite}>保存参与人</Button>
          <Button type="primary" onClick={handleComplete} disabled={conclusion.trim().length < 4}>
            完成评审
          </Button>
        </Space>,
      ]}
      destroyOnHidden
    >
      <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
        <Descriptions.Item label="评审对象">
          {parentTask ? parentTask.title : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="评审任务">{reviewTask.title}</Descriptions.Item>
        <Descriptions.Item label="负责人">
          {mockUsers.find((u) => u.id === reviewTask.assigneeId)?.displayName ?? '未指派'}
        </Descriptions.Item>
        <Descriptions.Item label="优先级">
          <Tag color={TASK_PRIORITY_META[reviewTask.priority].color}>
            {TASK_PRIORITY_META[reviewTask.priority].label}
          </Tag>
        </Descriptions.Item>
        {reviewTask.dueAt && (
          <Descriptions.Item label="截止时间">
            {dayjs(reviewTask.dueAt).format('YYYY-MM-DD HH:mm')}
          </Descriptions.Item>
        )}
      </Descriptions>

      <Alert
        type="info"
        showIcon
        message="评审任务完成后，管理人员才可在任务看板中审批通过对应的主任务。"
        style={{ marginBottom: 16 }}
      />

      <div style={{ marginBottom: 8 }}>
        <Text strong>评审参与人</Text>
      </div>
      <Select
        mode="multiple"
        style={{ width: '100%', marginBottom: 16 }}
        placeholder="邀请参与评审的成员"
        value={participants}
        onChange={setParticipants}
        options={mockUsers.map((u) => ({ value: u.id, label: u.displayName }))}
      />

      <div style={{ marginBottom: 8 }}>
        <Text strong>评审结论</Text>
        <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
          不少于 4 个字符
        </Text>
      </div>
      <Input.TextArea
        rows={4}
        value={conclusion}
        onChange={(e) => setConclusion(e.target.value)}
        placeholder="记录评审意见、发现的问题与结论"
      />
    </Modal>
  )
}
