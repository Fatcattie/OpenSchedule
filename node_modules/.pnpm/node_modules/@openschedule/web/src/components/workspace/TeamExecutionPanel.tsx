/**
 * TeamExecutionPanel —— 团队任务执行情况数据面板（仅管理可见）
 *
 * 展示：状态分布堆叠条、近 7 日完成趋势、成员完成排行。
 */
import { Card, Row, Col, Statistic, theme } from 'antd'
import {
  BarChart,
  LineAreaChart,
  StackedBarChart,
  type StackedDatum,
  type Datum,
} from '@/components/charts/MiniCharts'
import { useDirectory } from '@/hooks/useWorkspaceIdentity'
import type { WorkspaceTask } from '@/types'
import dayjs from 'dayjs'

const STATUS_ORDER = [
  { key: 'todo', label: '待开始', color: '#8c8c8c' },
  { key: 'in_progress', label: '进行中', color: '#1677ff' },
  { key: 'blocked', label: '阻塞', color: '#ff4d4f' },
  { key: 'done', label: '已完成', color: '#52c41a' },
]

export default function TeamExecutionPanel({ tasks }: { tasks: WorkspaceTask[] }) {
  const { teamMembers } = useDirectory()
  const { token } = theme.useToken()
  const relevant = tasks.filter(
    (t) => t.kind !== 'plan' && t.kind !== 'project' && t.status !== 'cancelled',
  )

  const statusSegments = STATUS_ORDER.map((s) => ({
    key: s.label,
    value: relevant.filter((t) => t.status === s.key).length,
    color: s.color,
  })).filter((s) => s.value > 0)

  const total = relevant.length
  const done = relevant.filter((t) => t.status === 'done').length
  const inProgress = relevant.filter((t) => t.status === 'in_progress').length
  const blocked = relevant.filter((t) => t.status === 'blocked').length
  const overdue = relevant.filter(
    (t) => t.status !== 'done' && t.dueAt && dayjs(t.dueAt).isBefore(dayjs(), 'day'),
  ).length

  const last7 = Array.from({ length: 7 }, (_, i) => dayjs().subtract(6 - i, 'day'))
  const trendData: Datum[] = last7.map((d) => {
    const label = d.format('MM-DD')
    const value = relevant.filter(
      (t) => t.status === 'done' && t.completedAt && dayjs(t.completedAt).format('MM-DD') === label,
    ).length
    return { label, value }
  })

  const memberData: Datum[] = teamMembers
    .map((u) => ({
      label: u.displayName,
      value: relevant.filter((t) => t.status === 'done' && t.assigneeId === u.id).length,
    }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)

  const stackedData: StackedDatum[] =
    statusSegments.length > 0 ? [{ label: '团队任务', segments: statusSegments }] : []

  return (
    <Card title="团队任务执行情况" style={{ marginTop: 16 }}>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Statistic title="总任务" value={total} valueStyle={{ color: token.colorText, fontFamily: 'var(--font-mono)' }} />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic title="已完成" value={done} valueStyle={{ color: token.colorSuccess, fontFamily: 'var(--font-mono)' }} />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic title="进行中" value={inProgress} valueStyle={{ color: token.colorPrimary, fontFamily: 'var(--font-mono)' }} />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic title="阻塞 / 逾期" value={`${blocked} / ${overdue}`} valueStyle={{ color: token.colorError, fontFamily: 'var(--font-mono)' }} />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card size="small" title="状态分布">
            {stackedData.length > 0 ? (
              <StackedBarChart data={stackedData} height={120} />
            ) : (
              <div style={{ color: token.colorTextDescription, fontSize: 13, padding: '20px 0', textAlign: 'center' }}>暂无数据</div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card size="small" title="近 7 日完成趋势">
            {trendData.some((d) => d.value > 0) ? (
              <LineAreaChart data={trendData} height={160} color={token.colorSuccess} />
            ) : (
              <div style={{ color: token.colorTextDescription, fontSize: 13, padding: '20px 0', textAlign: 'center' }}>近 7 日无完成任务</div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card size="small" title="成员完成排行">
            {memberData.length > 0 ? (
              <BarChart data={memberData} horizontal height={160} color={token.colorPrimary} />
            ) : (
              <div style={{ color: token.colorTextDescription, fontSize: 13, padding: '20px 0', textAlign: 'center' }}>暂无成员完成数据</div>
            )}
          </Card>
        </Col>
      </Row>
    </Card>
  )
}
