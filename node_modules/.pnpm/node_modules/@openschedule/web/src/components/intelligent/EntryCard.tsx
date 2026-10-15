/**
 * 库卡片：提示词 / 技能共用（参考 AI-Gist 卡片布局）
 *
 * 标题行含 复制 / 下载 / 收藏 / 更多 操作；描述两行截断；底部标签 + 更新时间。
 */
import { theme } from 'antd'
import { Button, Dropdown, Space, Tag, Tooltip, Typography } from 'antd'
import {
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  EllipsisOutlined,
  EyeOutlined,
  ShareAltOutlined,
  StarFilled,
  StarOutlined,
} from '@ant-design/icons'

const { Text, Paragraph } = Typography

export interface EntryCardProps {
  name: string
  summary: string
  tags: string[]
  favorite: boolean
  updatedAt: string
  /** 来源标识：AI 生成 / 手动 / 迁移 */
  sourceText?: string
  /** 收到推荐时展示「来自 XX」 */
  sharedByName?: string
  /** 卡片主色（区分提示词 / 技能） */
  accent: string
  onOpen: () => void
  onCopy: () => void
  onDownload: () => void
  onToggleFavorite: () => void
  onShare: () => void
  onDelete: () => void
}

export default function EntryCard({
  name,
  summary,
  tags,
  favorite,
  updatedAt,
  sourceText,
  sharedByName,
  accent,
  onOpen,
  onCopy,
  onDownload,
  onToggleFavorite,
  onShare,
  onDelete,
}: EntryCardProps) {
  const { token } = theme.useToken()
  const visibleTags = tags.slice(0, 3)
  const rest = tags.length - visibleTags.length

  return (
    <div
      style={{
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusLG,
        padding: 14,
        background: token.colorBgContainer,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minHeight: 150,
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = accent
        e.currentTarget.style.boxShadow = `0 2px 8px rgba(0,0,0,0.18)`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = token.colorBorderSecondary
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <span
          style={{
            width: 4,
            alignSelf: 'stretch',
            minHeight: 20,
            borderRadius: 2,
            background: accent,
            flexShrink: 0,
          }}
        />
        <div
          onClick={onOpen}
          style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
          title={name}
        >
          <Text strong ellipsis style={{ fontSize: 14, display: 'block' }}>
            {name}
          </Text>
        </div>
        <Space size={0}>
          <Tooltip title="复制内容">
            <Button size="small" type="text" icon={<CopyOutlined />} onClick={onCopy} />
          </Tooltip>
          <Tooltip title={favorite ? '取消收藏' : '收藏'}>
            <Button
              size="small"
              type="text"
              icon={
                favorite ? (
                  <StarFilled style={{ color: token.colorWarning }} />
                ) : (
                  <StarOutlined />
                )
              }
              onClick={onToggleFavorite}
            />
          </Tooltip>
          <Tooltip title="下载">
            <Button size="small" type="text" icon={<DownloadOutlined />} onClick={onDownload} />
          </Tooltip>
          <Dropdown
            menu={{
              items: [
                { key: 'open', icon: <EyeOutlined />, label: '查看详情' },
                { key: 'edit', icon: <EditOutlined />, label: '编辑' },
                { key: 'share', icon: <ShareAltOutlined />, label: '推荐分享' },
                { type: 'divider' },
                { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true },
              ],
              onClick: ({ key }) => {
                if (key === 'open' || key === 'edit') onOpen()
                else if (key === 'share') onShare()
                else if (key === 'delete') onDelete()
              },
            }}
            trigger={['click']}
          >
            <Button size="small" type="text" icon={<EllipsisOutlined />} />
          </Dropdown>
        </Space>
      </div>

      <Paragraph
        type="secondary"
        style={{
          fontSize: 12,
          marginBottom: 0,
          lineHeight: 1.6,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          minHeight: 38,
        }}
      >
        {summary || '（暂无摘要）'}
      </Paragraph>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {visibleTags.map((t) => (
          <Tag key={t} style={{ fontSize: 11, marginInlineEnd: 0 }}>
            {t}
          </Tag>
        ))}
        {rest > 0 && (
          <Tag style={{ fontSize: 11, marginInlineEnd: 0 }}>+{rest}</Tag>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 11,
          color: token.colorTextDescription,
          marginTop: 'auto',
        }}
      >
        <span>{new Date(updatedAt).toLocaleDateString('zh-CN')}</span>
        <span>
          {sharedByName ? `来自 ${sharedByName}` : sourceText}
        </span>
      </div>
    </div>
  )
}
