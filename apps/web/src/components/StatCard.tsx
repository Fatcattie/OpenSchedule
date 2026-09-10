/**
 * StatCard —— 指标卡片（大字数字 + 标题 + 辅助描述）
 */
import { Card, Typography } from 'antd'

const { Text, Title } = Typography

interface StatCardProps {
  title: string
  value: string | number
  hint?: string
  color?: string
  style?: React.CSSProperties
}

export default function StatCard({ title, value, hint, color = '#1677ff', style }: StatCardProps) {
  return (
    <Card bodyStyle={{ padding: '16px 20px' }} style={{ ...style }}>
      <Text type="secondary" style={{ fontSize: 12 }}>{title}</Text>
      <Title level={3} style={{ margin: '8px 0 4px', color }}>
        {value}
      </Title>
      {hint && <Text type="secondary" style={{ fontSize: 12 }}>{hint}</Text>}
    </Card>
  )
}
