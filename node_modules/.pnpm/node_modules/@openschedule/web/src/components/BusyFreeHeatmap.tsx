/**
 * BusyFreeHeatmap —— 忙闲热力图组件
 *
 * 展示：多行（人员）× 多列（日期）的网格，颜色越深表示越忙
 */
import type { DayLoad } from '@/types'

interface Props {
  /** 多人的日负载数据，key 是 userId/名字 */
  userLoads: Record<string, DayLoad[]>
  /** 用户 ID → 显示名的映射 */
  userNames?: Record<string, string>
  /** 单位：像素，每格宽高 */
  cellSize?: number
}

export default function BusyFreeHeatmap({
  userLoads,
  userNames = {},
  cellSize = 28,
}: Props) {
  const userIds = Object.keys(userLoads)
  if (userIds.length === 0) return null

  // 取第一个用户的日期列表作为 x 轴
  const dates = userLoads[userIds[0]].map(d => d.date)
  const dayWidth = cellSize * 1.8

  // 颜色：从浅绿（空闲）到深红（满负荷）
  function loadColor(ratio: number): string {
    if (ratio <= 0.2) return '#f6ffed'
    if (ratio <= 0.4) return '#d9f7be'
    if (ratio <= 0.6) return '#fffb8f'
    if (ratio <= 0.8) return '#ffd666'
    if (ratio <= 0.95) return '#ffa940'
    return '#f5222d'
  }

  function formatDateLabel(dateStr: string): string {
    const parts = dateStr.split('-')
    return `${parts[1]}/${parts[2]}`
  }

  function getWeekday(dateStr: string): string {
    const d = new Date(dateStr)
    const wd = d.getDay()
    return ['日', '一', '二', '三', '四', '五', '六'][wd]
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'inline-block', minWidth: '100%' }}>
        {/* 日期行 */}
        <div style={{ display: 'flex', marginLeft: 90 }}>
          {dates.map(date => (
            <div
              key={date}
              style={{
                width: dayWidth,
                textAlign: 'center',
                fontSize: 11,
                color: '#999',
                padding: '4px 0',
                flexShrink: 0,
              }}
            >
              <div>{formatDateLabel(date)}</div>
              <div style={{ fontSize: 10 }}>周{getWeekday(date)}</div>
            </div>
          ))}
        </div>

        {/* 每人一行 */}
        {userIds.map(userId => {
          const loads = userLoads[userId]
          const name = userNames[userId] || userId
          return (
            <div key={userId} style={{ display: 'flex', alignItems: 'center', marginBottom: 2 }}>
              <div
                style={{
                  width: 80,
                  fontSize: 12,
                  color: '#333',
                  textAlign: 'right',
                  paddingRight: 10,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={name}
              >
                {name}
              </div>
              <div style={{ display: 'flex', flexShrink: 0 }}>
                {loads.map(load => (
                  <div
                    key={load.date}
                    title={`${load.date}  ${Math.round(load.loadRatio * 100)}% 负载（${load.busyMinutes}/${load.totalWorkMinutes} 分钟）`}
                    style={{
                      width: dayWidth,
                      height: cellSize,
                      background: loadColor(load.loadRatio),
                      border: '1px solid #fff',
                      borderRadius: 3,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      color: load.loadRatio > 0.7 ? '#fff' : '#666',
                      fontWeight: 500,
                    }}
                  >
                    {Math.round(load.loadRatio * 100)}%
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {/* 图例 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, marginLeft: 90, fontSize: 11, color: '#999' }}>
          <span>空闲</span>
          {[0.1, 0.3, 0.5, 0.7, 0.9].map(r => (
            <div
              key={r}
              style={{
                width: 20,
                height: 16,
                background: loadColor(r),
                borderRadius: 2,
                border: '1px solid #eee',
              }}
            />
          ))}
          <span>满载</span>
        </div>
      </div>
    </div>
  )
}
