/**
 * 职责：任务状态标签 —— 五态（规格 3.3）→ AntD Tag 颜色/文案映射
 */
import { Tag } from 'antd'
import { TASK_STATUS_META, type TaskStatus } from '@/types'

export default function StatusTag({ status }: { status: TaskStatus }) {
  const meta = TASK_STATUS_META[status]
  return <Tag color={meta.color}>{meta.label}</Tag>
}
