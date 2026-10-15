/**
 * OverlapPanel —— 重叠检测面板（B19）
 * 3 个子 Tab：时间冲突 / 资源争抢 / 依赖交汇
 * 纯前端组件，数据由父组件传入
 */
import { useState } from 'react'
import { Tabs, Table, Tag, Typography, Collapse, Badge } from 'antd'
import type { OverlapResult, OverlapSeverity } from '@/types'

const { Text } = Typography

const severityColor: Record<OverlapSeverity, string> = {
  low: 'default',
  medium: 'orange',
  high: 'red',
}

const severityText: Record<OverlapSeverity, string> = {
  low: '低',
  medium: '中',
  high: '高',
}

interface OverlapPanelProps {
  data: OverlapResult | undefined
  loading?: boolean
}

export default function OverlapPanel({ data, loading }: OverlapPanelProps) {
  const [activeKey, setActiveKey] = useState<'time' | 'resource' | 'dependency'>('time')

  if (!data) return null

  const timeColumns = [
    {
      title: '成员',
      dataIndex: 'assigneeName',
      key: 'assigneeName',
      width: 100,
    },
    {
      title: '严重度',
      dataIndex: 'severity',
      key: 'severity',
      width: 80,
      render: (s: OverlapSeverity) => <Tag color={severityColor[s]}>{severityText[s]}</Tag>,
    },
    {
      title: '重叠天数',
      dataIndex: 'overlapDays',
      key: 'overlapDays',
      width: 80,
    },
    {
      title: '重叠区间',
      key: 'range',
      width: 180,
      render: (_: any, record: any) => (
        <Text style={{ fontSize: 12 }}>{record.overlapStart} ~ {record.overlapEnd}</Text>
      ),
    },
    {
      title: '冲突任务',
      key: 'tasks',
      render: (_: any, record: any) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {record.taskTitles.map((title: string, i: number) => (
            <Tag key={i} color="blue">{title}</Tag>
          ))}
        </div>
      ),
    },
  ]

  const resourceColumns = [
    {
      title: '成员',
      dataIndex: 'assigneeName',
      key: 'assigneeName',
      width: 100,
    },
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 110,
    },
    {
      title: '严重度',
      dataIndex: 'severity',
      key: 'severity',
      width: 80,
      render: (s: OverlapSeverity) => <Tag color={severityColor[s]}>{severityText[s]}</Tag>,
    },
    {
      title: '总工时(h)',
      dataIndex: 'totalHours',
      key: 'totalHours',
      width: 90,
      render: (h: number, r: any) => (
        <span>
          <strong>{h}</strong>
          <Text type="secondary" style={{ fontSize: 11 }}> / {r.threshold}</Text>
        </span>
      ),
    },
    {
      title: '任务数',
      dataIndex: 'taskCount',
      key: 'taskCount',
      width: 70,
    },
  ]

  const depItems = data.dimensions.dependency.map(hub => ({
    key: hub.hubTaskId,
    label: (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{hub.hubTaskTitle}</span>
        <Badge count={`${hub.downstreamCount} 下游`} color="blue" size="small" />
        {hub.isOnCriticalPath && <Tag color="red">关键路径</Tag>}
        <Text type="secondary" style={{ fontSize: 11 }}>收益分：{hub.benefitScore}</Text>
      </div>
    ),
    children: (
      <div style={{ paddingLeft: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          完成此任务可解锁 {hub.downstreamCount} 个下游任务，优先完成收益最大。
        </Text>
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {hub.downstreamTasks.map((t, i) => (
            <Tag key={i}>{t.title}</Tag>
          ))}
        </div>
      </div>
    ),
  }))

  return (
    <div>
      {/* 总览条 */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <StatItem label="时间冲突" value={data.summary.timeConflicts} color="#cf1322" />
        <StatItem label="资源争抢" value={data.summary.resourceConflicts} color="#faad14" />
        <StatItem label="依赖交汇" value={data.summary.dependencyHubs} color="#1677ff" />
        <StatItem label="受影响任务" value={data.summary.totalAffectedTasks} color="#722ed1" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <Text type="secondary">综合严重度：</Text>
          <Tag color={severityColor[data.summary.severity]} style={{ fontSize: 14, padding: '2px 12px' }}>
            {severityText[data.summary.severity]}
          </Tag>
        </div>
      </div>

      <Tabs
        activeKey={activeKey}
        onChange={k => setActiveKey(k as any)}
        items={[
          {
            key: 'time',
            label: `时间冲突 (${data.summary.timeConflicts})`,
            children: (
              <Table
                size="small"
                dataSource={data.dimensions.time}
                columns={timeColumns}
                rowKey="assigneeId"
                pagination={{ pageSize: 10, size: 'small' }}
                loading={loading}
              />
            ),
          },
          {
            key: 'resource',
            label: `资源争抢 (${data.summary.resourceConflicts})`,
            children: (
              <Table
                size="small"
                dataSource={data.dimensions.resource}
                columns={resourceColumns}
                rowKey={(r) => `${r.assigneeId}-${r.date}`}
                pagination={{ pageSize: 10, size: 'small' }}
                loading={loading}
              />
            ),
          },
          {
            key: 'dependency',
            label: `依赖交汇 (${data.summary.dependencyHubs})`,
            children: (
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
                  以下为被多个下游共享的前置任务（<code>is_shared=true</code>）。
                  优先完成这些任务可同时推进多条支线，是"重叠优先"策略的核心。
                </Text>
                <Collapse items={depItems} defaultActiveKey={depItems[0]?.key} />
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}

function StatItem({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
      <Text strong style={{ fontSize: 20, color }}>{value}</Text>
    </div>
  )
}
