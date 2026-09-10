/**
 * StatusPie —— 任务状态分布饼图（纯 SVG，无外部依赖）
 * 使用 conic-gradient 思路：用多段 <circle stroke-dasharray> 模拟环形
 */
import { Typography } from 'antd'
import type { StatusDistribution as SD } from '@/types'

const { Text } = Typography

const STATUS_COLORS: Record<string, string> = {
  todo: '#bfbfbf',
  in_progress: '#1677ff',
  blocked: '#faad14',
  done: '#52c41a',
  cancelled: '#8c8c8c',
}

const STATUS_LABELS: Record<string, string> = {
  todo: '待办',
  in_progress: '进行中',
  blocked: '阻塞',
  done: '已完成',
  cancelled: '已取消',
}

interface StatusPieProps {
  data: SD
  size?: number
  strokeWidth?: number
}

export default function StatusPie({ data, size = 180, strokeWidth = 24 }: StatusPieProps) {
  const entries = (Object.keys(data) as (keyof SD)[]).filter(k => data[k] > 0)
  const total = entries.reduce((s, k) => s + data[k], 0)

  const r = (size - strokeWidth) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r

  let offset = 0
  const segments = entries.map(key => {
    const value = data[key]
    const ratio = total > 0 ? value / total : 0
    const dashLength = ratio * circumference
    const seg = {
      key,
      color: STATUS_COLORS[key] ?? '#999',
      dashArray: `${dashLength} ${circumference - dashLength}`,
      dashOffset: -offset,
      ratio,
      value,
    }
    offset += dashLength
    return seg
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f0f0f0" strokeWidth={strokeWidth} />
        {segments.map(seg => (
          <circle
            key={seg.key}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeDasharray={seg.dashArray}
            strokeDashoffset={seg.dashOffset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={28} fontWeight={600} fill="#1a1a1a">
          {total}
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize={12} fill="#8c8c8c">
          总任务
        </text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {segments.map(seg => (
          <div key={seg.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{ width: 10, height: 10, borderRadius: 2, background: seg.color, display: 'inline-block' }}
            />
            <Text style={{ fontSize: 13, minWidth: 60 }}>{STATUS_LABELS[seg.key] ?? seg.key}</Text>
            <Text strong style={{ fontSize: 13 }}>{seg.value}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {Math.round(seg.ratio * 100)}%
            </Text>
          </div>
        ))}
      </div>
    </div>
  )
}
