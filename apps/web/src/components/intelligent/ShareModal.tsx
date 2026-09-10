/**
 * 推荐分享弹窗：选择员工，把提示词/技能推荐给对方
 *
 * 被推荐人登录后在「智能协助 → 收到的推荐」中可见，支持复制与下载。
 */
import { useEffect, useState } from 'react'
import { Alert, Input, Modal, Select, Typography } from 'antd'
import type { User } from '@/types'

const { Text } = Typography

interface ShareModalProps {
  open: boolean
  /** 被分享条目名称，用于标题展示 */
  itemName: string
  /** 候选员工（排除自己） */
  users: User[]
  /** 已推荐的人 */
  initialSelected: string[]
  initialNote?: string
  onCancel: () => void
  onOk: (userIds: string[], note: string) => void
}

export default function ShareModal({
  open,
  itemName,
  users,
  initialSelected,
  initialNote,
  onCancel,
  onOk,
}: ShareModalProps) {
  const [selected, setSelected] = useState<string[]>(initialSelected)
  const [note, setNote] = useState(initialNote ?? '')

  useEffect(() => {
    if (open) {
      setSelected(initialSelected)
      setNote(initialNote ?? '')
    }
  }, [open, initialSelected, initialNote])

  return (
    <Modal
      title={`推荐分享：${itemName}`}
      open={open}
      onCancel={onCancel}
      onOk={() => onOk(selected, note.trim())}
      okText="确认推荐"
      cancelText="取消"
      destroyOnHidden
    >
      <div style={{ marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          选择员工后，对方在「智能协助」的提示词仓库／技能仓库中即可看到这条推荐，并支持复制与下载。
        </Text>
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 6, fontSize: 13 }}>推荐给</div>
        <Select
          mode="multiple"
          allowClear
          style={{ width: '100%' }}
          placeholder="选择一名或多名员工"
          value={selected}
          onChange={setSelected}
          options={users.map((u) => ({
            value: u.id,
            label: `${u.displayName}${u.email ? `（${u.email}）` : ''}`,
          }))}
        />
      </div>
      <div>
        <div style={{ marginBottom: 6, fontSize: 13 }}>推荐语（可选）</div>
        <Input.TextArea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="例如：这个提示词整理需求很好用，推荐你试试"
          maxLength={200}
          showCount
        />
      </div>
      <Alert
        type="info"
        showIcon
        style={{ marginTop: 12 }}
        message="当前为本地演示模式，推荐范围按登录用户过滤模拟；接入后端后可直接切换为真实分享接口。"
      />
    </Modal>
  )
}
