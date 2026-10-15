/**
 * 职责：成员×日期热力格子 —— 颜色深浅 = hours，展示每人每天的任务数和工时
 */
import { useMemo } from 'react'
import type { LoadData } from '@/types'

interface LoadHeatmapProps {
  data: LoadData
}

/** 根据小时数返回颜色深浅 */
function getHeatColor(hours: number, maxHours: number): string {
  if (hours === 0) return '#f8fafc'
  const intensity = Math.min(hours / Math.max(maxHours, 1), 1)
  // 从浅蓝到深蓝的渐变
  const r = Math.round(239 - intensity * 100)
  const g = Math.round(68 - intensity * 40)
  const b = Math.round(25 + intensity * 30)
  return `rgb(${r}, ${g}, ${b})`
}

export default function LoadHeatmap({ data }: LoadHeatmapProps) {
  const { members, days, start } = data

  // 生成日期列
  const dates = useMemo(() => {
    const result: string[] = []
    const cur = new Date(start)
    for (let i = 0; i < days; i++) {
      result.push(cur.toISOString().slice(0, 10))
      cur.setUTCDate(cur.getUTCDate() + 1)
    }
    return result
  }, [start, days])

  // 找最大工时用于颜色缩放
  const maxHours = useMemo(() => {
    let max = 0
    for (const m of members) {
      for (const l of m.loads) {
        if (l.hours > max) max = l.hours
      }
    }
    return Math.max(max, 8) // 默认 8 小时为满
  }, [members])

  if (members.length === 0) {
    return <div style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>暂无负载数据</div>
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: '100%' }}>
        <thead>
          <tr>
            <th style={{ padding: '8px 4px', textAlign: 'left', minWidth: 100, borderBottom: '1px solid #e5e7eb' }}>成员</th>
            {dates.map(d => (
              <th key={d} style={{ padding: '4px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', minWidth: 28, color: '#94a3b8' }}>
                {d.slice(5)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {members.map(member => (
            <tr key={member.userId}>
              <td style={{ padding: '4px 8px', fontWeight: 500, borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>
                {member.displayName}
              </td>
              {dates.map(date => {
                const load = member.loads.find(l => l.date === date)
                const hours = load?.hours ?? 0
                const bgColor = getHeatColor(hours, maxHours)
                return (
                  <td
                    key={date}
                    style={{
                      padding: 0,
                      textAlign: 'center',
                      borderBottom: '1px solid #f1f5f9',
                      backgroundColor: bgColor,
                      minWidth: 28,
                      height: 24,
                      color: hours > 4 ? '#fff' : '#475569',
                    }}
                    title={`${member.displayName} ${date}: ${load?.taskCount ?? 0} 个任务，${hours} 小时`}
                  >
                    {hours > 0 ? hours : ''}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* 图例 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 11, color: '#64748b' }}>
        <span>少</span>
        <div style={{ display: 'flex', gap: 2 }}>
          {[0, 0.25, 0.5, 0.75, 1].map(r => (
            <div
              key={r}
              style={{
                width: 16,
                height: 12,
                background: getHeatColor(r * maxHours, maxHours),
                border: '1px solid #e5e7eb',
              }}
            />
          ))}
        </div>
        <span>多</span>
        <span style={{ marginLeft: 8 }}>({maxHours}h 满负荷)</span>
      </div>
    </div>
  )
}
