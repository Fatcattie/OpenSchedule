/**
 * CalendarBoard —— 日历看板（日 / 周 / 月 / 年）
 *
 * 设计要点：
 * 1. 时间跨度合成 getSpan：优先用 startAt/endAt；缺省时由 dueAt ± estimatedHours 推算；
 *    再缺省时由 id 哈希做确定性兜底，保证不依赖 localStorage 里是否已有排期字段也能展示。
 * 2. 任务条按真实时长渲染：周看板内跨上午/下午/晚上，月/年看板跨日期/月份格子，
 *    长度不再占满整个格子，也不再受表格边框限制。
 * 3. 超过当前看板展示时长的任务/计划进侧边「跨周期任务/计划」栏：
 *    日>1天 / 周>1周 / 月>1月 / 年>1年。
 * 4. 仅展示与「我」相关的任务/计划；「全局日历」仅管理员可开。
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Button,
  Segmented,
  DatePicker,
  Space,
  Tag,
  Tooltip,
  Empty,
  Typography,
  Row,
  Col,
  Statistic,
  theme,
} from 'antd'
import {
  CalendarOutlined,
  PlusOutlined,
  UserOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons'
import dayjs, { Dayjs } from 'dayjs'
import type { WorkspaceTask, TaskUrgency } from '@/types'
import { TASK_KIND_META, TASK_URGENCY_META, deriveTaskUrgency } from '@/types'
import { lookupMemberName, useMe } from '@/hooks/useWorkspaceIdentity'
import { taskRoute } from '@/utils/taskTree'

const { Text } = Typography

export type CalView = 'day' | 'week' | 'month' | 'year'

const VIEW_LABELS: Record<CalView, string> = { day: '日', week: '周', month: '月', year: '年' }

/** 任务/计划类别配色（条底色 / 左侧强调色） */
const KIND_STYLE: Record<string, { bg: string; border: string; label: string }> = {
  task: { bg: '#e6f0ff', border: '#1677ff', label: '任务' },
  plan: { bg: '#e6fffb', border: '#13c2c2', label: '个人计划' },
  review: { bg: '#f9f0ff', border: '#722ed1', label: '评审' },
}
const kindStyle = (kind?: string) => KIND_STYLE[kind ?? 'task'] ?? KIND_STYLE.task

/** 承担人显示名 */
const nameOf = (id?: string | null) =>
  id ? lookupMemberName(id) ?? id : '未指派'

/** 任务简要（描述优先，其次完成总结） */
const briefOf = (t: WorkspaceTask) => {
  if (t.description && t.description.trim()) return t.description.trim()
  if (t.completion?.summary) return t.completion.summary
  return '（暂无描述）'
}

/** 紧急度便签：优先用显式 urgency；其次按重要程度×紧急程度推导；缺省时按优先级推导 */
const URGENCY_META = TASK_URGENCY_META
const urgencyOf = (t: WorkspaceTask): TaskUrgency => {
  if (t.urgency) return t.urgency
  if (t.importance || t.urgencyDegree) return deriveTaskUrgency(t.importance, t.urgencyDegree)
  switch (t.priority) {
    case 'urgent':
      return 'urgent'
    case 'high':
      return 'important'
    case 'medium':
      return 'notUrgent'
    default:
      return 'notImportant'
  }
}

/** 任务/计划是否超过当前看板的展示时长 */
function exceedsBoard(span: TaskSpan, view: CalView): boolean {
  if (view === 'day') return span.start.add(1, 'day').isBefore(span.end)
  if (view === 'week') return span.start.add(7, 'day').isBefore(span.end)
  if (view === 'month') return span.start.add(1, 'month').isBefore(span.end)
  return span.start.add(1, 'year').isBefore(span.end)
}

/** 确定性哈希：用于无排期字段时的兜底时长/落点 */
function hashId(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

export interface TaskSpan {
  start: Dayjs
  end: Dayjs
  /** 是否来自真实排期字段（startAt/endAt），false 表示合成 */
  real: boolean
}

/**
 * 推算任务时间跨度。
 * - 有 startAt/endAt 且合法 → 直接用。
 * - 仅 dueAt → 以截止日为终点，向前推 estimatedHours 作为起点（默认 2h）。
 * - 都没有 → 以今天 9 点为基准，按 id 哈希确定性偏移，时长 0.5~3h。
 */
export function getSpan(t: WorkspaceTask): TaskSpan {
  if (t.startAt && t.endAt) {
    const s = dayjs(t.startAt)
    const e = dayjs(t.endAt)
    if (e.isAfter(s)) return { start: s, end: e, real: true }
  }
  const dur = Math.max(0.5, Math.min(8, t.estimatedHours ?? 2))
  if (t.dueAt) {
    const due = dayjs(t.dueAt)
    return { start: due.subtract(dur, 'hour'), end: due, real: false }
  }
  const off = hashId(t.id) % 6
  const base = dayjs().hour(9).minute(0).second(0).subtract(off, 'day')
  return { start: base, end: base.add(dur, 'hour'), real: false }
}

/** 截取 span 与指定范围的交集 */
function intersectSpan(span: TaskSpan, start: Dayjs, end: Dayjs): TaskSpan | null {
  const s = span.start.isBefore(start) ? start : span.start
  const e = span.end.isAfter(end) ? end : span.end
  if (!e.isAfter(s)) return null
  return { start: s, end: e, real: span.real }
}

/** 一天内的小时比例（0-24） */
function dayFrac(d: Dayjs): number {
  return d.hour() + d.minute() / 60 + d.second() / 3600
}

/** 槽位分配：避免同一行/列内任务条重叠 */
function assignSlots<T extends { start: number; end: number }>(items: T[]): Array<T & { slotIndex: number }> {
  const slots: number[] = []
  return items.map((item) => {
    let idx = slots.findIndex((end) => end <= item.start)
    if (idx === -1) idx = slots.length
    slots[idx] = item.end
    return { ...item, slotIndex: idx }
  })
}

const PERIODS: { key: 'am' | 'pm' | 'eve'; label: string; range: string; from: number; to: number }[] = [
  { key: 'am', label: '上午', range: '00:00–12:00', from: 0, to: 12 },
  { key: 'pm', label: '下午', range: '12:00–18:00', from: 12, to: 18 },
  { key: 'eve', label: '晚上', range: '18:00–24:00', from: 18, to: 24 },
]

// ====================== 通用任务条（支持跨格定位） ======================
interface TaskSegmentProps {
  task: WorkspaceTask
  span: TaskSpan
  compact?: boolean
  showTime?: boolean
  /** 全局日历：显示归属成员（承接人优先，其次创建人） */
  showOwner?: boolean
  onClick?: () => void
  style?: React.CSSProperties
}

function TaskSegment({ task, span, compact = false, showTime = true, showOwner = false, onClick, style }: TaskSegmentProps) {
  const ks = kindStyle(task.kind)
  const u = urgencyOf(task)
  const um = URGENCY_META[u]
  const tip = (
    <div style={{ maxWidth: 240 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        {task.title}
        <Tag color={ks.border} style={{ marginLeft: 6, fontSize: 11 }}>
          {ks.label}
        </Tag>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.7 }}>
        <div>
          <span
            style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: um.color, marginRight: 4 }}
          />
          紧急度：{um.label}
        </div>
        <div>
          <UserOutlined style={{ marginRight: 4 }} />
          承担人：{nameOf(task.assigneeId)}
        </div>
        <div>
          <ClockCircleOutlined style={{ marginRight: 4 }} />
          {span.start.format('MM-DD HH:mm')} ~ {span.end.format('MM-DD HH:mm')}
          {!span.real && <Text type="secondary">（按截止日估算）</Text>}
        </div>
        <div style={{ marginTop: 2 }}>
          <span style={{ color: '#999' }}>简要：</span>
          {briefOf(task)}
        </div>
      </div>
    </div>
  )
  return (
    <Tooltip title={tip} placement="topLeft">
      <div
        onClick={onClick}
        style={{
          background: ks.bg,
          borderLeft: `3px solid ${ks.border}`,
          borderRadius: 4,
          padding: compact ? '1px 6px' : '3px 8px',
          fontSize: compact ? 11 : 12,
          lineHeight: 1.3,
          cursor: 'pointer',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: '#1f1f1f',
          display: 'flex',
          alignItems: 'center',
          boxSizing: 'border-box',
          ...style,
        }}
      >
        {/* 紧急度便签：绿=不紧急 / 黄=紧急 / 蓝=重要 / 红=不重要 */}
        <span
          title={`紧急度：${um.label}`}
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: 2,
            background: um.color,
            marginRight: 5,
            flexShrink: 0,
          }}
        />
        {/* 全局日历：归属成员标签（承接人优先，其次创建人） */}
        {showOwner && (
          <span
            title={`归属：${nameOf(task.assigneeId ?? task.createdBy)}`}
            style={{
              fontSize: compact ? 10 : 11,
              fontWeight: 600,
              color: '#595959',
              background: 'rgba(255,255,255,0.7)',
              border: `1px solid ${ks.border}`,
              borderRadius: 3,
              padding: '0 4px',
              marginRight: 4,
              lineHeight: 1.4,
              flexShrink: 0,
            }}
          >
            {nameOf(task.assigneeId ?? task.createdBy)}
          </span>
        )}
        {showTime && !compact && (
          <span style={{ color: ks.border, marginRight: 4, fontWeight: 600 }}>{span.start.format('HH:mm')}</span>
        )}
        {task.title}
      </div>
    </Tooltip>
  )
}

// ====================== 日看板 ======================
const ROW_H = 44
const DAY_ROWS = 24
const TIME_COL_W = 64

const hourPeriodLabel = (h: number) => {
  if (h < 6) return '凌晨'
  if (h < 12) return '上午'
  if (h < 18) return '下午'
  return '晚上'
}

export function DayBoard({
  tasks,
  day,
  onSelect,
  mode = 'full',
  showOwner = false,
}: {
  tasks: WorkspaceTask[]
  day: Dayjs
  onSelect?: (t: WorkspaceTask) => void
  /**
   * full：日历页用，始终渲染 24h 网格（00:00-23:00）
   * compact：指挥舱 今日时间轴用，仅渲染有事项占用的时段，0 项时 200px 紧凑空态
   */
  mode?: 'full' | 'compact'
  /** 全局日历：在任务条上显示归属成员 */
  showOwner?: boolean
}) {
  const { token } = theme.useToken()
  const dayStart = day.startOf('day')
  const dayEnd = day.endOf('day')
  const isToday = useMemo(() => day.isSame(dayjs(), 'day'), [day])
  const now = useMemo(() => dayjs(), [isToday])
  const nowFrac = isToday ? dayFrac(now) : null

  const items = useMemo(() => {
    return tasks
      .map((t) => ({ t, span: getSpan(t) }))
      .filter(({ span }) => span.start.isBefore(dayEnd) && span.end.isAfter(dayStart))
      .filter(({ span }) => !exceedsBoard(span, 'day'))
      .sort((a, b) => a.span.start.valueOf() - b.span.start.valueOf())
  }, [tasks, dayStart, dayEnd])

  /** compact 模式：仅展示有事项占用的时段 */
  const occupiedHours = useMemo(() => {
    const set = new Set<number>()
    items.forEach(({ span }) => {
      const visStart = span.start.isBefore(dayStart) ? dayStart : span.start
      const visEnd = span.end.isAfter(dayEnd) ? dayEnd : span.end
      const startH = Math.max(0, Math.floor(visStart.diff(dayStart, 'hour', true)))
      const endH = Math.min(DAY_ROWS, Math.ceil(visEnd.diff(dayStart, 'hour', true)))
      for (let h = startH; h < endH; h += 1) set.add(h)
    })
    return Array.from(set).sort((a, b) => a - b)
  }, [items, dayStart])

  const isFull = mode === 'full'
  const firstHour = isFull ? 0 : (occupiedHours[0] ?? 8)
  const lastHour = isFull ? 23 : (occupiedHours[occupiedHours.length - 1] ?? 20)
  const visibleHours = useMemo(
    () => Array.from({ length: Math.max(1, lastHour - firstHour + 1) }, (_, i) => firstHour + i),
    [firstHour, lastHour],
  )
  const totalH = visibleHours.length * ROW_H

  // compact 模式：0 项时渲染紧凑空态（200px），不再铺满 24h
  if (!isFull && items.length === 0) {
    return (
      <div
        style={{
          position: 'relative',
          height: 200,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `1px solid ${token.colorBorder}`,
          borderRadius: token.borderRadiusLG,
          background: token.colorBgContainer,
        }}
      >
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: token.colorTextSecondary }}>
                {day.format('MM月DD日')} 当日无符合展示时长的任务/计划
              </div>
              <div style={{ fontSize: 12, color: token.colorTextDescription, marginTop: 4 }}>
                更长时段见右侧跨周期标签
              </div>
            </div>
          }
        />
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'relative',
        height: totalH,
        overflowY: 'auto',
        border: `1px solid ${token.colorBorder}`,
        borderRadius: token.borderRadiusLG,
        background: token.colorBgContainer,
      }}
    >
      {/* 时间轴背景条 */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: TIME_COL_W,
          background: token.colorFillTertiary,
          borderRight: `1px solid ${token.colorBorder}`,
          zIndex: 2,
        }}
      />

      {/* 小时网格线 + 交替底色（仅渲染有任务/计划的小时） */}
      {visibleHours.map((h, idx) => (
        <div
          key={h}
          style={{
            position: 'absolute',
            top: idx * ROW_H,
            left: TIME_COL_W,
            right: 0,
            height: ROW_H,
            borderTop: `1px solid ${idx === 0 ? 'transparent' : token.colorBorderSecondary}`,
            background: idx % 2 === 0 ? token.colorFillQuaternary : 'transparent',
            transition: 'background 0.2s',
            boxSizing: 'border-box',
          }}
        />
      ))}

      {/* 时间标签 */}
      {visibleHours.map((h, idx) => {
        const major = h % 6 === 0
        return (
          <div
            key={`label-${h}`}
            style={{
              position: 'absolute',
              top: idx * ROW_H,
              left: 0,
              width: TIME_COL_W,
              height: ROW_H,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              justifyContent: 'center',
              paddingRight: 8,
              transform: 'translateY(-50%)',
              zIndex: 3,
            }}
          >
            <span
              style={{
                fontSize: major ? 13 : 12,
                fontWeight: major ? 700 : 600,
                color: major ? token.colorText : token.colorTextSecondary,
                lineHeight: 1.2,
              }}
            >
              {String(h).padStart(2, '0')}:00
            </span>
            {major && (
              <span
                style={{
                  fontSize: 10,
                  color: token.colorTextDescription,
                  lineHeight: 1.2,
                  marginTop: 2,
                }}
              >
                {hourPeriodLabel(h)}
              </span>
            )}
          </div>
        )
      })}

      {/* 当前时间指示线（仅在可见区间内） */}
      {nowFrac !== null && nowFrac >= firstHour && nowFrac <= lastHour + 1 && (
        <div
          style={{
            position: 'absolute',
            left: TIME_COL_W,
            right: 0,
            top: (nowFrac - firstHour) * ROW_H,
            height: 2,
            background: token.colorError,
            zIndex: 4,
            pointerEvents: 'none',
            boxShadow: `0 0 4px ${token.colorError}`,
          }}
        >
          <span
            style={{
              position: 'absolute',
              left: -TIME_COL_W + 4,
              top: -10,
              background: token.colorError,
              color: '#fff',
              fontSize: 10,
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: token.borderRadiusSM,
              whiteSpace: 'nowrap',
            }}
          >
            现在
          </span>
          <span
            style={{
              position: 'absolute',
              left: -7,
              top: -6,
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: token.colorError,
              border: `2px solid ${token.colorBgContainer}`,
              boxShadow: `0 0 0 1px ${token.colorError}`,
            }}
          />
        </div>
      )}

      {/* 任务条（绝对定位，按真实时长跨行） */}
      {items.map(({ t, span }) => {
        const visStart = span.start.isBefore(dayStart) ? dayStart : span.start
        const visEnd = span.end.isAfter(dayEnd) ? dayEnd : span.end
        const top = (visStart.diff(dayStart, 'hour', true) - firstHour) * ROW_H
        const height = Math.max(visEnd.diff(visStart, 'hour', true) * ROW_H - 2, 16)
        return (
          <div
            key={t.id}
            style={{
              position: 'absolute',
              top,
              left: TIME_COL_W + 8,
              right: 12,
              height,
              zIndex: 5,
            }}
          >
            <TaskSegment
              task={t}
              span={span}
              showTime={false}
              showOwner={showOwner}
              onClick={() => onSelect?.(t)}
              style={{
                height: '100%',
                borderRadius: token.borderRadiusSM,
                boxShadow: `0 1px 4px rgba(0,0,0,0.25)`,
              }}
            />
          </div>
        )
      })}

      {/* full 模式：0 项时在 24h 网格上叠加空态（紧凑模式已在前面提前 return） */}
      {isFull && items.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: token.colorBgContainer,
            zIndex: 1,
            pointerEvents: 'none',
          }}
        >
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: token.colorTextSecondary }}>
                  {day.format('MM月DD日')} 当日无符合展示时长的任务/计划
                </div>
                <div style={{ fontSize: 12, color: token.colorTextDescription, marginTop: 4 }}>
                  更长时段见右侧跨周期标签
                </div>
              </div>
            }
          />
        </div>
      )}
    </div>
  )
}

// ====================== 周看板（按真实时长跨时段） ======================
const SEG_H = 22
const SEG_GAP = 4

interface WeekSegment {
  task: WorkspaceTask
  span: TaskSpan
  dayOffset: number // 0=weekStart(周一), ..., 6=周日
  startHour: number
  endHour: number
  slotIndex: number
}

function buildWeekSegments(tasks: WorkspaceTask[], weekStart: Dayjs): WeekSegment[] {
  // 用周一 00:00 ~ 下周一 00:00 的精确区间，避免 endOf('week') 的毫秒边界问题
  const weekEnd = weekStart.add(7, 'day')
  const raw: Omit<WeekSegment, 'slotIndex'>[] = []
  tasks.forEach((t) => {
    const span = getSpan(t)
    if (exceedsBoard(span, 'week')) return
    const clipped = intersectSpan(span, weekStart, weekEnd)
    if (!clipped) return
    let cur = clipped.start.startOf('day')
    while (cur.isBefore(clipped.end)) {
      const dayStart = cur
      const dayEnd = cur.endOf('day')
      const segStart = dayStart.isBefore(clipped.start) ? clipped.start : dayStart
      const segEnd = dayEnd.isAfter(clipped.end) ? clipped.end : dayEnd
      // 跳过零长度片段
      if (!segEnd.isAfter(segStart)) {
        cur = cur.add(1, 'day')
        continue
      }
      raw.push({
        task: t,
        span: clipped,
        dayOffset: Math.max(0, Math.min(6, segStart.diff(weekStart, 'day'))),
        startHour: dayFrac(segStart),
        endHour: dayFrac(segEnd),
      })
      cur = cur.add(1, 'day')
    }
  })
  const byDay = Array.from({ length: 7 }, () => [] as Omit<WeekSegment, 'slotIndex'>[])
  raw.forEach((r) => byDay[r.dayOffset].push(r))
  const result: WeekSegment[] = []
  byDay.forEach((list, dayOffset) => {
    const sorted = list.sort((a, b) => a.startHour - b.startHour)
    const assigned = assignSlots(sorted.map((x) => ({ ...x, start: x.startHour, end: x.endHour })))
    assigned.forEach((a) => result.push({ ...a, dayOffset, slotIndex: a.slotIndex }))
  })
  return result
}

function WeekBoard({ tasks, weekStart, onSelect, showOwner = false }: { tasks: WorkspaceTask[]; weekStart: Dayjs; onSelect?: (t: WorkspaceTask) => void; showOwner?: boolean }) {
  const days = Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day'))
  const segments = useMemo(() => buildWeekSegments(tasks, weekStart), [tasks, weekStart])
  const maxSlot = useMemo(() => segments.reduce((m, s) => Math.max(m, s.slotIndex), -1), [segments])
  const rowMinH = Math.max(64, (maxSlot + 1) * (SEG_H + SEG_GAP) + SEG_GAP + 24)

  return (
    <div style={{ border: '1px solid #d9d9d9', borderRadius: 6, overflow: 'hidden' }}>
      {/* 表头 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '64px repeat(3, 1fr)',
          background: '#fafafa',
          borderBottom: '1px solid #d9d9d9',
        }}
      >
        <div style={{ padding: '8px 6px', fontSize: 12, color: '#999' }}>周</div>
        {PERIODS.map((p) => (
          <div key={p.key} style={{ padding: '8px 6px', fontSize: 12, fontWeight: 600, borderRight: '1px solid #d9d9d9' }}>
            {p.label} <Text type="secondary" style={{ fontWeight: 400, fontSize: 11 }}>{p.range}</Text>
          </div>
        ))}
      </div>
      {days.map((day, idx) => {
        const isToday = day.isSame(dayjs(), 'day')
        const dayOffset = idx
        const daySegs = segments.filter((s) => s.dayOffset === dayOffset)
        return (
          <div
            key={day.valueOf()}
            style={{
              display: 'grid',
              gridTemplateColumns: '64px 1fr',
              borderBottom: '1px solid #e8e8e8',
              background: 'transparent',
            }}
          >
            <div style={{ padding: '8px 6px', fontSize: 12, borderRight: '1px solid #e8e8e8', background: 'transparent' }}>
              <Text style={{ fontSize: 12, display: 'block', color: isToday ? '#1677ff' : undefined }} strong={isToday}>
                周{['一', '二', '三', '四', '五', '六', '日'][idx]}
              </Text>
              <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                {day.format('MM/DD')}
              </Text>
            </div>
            <div style={{ position: 'relative', minHeight: rowMinH, overflow: 'hidden' }}>
              {/* 时段背景格与竖线 */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                }}
              >
                {PERIODS.map((p, pidx) => (
                  <div
                    key={p.key}
                    style={{
                      borderRight: pidx < 2 ? '1px solid #e8e8e8' : undefined,
                      background: 'transparent',
                    }}
                  />
                ))}
              </div>
              {/* 跨时段任务条 */}
              {daySegs.length === 0 && (
                <Text type="secondary" style={{ fontSize: 11, position: 'absolute', top: 8, left: 8 }}>
                  —
                </Text>
              )}
              {daySegs.map((seg) => {
                const left = (seg.startHour / 24) * 100
                const width = ((seg.endHour - seg.startHour) / 24) * 100
                const top = seg.slotIndex * (SEG_H + SEG_GAP) + SEG_GAP
                return (
                  <div
                    key={`${seg.task.id}-${seg.startHour.toFixed(2)}`}
                    style={{
                      position: 'absolute',
                      left: `${left}%`,
                      width: `${width}%`,
                      top,
                      height: SEG_H,
                      zIndex: 1,
                      paddingLeft: 2,
                      paddingRight: 2,
                    }}
                  >
                    <TaskSegment
                      task={seg.task}
                      span={seg.span}
                      compact
                      showTime={false}
                      showOwner={showOwner}
                      onClick={() => onSelect?.(seg.task)}
                      style={{ height: '100%' }}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ====================== 月看板（按所占日期格子统一长度，线框完整） ======================
interface MonthSegment {
  task: WorkspaceTask
  span: TaskSpan
  weekIndex: number
  startCol: number // 0-6
  endCol: number // 1-7（exclusive）
  slotIndex: number
}

function buildMonthSegments(tasks: WorkspaceTask[], monthDate: Dayjs): MonthSegment[] {
  const gridStart = monthDate.startOf('month').startOf('week')
  const gridEnd = gridStart.add(42, 'day')
  const weeks: MonthSegment[][] = Array.from({ length: 6 }, () => [])
  tasks.forEach((t) => {
    const span = getSpan(t)
    if (exceedsBoard(span, 'month')) return
    const clipped = intersectSpan(span, gridStart, gridEnd)
    if (!clipped) return
    let cur = clipped.start.startOf('week')
    while (cur.isBefore(clipped.end)) {
      const weekStart = cur
      const weekEnd = cur.add(7, 'day')
      const segStart = weekStart.isBefore(clipped.start) ? clipped.start : weekStart
      const segEnd = weekEnd.isAfter(clipped.end) ? clipped.end : weekEnd
      const weekIndex = Math.max(0, Math.min(5, segStart.diff(gridStart, 'week')))
      // 按整格计算：起始格 = 开始日期在本周的第几天，结束格 = 结束日期在本周的第几天（向上取整）
      const startCol = Math.max(0, Math.min(6, segStart.diff(weekStart, 'day')))
      const endCol = Math.max(startCol + 1, Math.min(7, Math.ceil(segEnd.diff(weekStart, 'day', true))))
      weeks[weekIndex].push({
        task: t,
        span: clipped,
        weekIndex,
        startCol,
        endCol,
        slotIndex: 0,
      })
      cur = cur.add(1, 'week')
    }
  })
  const result: MonthSegment[] = []
  weeks.forEach((list) => {
    const sorted = list.sort((a, b) => a.startCol - b.startCol)
    const assigned = assignSlots(sorted.map((x) => ({ ...x, start: x.startCol, end: x.endCol })))
    assigned.forEach((a) => result.push({ ...a, slotIndex: a.slotIndex }))
  })
  return result
}

function MonthBoard({ tasks, monthDate, onSelect, showOwner = false }: { tasks: WorkspaceTask[]; monthDate: Dayjs; onSelect?: (t: WorkspaceTask) => void; showOwner?: boolean }) {
  const gridStart = monthDate.startOf('month').startOf('week')
  const weeks = Array.from({ length: 6 }, (_, i) =>
    Array.from({ length: 7 }, (_, j) => gridStart.add(i * 7 + j, 'day')),
  )
  const segments = useMemo(() => buildMonthSegments(tasks, monthDate), [tasks, monthDate])
  const inMonth = (d: Dayjs) => d.month() === monthDate.month() && d.year() === monthDate.year()
  const dateRowH = 34

  return (
    <div style={{ border: '1px solid #d9d9d9', borderRadius: 6, overflow: 'hidden' }}>
      {/* 表头 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          background: '#fafafa',
          borderBottom: '1px solid #d9d9d9',
        }}
      >
        {['日', '一', '二', '三', '四', '五', '六'].map((w, i) => (
          <div
            key={w}
            style={{
              padding: '8px 6px',
              fontSize: 12,
              fontWeight: 600,
              textAlign: 'center',
              borderRight: i < 6 ? '1px solid #d9d9d9' : undefined,
            }}
          >
            周{w}
          </div>
        ))}
      </div>
      {weeks.map((week, weekIdx) => {
        const weekSegs = segments.filter((s) => s.weekIndex === weekIdx)
        const maxSlot = weekSegs.reduce((m, s) => Math.max(m, s.slotIndex), -1)
        // 拥挤缩放：任务条过多时统一缩小高度与字号，保持整齐
        const slotCount = Math.max(maxSlot + 1, 1)
        const scale = slotCount >= 4 ? 0.75 : slotCount >= 3 ? 0.88 : 1
        const segH = Math.max(14, Math.round(SEG_H * scale))
        const segGap = Math.max(2, Math.round(SEG_GAP * scale))
        const taskAreaH = slotCount * (segH + segGap) + segGap
        const totalH = dateRowH + taskAreaH
        return (
          <div
            key={weekIdx}
            style={{
              position: 'relative',
              height: totalH,
              borderBottom: weekIdx < 5 ? '1px solid #d9d9d9' : undefined,
            }}
          >
            {/* 完整网格竖线（日期行 + 任务区贯穿到底） */}
            {Array.from({ length: 7 }, (_, colIdx) => (
              <div
                key={`grid-${colIdx}`}
                style={{
                  position: 'absolute',
                  left: `${(colIdx / 7) * 100}%`,
                  top: 0,
                  width: `${(1 / 7) * 100}%`,
                  height: totalH,
                  borderRight: colIdx < 6 ? '1px solid #e8e8e8' : undefined,
                  boxSizing: 'border-box',
                }}
              />
            ))}
            {/* 日期格子 */}
            {week.map((day, colIdx) => {
              const dim = !inMonth(day)
              const isToday = day.isSame(dayjs(), 'day')
              return (
                <div
                  key={day.valueOf()}
                  style={{
                    position: 'absolute',
                    left: `${(colIdx / 7) * 100}%`,
                    top: 0,
                    width: `${(1 / 7) * 100}%`,
                    height: dateRowH,
                    padding: '4px 6px',
                    opacity: dim ? 0.45 : 1,
                    zIndex: 1,
                  }}
                >
                  <Text
                    style={{ fontSize: 12, display: 'block', color: isToday ? '#1677ff' : undefined }}
                    strong={isToday}
                  >
                    {day.format('D')}
                  </Text>
                </div>
              )
            })}
            {/* 跨日期任务条（按整格统一长度） */}
            {weekSegs.map((seg) => {
              const leftPct = (seg.startCol / 7) * 100
              const widthPct = ((seg.endCol - seg.startCol) / 7) * 100
              const top = dateRowH + seg.slotIndex * (segH + segGap) + segGap
              return (
                <div
                  key={`${seg.task.id}-${weekIdx}-${seg.startCol}`}
                  style={{
                    position: 'absolute',
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    top,
                    height: segH,
                    paddingLeft: 4,
                    paddingRight: 4,
                    zIndex: 1,
                  }}
                >
                  <TaskSegment
                    task={seg.task}
                    span={seg.span}
                    compact
                    showTime={false}
                    showOwner={showOwner}
                    onClick={() => onSelect?.(seg.task)}
                    style={{ height: '100%', fontSize: Math.max(10, Math.round(11 * scale)) }}
                  />
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ====================== 年看板（按所占月份格子统一长度，线框完整） ======================
interface YearSegment {
  task: WorkspaceTask
  span: TaskSpan
  rowIndex: number // 0-2 对应三行
  startCol: number // 0-3
  endCol: number // 1-4（exclusive）
  slotIndex: number
}

function buildYearSegments(tasks: WorkspaceTask[], yearDate: Dayjs): YearSegment[] {
  const yearStart = yearDate.startOf('year')
  const rows: YearSegment[][] = Array.from({ length: 3 }, () => [])
  tasks.forEach((t) => {
    const span = getSpan(t)
    if (exceedsBoard(span, 'year')) return
    const yearEnd = yearStart.endOf('year')
    const clipped = intersectSpan(span, yearStart, yearEnd)
    if (!clipped) return
    let cur = clipped.start.startOf('month')
    while (cur.isBefore(clipped.end)) {
      const rowIndex = Math.floor(cur.month() / 4)
      const rowStartMonth = rowIndex * 4
      const rowStart = yearStart.month(rowStartMonth).startOf('month')
      const rowEnd = rowStart.add(4, 'month')
      const segStart = rowStart.isBefore(clipped.start) ? clipped.start : rowStart
      const segEnd = rowEnd.isAfter(clipped.end) ? clipped.end : rowEnd
      const startCol = Math.max(0, Math.min(3, segStart.diff(rowStart, 'month')))
      const endCol = Math.max(startCol + 1, Math.min(4, Math.ceil(segEnd.diff(rowStart, 'month', true))))
      rows[rowIndex].push({
        task: t,
        span: clipped,
        rowIndex,
        startCol,
        endCol,
        slotIndex: 0,
      })
      cur = rowEnd.startOf('month')
    }
  })
  const result: YearSegment[] = []
  rows.forEach((list) => {
    const sorted = list.sort((a, b) => a.startCol - b.startCol)
    const assigned = assignSlots(sorted.map((x) => ({ ...x, start: x.startCol, end: x.endCol })))
    assigned.forEach((a) => result.push({ ...a, slotIndex: a.slotIndex }))
  })
  return result
}

function YearBoard({ tasks, yearDate, monthDate, onSelect, showOwner = false }: { tasks: WorkspaceTask[]; yearDate: Dayjs; monthDate: Dayjs; onSelect?: (t: WorkspaceTask) => void; showOwner?: boolean }) {
  const segments = useMemo(() => buildYearSegments(tasks, yearDate), [tasks, yearDate])
  const months = Array.from({ length: 12 }, (_, i) => yearDate.month(i).startOf('month'))
  const rows = Array.from({ length: 3 }, (_, i) => months.slice(i * 4, (i + 1) * 4))
  const dateRowH = 40

  return (
    <div style={{ border: '1px solid #d9d9d9', borderRadius: 6, overflow: 'hidden' }}>
      {rows.map((row, rowIdx) => {
        const rowSegs = segments.filter((s) => s.rowIndex === rowIdx)
        const maxSlot = rowSegs.reduce((m, s) => Math.max(m, s.slotIndex), -1)
        const slotCount = Math.max(maxSlot + 1, 1)
        const scale = slotCount >= 4 ? 0.75 : slotCount >= 3 ? 0.88 : 1
        const segH = Math.max(14, Math.round(SEG_H * scale))
        const segGap = Math.max(2, Math.round(SEG_GAP * scale))
        const taskAreaH = slotCount * (segH + segGap) + segGap
        const totalH = dateRowH + taskAreaH
        return (
          <div
            key={rowIdx}
            style={{
              position: 'relative',
              height: totalH,
              borderBottom: rowIdx < 2 ? '1px solid #d9d9d9' : undefined,
            }}
          >
            {/* 完整网格竖线 */}
            {Array.from({ length: 4 }, (_, colIdx) => (
              <div
                key={`grid-${colIdx}`}
                style={{
                  position: 'absolute',
                  left: `${(colIdx / 4) * 100}%`,
                  top: 0,
                  width: `${(1 / 4) * 100}%`,
                  height: totalH,
                  borderRight: colIdx < 3 ? '1px solid #e8e8e8' : undefined,
                  boxSizing: 'border-box',
                }}
              />
            ))}
            {/* 月份格子 */}
            {row.map((m, colIdx) => {
              const isThisMonth = m.month() === monthDate.month() && m.year() === monthDate.year()
              return (
                <div
                  key={m.valueOf()}
                  style={{
                    position: 'absolute',
                    left: `${(colIdx / 4) * 100}%`,
                    top: 0,
                    width: `${(1 / 4) * 100}%`,
                    height: dateRowH,
                    padding: '4px 6px',
                    zIndex: 1,
                  }}
                >
                  <Text strong style={{ fontSize: 13, color: isThisMonth ? '#1677ff' : undefined }}>
                    {m.format('M')} 月
                  </Text>
                </div>
              )
            })}
            {/* 跨月份任务条（按整格统一长度） */}
            {rowSegs.map((seg) => {
              const leftPct = (seg.startCol / 4) * 100
              const widthPct = ((seg.endCol - seg.startCol) / 4) * 100
              const top = dateRowH + seg.slotIndex * (segH + segGap) + segGap
              return (
                <div
                  key={`${seg.task.id}-${rowIdx}-${seg.startCol}`}
                  style={{
                    position: 'absolute',
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    top,
                    height: segH,
                    paddingLeft: 4,
                    paddingRight: 4,
                    zIndex: 1,
                  }}
                >
                  <TaskSegment
                    task={seg.task}
                    span={seg.span}
                    compact
                    showTime={false}
                    showOwner={showOwner}
                    onClick={() => onSelect?.(seg.task)}
                    style={{ height: '100%', fontSize: Math.max(10, Math.round(11 * scale)) }}
                  />
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ====================== 侧边：超看板时长任务（视图相关） ======================
const OVERFLOW_VIEW_META: Record<CalView, { label: string; jump: CalView }> = {
  day: { label: '跨日（>1 天）', jump: 'week' },
  week: { label: '跨周（>1 周）', jump: 'month' },
  month: { label: '跨月（>1 月）', jump: 'year' },
  year: { label: '跨年（>1 年）', jump: 'year' },
}

function OverflowPanel({
  tasks,
  view,
  onJump,
  showOwner = false,
}: {
  tasks: WorkspaceTask[]
  view: CalView
  onJump: (view: CalView, day: Dayjs) => void
  showOwner?: boolean
}) {
  const list = useMemo(() => tasks.filter((t) => exceedsBoard(getSpan(t), view)), [tasks, view])
  const meta = OVERFLOW_VIEW_META[view]

  return (
    <Card title="跨周期任务 / 计划" size="small" style={{ marginBottom: 16 }}>
      {list.length === 0 ? (
        <Empty description={`当前「${VIEW_LABELS[view]}」视图下没有超过展示时长的任务`} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <>
          <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>
            以下任务/计划超过「{VIEW_LABELS[view]}」视图展示时长（{meta.label}），不在看板内展示；点击切换至「
            {VIEW_LABELS[meta.jump]}」视图定位
          </div>
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            {list.map((t) => {
              const span = getSpan(t)
              return (
                <div
                  key={t.id}
                  onClick={() => onJump(meta.jump, span.start)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                >
                  <TaskSegment
                    task={t}
                    span={span}
                    compact
                    showTime={false}
                    showOwner={showOwner}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <span style={{ fontSize: 11, color: '#595959', flexShrink: 0 }}>
                    {span.start.format('MM-DD')}→{span.end.format('MM-DD')}
                  </span>
                </div>
              )
            })}
          </Space>
        </>
      )}
    </Card>
  )
}

// ====================== 主组件 ======================
export interface CalendarBoardProps {
  tasks: WorkspaceTask[]
  role: 'manager' | 'member'
  date: Dayjs
  setDate: (d: Dayjs) => void
  view: CalView
  setView: (v: CalView) => void
  shiftDate: (n: number) => void
  onAddPlan: (range: { start: string; end: string }) => void
  onSelectTask?: (t: WorkspaceTask) => void
}

export default function CalendarBoard({
  tasks,
  role,
  date,
  setDate,
  view,
  setView,
  shiftDate,
  onAddPlan,
  onSelectTask,
}: CalendarBoardProps) {
  const currentUser = useMe()
  const navigate = useNavigate()
  const isManager = role === 'manager'
  const [scope, setScope] = useState<'mine' | 'global'>('mine')

  /**
   * 需求：日历页展示范围
   * - 「我的日历」：仅当前用户承接 + 创建 + 参与 的任务与计划
   * - 「全局日历」（仅管理员）：所有成员的执行事项（任务 + 计划）
   * - 统一排除：已完结（done）/ 已取消（cancelled）；仅保留 task / plan
   */
  const scoped = useMemo(() => {
    const me = currentUser.id
    return tasks.filter((t) => {
      if (t.status === 'done' || t.status === 'cancelled') return false
      if (t.kind !== 'task' && t.kind !== 'plan') return false
      if (scope === 'global' && isManager) return true
      return t.assigneeId === me || t.createdBy === me || (t.participants ?? []).includes(me)
    })
  }, [tasks, scope, isManager])

  const handleSelect = (t: WorkspaceTask) => {
    // 需求 4：父级任务（或含下级）进详情页；叶子子任务进执行页
    if (onSelectTask) onSelectTask(t)
    else navigate(taskRoute(tasks, t))
  }

  const display =
    view === 'day'
      ? date.format('YYYY年MM月DD日')
      : view === 'week'
        ? `${date.startOf('week').format('MM月DD日')} - ${date.endOf('week').format('MM月DD日')}`
        : view === 'month'
          ? date.format('YYYY年MM月')
          : `${date.format('YYYY')}年`

  const stats = useMemo(() => {
    const spans = scoped.map(getSpan)
    return {
      total: scoped.length,
      overflow: spans.filter((s) => exceedsBoard(s, view)).length,
    }
  }, [scoped, view])

  return (
    <div>
      {/* 头部：导航 + 视图切换 + 范围 + 个人计划 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]} align="middle" justify="space-between" wrap>
          <Col>
            <Space wrap>
              <Button onClick={() => setDate(dayjs())}>今天</Button>
              <Button onClick={() => shiftDate(-1)}>上一{VIEW_LABELS[view]}</Button>
              <Button onClick={() => shiftDate(1)}>下一{VIEW_LABELS[view]}</Button>
              <Text strong>{display}</Text>
            </Space>
          </Col>
          <Col>
            <Space wrap>
              <Segmented
                value={view}
                onChange={(v) => setView(v as CalView)}
                options={Object.entries(VIEW_LABELS).map(([value, label]) => ({ value, label }))}
              />
              <Button
                size="small"
                icon={<PlusOutlined />}
                onClick={() =>
                  onAddPlan({
                    start: date.hour(9).minute(0).second(0).toISOString(),
                    end: date.hour(10).minute(0).second(0).toISOString(),
                  })
                }
              >
                安排个人计划
              </Button>
              <DatePicker value={date} onChange={(v) => v && setDate(v)} allowClear={false} />
            </Space>
          </Col>
        </Row>
        <Row style={{ marginTop: 8 }}>
          <Space wrap>
            <Text type="secondary" style={{ fontSize: 12 }}>
              展示范围：
            </Text>
            {isManager ? (
              <Segmented
                size="small"
                value={scope}
                onChange={(v) => setScope(v as 'mine' | 'global')}
                options={[
                  { value: 'mine', label: '我的日历' },
                  { value: 'global', label: '全局日历（所有成员）' },
                ]}
              />
            ) : (
              <Text style={{ fontSize: 12 }}>我的日历（我承接 / 创建 / 参与的任务与计划）</Text>
            )}
            <Text type="secondary" style={{ fontSize: 12 }}>
              （已排除已完成与已取消）
            </Text>
          </Space>
        </Row>
        <Row style={{ marginTop: 8 }}>
          <Space size={[12, 4]} wrap>
            <Text type="secondary" style={{ fontSize: 12 }}>
              紧急度便签：
            </Text>
            {(Object.keys(URGENCY_META) as TaskUrgency[]).map((k) => (
              <span key={k} style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center' }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 9,
                    height: 9,
                    borderRadius: 2,
                    background: URGENCY_META[k].color,
                    marginRight: 4,
                  }}
                />
                {URGENCY_META[k].label}
              </span>
            ))}
          </Space>
        </Row>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={17}>
          <Card
            title={
              <Space>
                <CalendarOutlined />
                时间日历看板 · {VIEW_LABELS[view]}视图
                <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
                  （{TASK_KIND_META.task.label}
                  <span
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      background: KIND_STYLE.task.bg,
                      borderLeft: `3px solid ${KIND_STYLE.task.border}`,
                      margin: '0 4px 0 8px',
                    }}
                  />
                  {TASK_KIND_META.plan.label}
                  <span
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      background: KIND_STYLE.plan.bg,
                      borderLeft: `3px solid ${KIND_STYLE.plan.border}`,
                      margin: '0 4px 0 8px',
                    }}
                  />
                  {TASK_KIND_META.review.label}
                  <span
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      background: KIND_STYLE.review.bg,
                      borderLeft: `3px solid ${KIND_STYLE.review.border}`,
                      margin: '0 4px 0 8px',
                    }}
                  />
                  ）
                </Text>
              </Space>
            }
          >
            {view === 'day' && <DayBoard tasks={scoped} day={date} onSelect={handleSelect} mode="full" showOwner={scope === 'global'} />}
            {view === 'week' && <WeekBoard tasks={scoped} weekStart={date.startOf('week')} onSelect={handleSelect} showOwner={scope === 'global'} />}
            {view === 'month' && <MonthBoard tasks={scoped} monthDate={date} onSelect={handleSelect} showOwner={scope === 'global'} />}
            {view === 'year' && <YearBoard tasks={scoped} yearDate={date} monthDate={date} onSelect={handleSelect} showOwner={scope === 'global'} />}
          </Card>
        </Col>
        <Col xs={24} lg={7}>
          <OverflowPanel tasks={scoped} view={view} onJump={(v, d) => { setView(v); setDate(d) }} showOwner={scope === 'global'} />
          <Card title="范围概览" size="small">
            <Row gutter={12}>
              <Col span={12}>
                <Statistic title="范围内任务" value={stats.total} />
              </Col>
              <Col span={12}>
                <Statistic title={`超「${VIEW_LABELS[view]}」时长`} value={stats.overflow} valueStyle={{ color: '#fa541c' }} />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
