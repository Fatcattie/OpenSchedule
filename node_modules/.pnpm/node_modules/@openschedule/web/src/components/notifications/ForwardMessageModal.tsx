/**
 * 转发通知到钉钉 / 飞书
 *
 * 支持单条或批量（多条内容合并为一条摘要消息），发送后记录转发日志，失败可重试。
 */
import { useState } from 'react'
import { Alert, App, Input, Modal, Select, Space, Tag, Typography } from 'antd'
import { sendImMessage, PROVIDERS, providerMeta } from '@/services/imProvider'
import type { ImProvider } from '@/services/imProvider'
import type { User } from '@/types'

const { Text } = Typography

export interface ForwardLogEntry {
  key: string
  provider: ImProvider
  targetCount: number
  ok: boolean
  at: string
  error?: string
}

interface ForwardMessageModalProps {
  open: boolean
  /** 标题（单条为通知标题，批量为「N 条通知」） */
  title: string
  defaultContent: string
  users: User[]
  onCancel: () => void
  onDone: (entry: ForwardLogEntry) => void
}

export default function ForwardMessageModal({
  open,
  title,
  defaultContent,
  users,
  onCancel,
  onDone,
}: ForwardMessageModalProps) {
  const { message } = App.useApp()
  const [providers, setProviders] = useState<ImProvider[]>(['feishu'])
  const [targets, setTargets] = useState<string[]>([])
  const [content, setContent] = useState(defaultContent)
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (!providers.length) {
      message.warning('请选择至少一个渠道')
      return
    }
    if (!content.trim()) {
      message.warning('消息内容不能为空')
      return
    }
    setSending(true)
    try {
      const results = await Promise.all(
        providers.map((p) => sendImMessage(p, { targets, title, content })),
      )
      results.forEach((r, i) => {
        onDone({
          key: `${r.provider}-${Date.now()}-${i}`,
          provider: r.provider,
          targetCount: targets.length,
          ok: r.ok,
          at: new Date().toISOString(),
          error: r.error,
        })
      })
      const failed = results.filter((r) => !r.ok)
      if (failed.length === 0) {
        message.success(`已转发到 ${results.map((r) => providerMeta(r.provider).name).join('、')}`)
        onCancel()
      } else {
        message.error(
          `${failed.map((f) => providerMeta(f.provider).name).join('、')} 发送失败：${
            failed[0].error ?? '未知错误'
          }`,
        )
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal
      open={open}
      title="转发到钉钉 / 飞书"
      onCancel={onCancel}
      onOk={handleSend}
      okText="发送"
      cancelText="取消"
      confirmLoading={sending}
      destroyOnHidden
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            将这条通知以 IM 消息形式推送给选定成员
          </Text>
          <div style={{ marginTop: 4 }}>
            <Text strong>{title}</Text>
          </div>
        </div>

        <div>
          <div style={{ marginBottom: 6 }}>目标渠道</div>
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            value={providers}
            onChange={setProviders}
            options={PROVIDERS.map((p) => ({ value: p.id, label: p.name }))}
          />
          <Space wrap size={4} style={{ marginTop: 6 }}>
            {PROVIDERS.map((p) => (
              <Tag key={p.id} color={p.color} style={{ fontSize: 11 }}>
                {p.features.join(' / ')}
              </Tag>
            ))}
          </Space>
        </div>

        <div>
          <div style={{ marginBottom: 6 }}>接收人（留空则发送到默认群／本人）</div>
          <Select
            mode="multiple"
            allowClear
            style={{ width: '100%' }}
            placeholder="选择成员"
            value={targets}
            onChange={setTargets}
            options={users.map((u) => ({ value: u.id, label: u.displayName }))}
            maxTagCount="responsive"
          />
        </div>

        <div>
          <div style={{ marginBottom: 6 }}>消息内容</div>
          <Input.TextArea
            rows={6}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>

        <Alert
          type="info"
          showIcon
          message="通道说明"
          description="默认走真实后端 /integrations 代理（钉钉/飞书 MCP 网关或 Mock 通道由后端配置决定）；仅在显式 VITE_USE_MOCK=true 时使用本地模拟通道。"
        />
      </Space>
    </Modal>
  )
}
