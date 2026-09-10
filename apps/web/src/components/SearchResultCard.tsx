/**
 * 职责：搜索结果卡片 —— 通用命中项卡片（标题 + 可选描述 + 标签/次要信息），hover 可点，用于搜索页任务/项目分组列表
 */
import { Card, Space, Typography } from 'antd'
import type { ReactNode } from 'react'

const { Text } = Typography

export default function SearchResultCard({
  title,
  description,
  tags,
  meta,
  onClick,
}: {
  title: string
  description?: string | null
  /** 标签区（状态/优先级等 Tag 组合，由调用方渲染） */
  tags?: ReactNode
  /** 次要信息区（负责人/截止时间等文本） */
  meta?: ReactNode
  onClick?: () => void
}) {
  return (
    <Card size="small" hoverable style={{ marginBottom: 8 }} onClick={onClick}>
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        <span style={{ fontWeight: 500 }}>{title}</span>
        {description && (
          <Text type="secondary" ellipsis style={{ fontSize: 12 }}>
            {description}
          </Text>
        )}
        {(tags || meta) && (
          <Space size={4} wrap>
            {tags}
            {meta}
          </Space>
        )}
      </Space>
    </Card>
  )
}
