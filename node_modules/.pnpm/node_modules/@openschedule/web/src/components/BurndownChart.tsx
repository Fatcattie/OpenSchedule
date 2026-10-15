/**
 * 职责：自绘 SVG 燃尽图 —— remaining 线 + baseline 理想线
 */
import { useMemo } from 'react'
import type { BurndownData } from '@/types'

interface BurndownChartProps {
  data: BurndownData
}

export default function BurndownChart({ data }: BurndownChartProps) {
  const { points } = data

  const svgWidth = 600
  const svgHeight = 300
  const padding = { top: 20, right: 30, bottom: 40, left: 50 }
  const chartW = svgWidth - padding.left - padding.right
  const chartH = svgHeight - padding.top - padding.bottom

  const maxRemaining = useMemo(() => {
    return Math.max(...points.map(p => Math.max(p.remaining, p.baseline)), 1)
  }, [points])

  const xScale = (i: number) => padding.left + (i / Math.max(points.length - 1, 1)) * chartW
  const yScale = (v: number) => padding.top + chartH - (v / maxRemaining) * chartH

  // baseline 直线（从 (0, baseline) 到 (n-1, 0)）
  const baselinePoints = points.map((p, i) => `${xScale(i)},${yScale(p.baseline * (1 - i / (points.length - 1)))}`).join(' ')
  // remaining 折线
  const remainingPoints = points.map((p, i) => `${xScale(i)},${yScale(p.remaining)}`).join(' ')

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={svgWidth} height={svgHeight} style={{ display: 'block', margin: '0 auto' }}>
        {/* 网格线 */}
        {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
          const y = padding.top + chartH * (1 - ratio)
          return (
            <g key={ratio}>
              <line x1={padding.left} y1={y} x2={svgWidth - padding.right} y2={y} stroke="#e5e7eb" strokeWidth={0.5} />
              <text x={padding.left - 5} y={y + 4} textAnchor="end" fontSize={10} fill="#94a3b8">
                {Math.round(maxRemaining * ratio)}
              </text>
            </g>
          )
        })}

        {/* X 轴标签（每隔几天显示一个） */}
        {points.map((p, i) => {
          if (i % Math.max(1, Math.floor(points.length / 7)) !== 0 && i !== points.length - 1) return null
          return (
            <text key={i} x={xScale(i)} y={svgHeight - 8} textAnchor="middle" fontSize={10} fill="#94a3b8">
              {p.date.slice(5)}
            </text>
          )
        })}

        {/* Baseline 理想线 */}
        <polyline
          points={baselinePoints}
          fill="none"
          stroke="#94a3b8"
          strokeWidth={1.5}
          strokeDasharray="6,3"
        />
        <text x={svgWidth - padding.right + 5} y={yScale(points[0].baseline) + 4} fontSize={10} fill="#94a3b8">
          理想
        </text>

        {/* Remaining 实际线 */}
        <polyline
          points={remainingPoints}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={2}
        />

        {/* 数据点 */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={xScale(i)} cy={yScale(p.remaining)} r={3} fill="#3b82f6" />
            <circle cx={xScale(i)} cy={yScale(p.baseline * (1 - i / (points.length - 1)))} r={2} fill="#94a3b8" />
          </g>
        ))}

        {/* 轴 */}
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={svgHeight - padding.bottom} stroke="#cbd5e1" strokeWidth={1} />
        <line x1={padding.left} y1={svgHeight - padding.bottom} x2={svgWidth - padding.right} y2={svgHeight - padding.bottom} stroke="#cbd5e1" strokeWidth={1} />
      </svg>

      {/* 图例 */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 8, fontSize: 12, color: '#64748b' }}>
        <span><span style={{ display: 'inline-block', width: 16, height: 2, background: '#3b82f6', marginRight: 4 }} />剩余任务数</span>
        <span><span style={{ display: 'inline-block', width: 16, height: 2, background: '#94a3b8', marginRight: 4, borderBottom: '2px dashed' }} />理想线</span>
      </div>
    </div>
  )
}
