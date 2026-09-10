/**
 * 职责：自绘 SVG 甘特图 —— 任务条 + 依赖连线 + 里程碑菱形 + 关键路径高亮 + 今日线
 * 不引入第三方甘特库；纯 SVG 渲染，支持选中/拖拽改期（简化版：点击选中 + 输入新日期）
 */
import { useMemo, useState } from 'react'
import { DatePicker, Modal, Space, Typography } from 'antd'
import dayjs from 'dayjs'
import type { GanttData, GanttRow } from '@/types'

const { Text } = Typography

/** 行高与间距 */
const ROW_HEIGHT = 36
const LABEL_WIDTH = 200
const TICK_HEIGHT = 12
const MILESTONE_SIZE = 10

interface GanttChartProps {
  data: GanttData
  dependencies?: (number[] | null)[] // rows[i] = 前置任务索引列表
  onTaskClick?: (rowIndex: number) => void
  selectedRowIndex?: number | null
}

/** 根据时间窗口计算 x 坐标 */
function dateToX(dateStr: string, windowStart: Date, windowEnd: Date, totalWidth: number): number {
  const t = new Date(dateStr).getTime()
  const start = windowStart.getTime()
  const end = windowEnd.getTime()
  const ratio = (t - start) / (end - start)
  return LABEL_WIDTH + ratio * (totalWidth - LABEL_WIDTH)
}

/** 根据进度和状态决定颜色 */
function getBarColor(row: GanttRow): string {
  if (row.milestone) return '#f59e0b'
  if (row.critical) return '#ef4444'
  switch (row.status) {
    case 'done': return '#22c55e'
    case 'in_progress': return '#3b82f6'
    case 'blocked': return '#f97316'
    default: return '#94a3b8'
  }
}

/** 甘特图组件 */
export default function GanttChart({ data, dependencies: depEdges, onTaskClick, selectedRowIndex }: GanttChartProps) {
  const [selectedTask, setSelectedTask] = useState<GanttRow | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [newStart, setNewStart] = useState<string>('')
  const [newEnd, setNewEnd] = useState<string>('')

  const { rows, window } = data
  const windowStart = useMemo(() => new Date(window.start), [window.start])
  const windowEnd = useMemo(() => new Date(window.end), [window.end])

  // 总宽度（SVG viewBox）
  const totalWidth = 800
  const svgWidth = totalWidth
  const svgHeight = rows.length * (ROW_HEIGHT + 2) + TICK_HEIGHT + 40

  // 今日线 x 坐标
  const todayX = dateToX(new Date().toISOString(), windowStart, windowEnd, totalWidth)

  const handleRowClick = (index: number) => {
    const row = rows[index]
    setSelectedTask(row)
    onTaskClick?.(index)
  }

  const handleSave = () => {
    // TODO: 调用 PATCH /tasks/:taskId 更新 dueAt 或 estimatedHours，然后刷新甘特数据
    setEditOpen(false)
  }

  // 生成日期刻度
  const tickElements = useMemo(() => {
    const elements: any[] = []
    const cur = new Date(windowStart)
    const end = new Date(windowEnd)
    let i = 0
    while (cur <= end) {
      const x = dateToX(cur.toISOString(), windowStart, windowEnd, totalWidth)
      const isMonday = cur.getUTCDay() === 1
      elements.push(
        <g key={i}>
          <line x1={x} y1={TICK_HEIGHT} x2={x} y2={svgHeight} stroke="#e5e7eb" strokeWidth={0.5} />
          {isMonday && (
            <text x={x} y={TICK_HEIGHT - 2} textAnchor="middle" fontSize={10} fill="#64748b">
              {cur.getUTCDate()}日
            </text>
          )}
        </g>
      )
      cur.setUTCDate(cur.getUTCDate() + 1)
      i++
    }
    return elements
  }, [windowStart, windowEnd, svgHeight])

  // 生成行元素
  const rowElements = useMemo(() => {
    return rows.map((row, i) => {
      const y = TICK_HEIGHT + i * (ROW_HEIGHT + 2) + ROW_HEIGHT / 2
      const isSelected = selectedRowIndex === i
      return (
        <g key={row.taskId}>
          {/* 行背景 */}
          <rect
            x={0}
            y={TICK_HEIGHT + i * (ROW_HEIGHT + 2)}
            width={totalWidth}
            height={ROW_HEIGHT}
            fill={isSelected ? '#eff6ff' : i % 2 === 0 ? '#fff' : '#f8fafc'}
          />
          {/* 左侧标签区 */}
          <rect
            x={0}
            y={TICK_HEIGHT + i * (ROW_HEIGHT + 2)}
            width={LABEL_WIDTH}
            height={ROW_HEIGHT}
            fill={isSelected ? '#dbeafe' : '#f1f5f9'}
          />
          <text
            x={8}
            y={y + 4}
            fontSize={12}
            fill={isSelected ? '#1d4ed8' : '#334155'}
            style={{ cursor: 'pointer' }}
            onClick={() => handleRowClick(i)}
          >
            {row.title.length > 20 ? row.title.slice(0, 20) + '…' : row.title}
          </text>
          {/* 任务条 */}
          {row.milestone ? (
            // 里程碑：菱形
            <g transform={`translate(${dateToX(row.start, windowStart, windowEnd, totalWidth)}, ${y})`}>
              <polygon
                points={`0,-${MILESTONE_SIZE} ${MILESTONE_SIZE},0 0,${MILESTONE_SIZE} -${MILESTONE_SIZE},0`}
                fill={getBarColor(row)}
                stroke="#fff"
                strokeWidth={1.5}
                style={{ cursor: 'pointer' }}
                onClick={() => handleRowClick(i)}
              />
            </g>
          ) : (
            // 普通任务条
            <g>
              <rect
                x={dateToX(row.start, windowStart, windowEnd, totalWidth)}
                y={y - 8}
                width={Math.max(4, dateToX(row.end, windowStart, windowEnd, totalWidth) - dateToX(row.start, windowStart, windowEnd, totalWidth))}
                height={16}
                rx={2}
                fill={getBarColor(row)}
                opacity={row.status === 'done' ? 0.7 : 0.9}
                style={{ cursor: 'pointer' }}
                onClick={() => handleRowClick(i)}
              />
              {/* 进度填充 */}
              {row.progress > 0 && row.progress < 100 && (
                <rect
                  x={dateToX(row.start, windowStart, windowEnd, totalWidth)}
                  y={y - 8}
                  width={Math.max(4, (dateToX(row.end, windowStart, windowEnd, totalWidth) - dateToX(row.start, windowStart, windowEnd, totalWidth)) * row.progress / 100)}
                  height={16}
                  rx={2}
                  fill="rgba(255,255,255,0.3)"
                />
              )}
            </g>
          )}
        </g>
      )
    })
  }, [rows, selectedRowIndex, windowStart, windowEnd, totalWidth])

  // 依赖连线
  const depLines = useMemo(() => {
    if (!depEdges) return null
    return depEdges.map((prevIds, i) =>
      (prevIds ?? []).map(pid => {
        if (pid < 0) return null
        const prevY = TICK_HEIGHT + pid * (ROW_HEIGHT + 2) + ROW_HEIGHT / 2
        const currY = TICK_HEIGHT + i * (ROW_HEIGHT + 2) + ROW_HEIGHT / 2
        const fromX = dateToX(rows[pid].end, windowStart, windowEnd, totalWidth)
        const toX = dateToX(rows[i].start, windowStart, windowEnd, totalWidth)
        return (
          <line
            key={`${pid}-${i}`}
            x1={fromX}
            y1={prevY}
            x2={toX}
            y2={currY}
            stroke="#94a3b8"
            strokeWidth={1.5}
            markerEnd="url(#arrowhead)"
          />
        )
      }).filter(Boolean)
    ).flat()
  }, [depEdges, rows, windowStart, windowEnd])

  return (
    <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
      <svg
        width={Math.max(svgWidth, LABEL_WIDTH + 200)}
        height={svgHeight}
        style={{ display: 'block' }}
      >
        {/* 背景 */}
        <rect x={0} y={0} width={totalWidth} height={svgHeight} fill="#fafafa" />

        {/* 列标题：日期刻度 */}
        {tickElements}

        {/* 行分隔线 + 标签 */}
        {rowElements}

        {/* 依赖连线 */}
        {depLines}

        {/* 今日线 */}
        {todayX > LABEL_WIDTH && todayX < totalWidth && (
          <line
            x1={todayX}
            y1={TICK_HEIGHT}
            x2={todayX}
            y2={svgHeight}
            stroke="#ef4444"
            strokeWidth={1.5}
            strokeDasharray="4,2"
          />
        )}

        {/* 箭头标记定义 */}
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
            <polygon points="0 0, 10 3, 0 6" fill="#94a3b8" />
          </marker>
        </defs>
      </svg>

      {/* 今日标注 */}
      <div style={{ padding: '4px 8px', fontSize: 11, color: '#94a3b8', borderTop: '1px solid #e5e7eb' }}>
        <span style={{ color: '#ef4444' }}>│</span> 今日
      </div>

      {/* 图例 */}
      <div style={{ padding: '4px 8px', fontSize: 11, color: '#64748b', display: 'flex', gap: 12 }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#3b82f6', borderRadius: 2, marginRight: 4 }} />进行中</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#22c55e', borderRadius: 2, marginRight: 4 }} />已完成</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#ef4444', borderRadius: 2, marginRight: 4 }} />关键路径</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#f59e0b', borderRadius: 0, transform: 'rotate(45deg)', marginRight: 4 }} />里程碑</span>
      </div>

      {/* 编辑弹窗 */}
      <Modal
        title={`编辑任务：${selectedTask?.title ?? ''}`}
        open={editOpen}
        onOk={handleSave}
        onCancel={() => setEditOpen(false)}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong>开始日期</Text>
            <DatePicker
              value={newStart ? dayjs(newStart) : null}
              onChange={(_date, dateString) => setNewStart(Array.isArray(dateString) ? dateString[0] : dateString || '')}
              style={{ marginLeft: 8 }}
            />
          </div>
          <div>
            <Text strong>结束日期</Text>
            <DatePicker
              value={newEnd ? dayjs(newEnd) : null}
              onChange={(_date, dateString) => setNewEnd(Array.isArray(dateString) ? dateString[0] : dateString || '')}
              style={{ marginLeft: 8 }}
            />
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            修改后请点击「保存」，系统将重新计算 CPM 并刷新甘特图
          </Text>
        </Space>
      </Modal>
    </div>
  )
}
