/**
 * 收到的推荐详情：只读查看内容，支持复制 / 下载 / 保存到我的库
 */
import { Button, Modal, Space, Tag, Typography } from 'antd'
import { CopyOutlined, DownloadOutlined, SaveOutlined } from '@ant-design/icons'

const { Text, Paragraph } = Typography

interface SharedDetailModalProps {
  open: boolean
  title: string
  summary: string
  content: string
  sharedByName: string
  note?: string
  onClose: () => void
  onCopy: () => void
  onDownload: () => void
  onSaveToMine: () => void
}

export default function SharedDetailModal({
  open,
  title,
  summary,
  content,
  sharedByName,
  note,
  onClose,
  onCopy,
  onDownload,
  onSaveToMine,
}: SharedDetailModalProps) {
  return (
    <Modal
      open={open}
      title={title}
      onCancel={onClose}
      width={720}
      footer={[
        <Button key="close" onClick={onClose}>
          关闭
        </Button>,
        <Button key="save" icon={<SaveOutlined />} onClick={onSaveToMine}>
          保存到我的库
        </Button>,
        <Button key="dl" icon={<DownloadOutlined />} onClick={onDownload}>
          下载
        </Button>,
        <Button key="copy" type="primary" icon={<CopyOutlined />} onClick={onCopy}>
          复制
        </Button>,
      ]}
      destroyOnHidden
    >
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Space wrap>
          <Tag color="blue">来自 {sharedByName} 的推荐</Tag>
          {note && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              推荐语：{note}
            </Text>
          )}
        </Space>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {summary || '（暂无摘要）'}
        </Paragraph>
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: 12,
            lineHeight: 1.7,
            padding: 12,
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 6,
            maxHeight: 420,
            overflow: 'auto',
            margin: 0,
          }}
        >
          {content}
        </pre>
      </Space>
    </Modal>
  )
}
