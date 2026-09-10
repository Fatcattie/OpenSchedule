/**
 * 职责：三态组件之空数据 —— 居中 Empty + 可选附加操作
 */
import { Empty } from 'antd'
import type { ReactNode } from 'react'

export default function EmptyView({ description = '暂无数据', action }: { description?: string; action?: ReactNode }) {
  return (
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={description} style={{ padding: '24px 0' }}>
      {action}
    </Empty>
  )
}
