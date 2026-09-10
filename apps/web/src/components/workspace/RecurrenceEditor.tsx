/**
 * RecurrenceEditor.tsx —— 重复设置编辑器（不重复 / 定期 / 循环）
 *
 * 用在：发布/提报任务弹窗、安排个人计划弹窗。
 * 团队协作项目模式不渲染本组件（由父组件控制）。
 * 通过 value/onChange 受控；startDate 由父组件在提交时按排期起点填入。
 *
 * 稳定性设计（修复「结束日期」崩溃）：
 * - 内部状态（含 endMode=无限/次数/日期）是编辑过程中的真实来源。
 * - 仅当「外部传入的 value」与「本组件上次 emit 出去的规则」不一致时（即真正的外部变更：
 *   打开编辑回填 / 程序重置），才把 value 同步回内部状态；自己 emit 的回声会被判等跳过，
 *   因此用户选择的「日期」结束方式不会被强制改回「无限」，也不会因 onChange→value→同步
 *   的回声造成无限重渲染。
 */
import { useEffect, useRef, useState } from 'react'
import { DatePicker, InputNumber, Radio, Select, Space, TimePicker, Typography } from 'antd'
import dayjs from 'dayjs'
import type { RecurrenceRule } from '@/types'

const { Text } = Typography

type Mode = 'none' | 'scheduled' | 'cyclic'
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const FREQ_OPTS = [
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'yearly', label: '每年' },
]
const UNIT_OPTS = [
  { value: 'minute', label: '分钟' },
  { value: 'hour', label: '小时' },
  { value: 'day', label: '天' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
  { value: 'year', label: '年' },
]

interface Props {
  value: RecurrenceRule | null
  onChange: (rule: RecurrenceRule | null) => void
}

/**
 * 判等：除 startDate 外（startDate 由父组件提交时覆盖）其余字段一致即视为同一规则。
 * startDate 不纳入比较，可避免「每次 emit 生成新 startDate」造成的回声误判。
 */
function sameRule(a: RecurrenceRule | null, b: RecurrenceRule | null): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  if (a.kind !== b.kind) return false
  const wA = JSON.stringify(a.weekdays ?? null)
  const wB = JSON.stringify(b.weekdays ?? null)
  return (
    a.freq === b.freq &&
    a.interval === b.interval &&
    wA === wB &&
    a.monthDay === b.monthDay &&
    a.time === b.time &&
    a.anchor === b.anchor &&
    a.everyValue === b.everyValue &&
    a.everyUnit === b.everyUnit &&
    a.endDate === b.endDate &&
    a.count === b.count
  )
}

export default function RecurrenceEditor({ value, onChange }: Props) {
  const [mode, setMode] = useState<Mode>(value ? value.kind : 'none')
  const [freq, setFreq] = useState<RecurrenceRule['freq']>('weekly')
  const [interval, setInterval] = useState(1)
  const [weekdays, setWeekdays] = useState<number[]>([1])
  const [monthDay, setMonthDay] = useState(1)
  const [time, setTime] = useState('09:00')
  const [anchor, setAnchor] = useState<'completion' | 'date'>('completion')
  const [everyValue, setEveryValue] = useState(3)
  const [everyUnit, setEveryUnit] = useState<RecurrenceRule['everyUnit']>('day')
  const [endMode, setEndMode] = useState<'infinite' | 'count' | 'date'>(
    value?.endDate ? 'date' : value?.count != null ? 'count' : 'infinite',
  )
  const [count, setCount] = useState(10)
  const [endDate, setEndDate] = useState<string | null>(value?.endDate ?? null)

  // 记录本组件「上次 emit 出去的规则」；用于区分外部变更与自身回声
  const lastEmittedRef = useRef<RecurrenceRule | null>(value)

  // 仅当外部 value 与「上次 emit 的结果」不一致（真正的外部变更）时才同步内部状态
  useEffect(() => {
    if (sameRule(value, lastEmittedRef.current)) return
    lastEmittedRef.current = value
    if (!value) {
      setMode('none')
      return
    }
    setMode(value.kind)
    if (value.kind === 'scheduled') {
      setFreq(value.freq ?? 'weekly')
      setInterval(value.interval ?? 1)
      setWeekdays(value.weekdays ?? [1])
      setMonthDay(value.monthDay ?? 1)
      setTime(value.time && /^\d{1,2}:\d{1,2}$/.test(value.time) ? value.time : '09:00')
    } else {
      setAnchor(value.anchor ?? 'completion')
      setEveryValue(value.everyValue ?? 3)
      setEveryUnit(value.everyUnit ?? 'day')
    }
    if (value.endDate) {
      setEndMode('date')
      setEndDate(value.endDate)
    } else if (value.count != null) {
      setEndMode('count')
      setCount(value.count)
    } else {
      setEndMode('infinite')
      setEndDate(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const emit = () => {
    if (mode === 'none') {
      if (!sameRule(null, lastEmittedRef.current)) {
        lastEmittedRef.current = null
        onChange(null)
      }
      return
    }
    const startDate = value?.startDate ?? new Date().toISOString()
    const rule: RecurrenceRule =
      mode === 'scheduled'
        ? {
            kind: 'scheduled',
            freq,
            interval,
            weekdays: freq === 'weekly' ? weekdays : undefined,
            monthDay: freq === 'monthly' ? monthDay : undefined,
            time,
            startDate,
            endDate: endMode === 'date' && endDate ? endDate : null,
            count: endMode === 'count' ? count : null,
          }
        : {
            kind: 'cyclic',
            anchor,
            everyValue,
            everyUnit,
            startDate,
            endDate: endMode === 'date' && endDate ? endDate : null,
            count: endMode === 'count' ? count : null,
          }
    if (sameRule(rule, lastEmittedRef.current)) return
    lastEmittedRef.current = rule
    onChange(rule)
  }

  // 任意字段变化即重算并上报；规则无变化（如回声）时跳过 onChange，避免回环
  useEffect(() => {
    emit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, freq, interval, weekdays, monthDay, time, anchor, everyValue, everyUnit, endMode, count, endDate])

  return (
    <div style={{ padding: 12, borderRadius: 8, background: 'transparent', border: '1px solid var(--color-border-tertiary, #2a3447)' }}>
      <Space direction="vertical" style={{ width: '100%' }} size={10}>
        <Radio.Group
          value={mode}
          optionType="button"
          buttonStyle="solid"
          onChange={(e) => setMode(e.target.value)}
          options={[
            { value: 'none', label: '不重复' },
            { value: 'scheduled', label: '定期' },
            { value: 'cyclic', label: '循环' },
          ]}
        />

        {mode === 'scheduled' && (
          <>
            <Space wrap size={10} align="center">
              <Text style={{ fontSize: 12 }}>频率</Text>
              <Select value={freq} onChange={setFreq} style={{ width: 110 }} options={FREQ_OPTS} />
              <Text style={{ fontSize: 12 }}>每</Text>
              <InputNumber min={1} max={99} value={interval} onChange={(v) => setInterval(v ?? 1)} style={{ width: 70 }} />
              <Text style={{ fontSize: 12 }}>个周期</Text>
              <TimePicker value={dayjs(time, 'HH:mm')} format="HH:mm" onChange={(v) => v && setTime(v.format('HH:mm'))} style={{ width: 110 }} />
            </Space>
            {freq === 'weekly' && (
              <Select
                mode="multiple"
                placeholder="选择星期几"
                style={{ width: '100%' }}
                value={weekdays}
                onChange={setWeekdays}
                options={WEEKDAYS.map((w, i) => ({ value: i, label: w }))}
              />
            )}
            {freq === 'monthly' && (
              <Space size={8} align="center">
                <Text style={{ fontSize: 12 }}>每月第</Text>
                <InputNumber min={1} max={31} value={monthDay} onChange={(v) => setMonthDay(v ?? 1)} style={{ width: 80 }} />
                <Text style={{ fontSize: 12 }}>天</Text>
              </Space>
            )}
          </>
        )}

        {mode === 'cyclic' && (
          <Space wrap size={10} align="center">
            <Radio.Group
              value={anchor}
              optionType="button"
              buttonStyle="solid"
              onChange={(e) => setAnchor(e.target.value)}
              options={[
                { value: 'completion', label: '按完成顺延' },
                { value: 'date', label: '固定间隔' },
              ]}
            />
            <Text style={{ fontSize: 12 }}>每</Text>
            <InputNumber min={1} max={9999} value={everyValue} onChange={(v) => setEveryValue(v ?? 1)} style={{ width: 90 }} />
            <Select value={everyUnit} onChange={setEveryUnit} style={{ width: 90 }} options={UNIT_OPTS} />
          </Space>
        )}

        {mode !== 'none' && (
          <Space wrap size={10} align="center">
            <Text style={{ fontSize: 12 }}>结束</Text>
            <Radio.Group
              value={endMode}
              optionType="button"
              buttonStyle="solid"
              onChange={(e) => setEndMode(e.target.value)}
              options={[
                { value: 'infinite', label: '无限' },
                { value: 'count', label: '次数' },
                { value: 'date', label: '日期' },
              ]}
            />
            {endMode === 'count' && (
              <InputNumber min={2} max={999} value={count} onChange={(v) => setCount(v ?? 10)} style={{ width: 80 }} />
            )}
            {endMode === 'date' && (
              <DatePicker
                value={endDate ? dayjs(endDate) : null}
                onChange={(v) => setEndDate(v ? v.toISOString() : null)}
                style={{ width: 150 }}
              />
            )}
          </Space>
        )}
      </Space>
    </div>
  )
}
