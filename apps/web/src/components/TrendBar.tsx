/**
 * TrendBar —— 4 周趋势条形图（纯 SVG，无外部依赖）
 */
import { Typography } from 'antd'

const { Text } = Typography

interface TrendPoint {
  week: string
  value: number
  label?: string
}

interface TrendBarProps {
  data: TrendPoint[]
  title?: string
  barColor?: string
  valueSuffix?: string
  height?: number
}

export default function TrendBar({
  data,
  title,
  barColor = '#1677ff',
  valueSuffix = '',
  height = 200,
}: TrendBarProps) {
  const width = 320
  const padding = { top: 20, right: 12, bottom: 36, left: 36 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom

  const maxVal = Math.max(...data.map(d => d.value), 1)
  const barWidth = (chartW / data.length) * 0.6
  const gap = (chartW / data.length) * 0.4

  const formatWeek = (w: string) => {
    const parts = w.split('-')
    return `${parts[1]}/${parts[2]}`
  }

  return (
    <div>
      {title && <Text strong style={{ fontSize: 13, marginBottom: 8, display: 'block' }}>{title}</Text>}
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        {/* 基线 */}
        <line
          x1={padding.left}
          y1={padding.top + chartH}
          x2={padding.left + chartW}
          y2={padding.top + chartH}
          stroke="#e8e8e8"
          strokeWidth={1}
        />
        {/* Y 轴刻度（0 / 50% / 100%） */}
        {[0, 0.5, 1].map(pct => {
          const y = padding.top + chartH * (1 - pct)
          return (
            <g key={pct}>
              <line
                x1={padding.left}
                y1={y}
                x2={padding.left + chartW}
                y2={y}
                stroke="#f0f0f0"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <text x={padding.left - 6} y={y + 4} fontSize={10} fill="#bfbfbf" textAnchor="end">
                {Math.round(maxVal * pct)}
              </text>
            </g>
          )
        })}
        {/* 条形 */}
        {data.map((d, i) => {
          const barH = chartH * (d.value / maxVal)
          const x = padding.left + i * (barWidth + gap) + gap / 2
          const y = padding.top + chartH - barH
          return (
            <g key={d.week}>
              <rect x={x} y={y} width={barWidth} height={barH} fill={barColor} rx={2} ry={2} opacity={0.85}>
                <title>{d.label ?? d.value + valueSuffix}</title>
              </rect>
              <text x={x + barWidth / 2} y={y - 4} fontSize={10} fill="#595959" textAnchor="middle">
                {d.value}{valueSuffix}
              </text>
              <text
                x={x + barWidth / 2}
                y={padding.top + chartH + 16}
                fontSize={11}
                fill="#8c8c8c"
                textAnchor="middle"
              >
                {formatWeek(d.week)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
