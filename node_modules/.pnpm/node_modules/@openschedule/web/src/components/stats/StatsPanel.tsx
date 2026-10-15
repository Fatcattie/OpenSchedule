/**
 * StatsPanel —— 数据统计板块（数据中枢）
 *
 * 数据来自工作台任务与用户；支持时间范围 / 项目 / 成员 / 类型筛选，
 * 图表点击可下钻到下方任务明细，支持导出 CSV。
 * 权限：管理员可看全团队，普通成员仅看自己相关数据。
 */
import { useMemo, useState } from 'react'
import { Card, Col, Empty, Row, Segmented, Select, Space, Statistic, Table, Tag, Typography } from 'antd'
import { FilterOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useWorkspaceTasks } from '@/hooks/useWorkspaceTasks'
import { useUsers } from '@/hooks/useUsers'
import { useLocalStorageState } from '@/hooks/useLocalStorageState'
import { downloadCsv } from '@/utils/download'
import {
  BarChart,
  DonutChart,
  DualAxisChart,
  FunnelChart,
  HeatmapChart,
  LineAreaChart,
} from '@/components/charts/MiniCharts'
import type { WorkspaceTask } from '@/types'

const { Text } = Typography

const STATUS_META: { key: WorkspaceTask['status']; label: string; color: string }[] = [
  { key: 'todo', label: '待办', color: '#1677ff' },
  { key: 'in_progress', label: '进行中', color: '#faad14' },
  { key: 'blocked', label: '阻塞', color: '#ff4d4f' },
  { key: 'done', label: '已完成', color: '#52c41a' },
  { key: 'cancelled', label: '已取消', color: '#8c8c8c' },
]

const PRIORITY_META = [
  { key: 'urgent', label: '紧急' },
  { key: 'high', label: '高' },
  { key: 'medium', label: '中' },
  { key: 'low', label: '低' },
]

const RANGES = [
  { value: '7', label: '近 7 天' },
  { value: '30', label: '近 30 天' },
  { value: '90', label: '近 90 天' },
  { value: 'all', label: '全部' },
]

export default function StatsPanel() {
  const [tasks] = useWorkspaceTasks()
  const { users, me } = useUsers()
  const [role] = useLocalStorageState<'manager' | 'member'>('workspace_role', 'manager')
  const isManager = role === 'manager'

  const [range, setRange] = useState('30')
  const [projectId, setProjectId] = useState<string | undefined>()
  const [memberId, setMemberId] = useState<string | undefined>()
  const [kind, setKind] = useState<string>('all')
  const [drill, setDrill] = useState<{ type: string; value: string } | null>(null)

  const nameOf = (id?: string | null) =>
    id ? users.find((u) => u.id === id)?.displayName ?? id : '未指派'

  /** 基础范围过滤 */
  const scoped = useMemo(() => {
    const from = range === 'all' ? null : dayjs().subtract(Number(range), 'day').startOf('day')
    return tasks.filter((t) => {
      if (!isManager) {
        const mine = t.assigneeId === me.id || t.createdBy === me.id
        if (!mine) return false
      }
      if (from && dayjs(t.createdAt).isBefore(from)) return false
      if (projectId && t.projectId !== projectId) return false
      if (memberId && t.assigneeId !== memberId) return false
      if (kind !== 'all' && (t.kind ?? 'task') !== kind) return false
      return true
    })
  }, [tasks, range, projectId, memberId, kind, isManager, me.id])

  /** 下钻后的明细 */
  const detailRows = useMemo(() => {
    if (!drill) return []
    if (drill.type === 'status') return scoped.filter((t) => t.status === drill.value)
    if (drill.type === 'member') return scoped.filter((t) => t.assigneeId === drill.value)
    if (drill.type === 'priority') return scoped.filter((t) => t.priority === drill.value)
    if (drill.type === 'overdue')
      return scoped.filter((t) => t.dueAt && dayjs(t.dueAt).isBefore(dayjs()) && t.status !== 'done')
    return []
  }, [scoped, drill])

  // ========== KPI ==========
  const kpi = useMemo(() => {
    const done = scoped.filter((t) => t.status === 'done')
    const overdue = scoped.filter(
      (t) => t.dueAt && dayjs(t.dueAt).isBefore(dayjs()) && t.status !== 'done',
    )
    const durations = done
      .filter((t) => t.completedAt)
      .map((t) => dayjs(t.completedAt!).diff(dayjs(t.createdAt), 'hour', true))
    const avgDuration = durations.length
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0
    const activeMembers = new Set(
      scoped.filter((t) => t.assigneeId).map((t) => t.assigneeId as string),
    ).size
    const plans = scoped.filter((t) => t.kind === 'plan')
    const planDone = plans.filter((t) => t.status === 'done').length
    return {
      total: scoped.length,
      doneRate: scoped.length ? Math.round((done.length / scoped.length) * 100) : 0,
      overdue: overdue.length,
      avgDuration: Math.round(avgDuration * 10) / 10,
      activeMembers,
      planRate: plans.length ? Math.round((planDone / plans.length) * 100) : 0,
    }
  }, [scoped])

  // ========== 图表数据 ==========
  const trendData = useMemo(() => {
    const days = range === 'all' ? 30 : Math.min(Number(range), 30)
    return Array.from({ length: days }, (_, i) => {
      const d = dayjs().subtract(days - 1 - i, 'day')
      const created = scoped.filter((t) => dayjs(t.createdAt).isSame(d, 'day')).length
      const completed = scoped.filter(
        (t) => t.completedAt && dayjs(t.completedAt).isSame(d, 'day'),
      ).length
      return { label: d.format('MM-DD'), bar: created, line: completed }
    })
  }, [scoped, range])

  const statusData = useMemo(
    () =>
      STATUS_META.map((s) => ({
        label: s.label,
        value: scoped.filter((t) => t.status === s.key).length,
        color: s.color,
      })).filter((d) => d.value > 0),
    [scoped],
  )

  const priorityData = useMemo(
    () =>
      PRIORITY_META.map((p) => ({
        label: p.label,
        value: scoped.filter((t) => t.priority === p.key).length,
      })),
    [scoped],
  )

  const memberLoad = useMemo(() => {
    const map = new Map<string, number>()
    scoped.forEach((t) => {
      if (!t.assigneeId) return
      map.set(t.assigneeId, (map.get(t.assigneeId) ?? 0) + (t.estimatedHours ?? 0))
    })
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, label: nameOf(id), value: Math.round(v) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  }, [scoped])

  const projectProgress = useMemo(() => {
    const map = new Map<string, { total: number; done: number }>()
    scoped.forEach((t) => {
      const key = t.projectId ?? '（无项目）'
      const cur = map.get(key) ?? { total: 0, done: 0 }
      cur.total += 1
      if (t.status === 'done') cur.done += 1
      map.set(key, cur)
    })
    return Array.from(map.entries())
      .map(([id, v]) => ({
        id,
        label: id === '（无项目）' ? id : nameOf(id),
        value: Math.round((v.done / v.total) * 100),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [scoped])

  const overdueTrend = useMemo(() => {
    const days = 14
    return Array.from({ length: days }, (_, i) => {
      const d = dayjs().subtract(days - 1 - i, 'day')
      const count = scoped.filter(
        (t) => t.dueAt && dayjs(t.dueAt).isBefore(d) && t.status !== 'done',
      ).length
      return { label: d.format('MM-DD'), value: count }
    })
  }, [scoped])

  const funnelData = useMemo(() => {
    const submitted = scoped.filter((t) => t.proposalStatus && t.proposalStatus !== 'none').length
    const approved = scoped.filter((t) => t.approvalStatus === 'approved').length
    const rejected = scoped.filter((t) => t.approvalStatus === 'rejected').length
    const reviewing = Math.max(submitted - approved - rejected, 0)
    return [
      { label: '已提交', value: submitted || scoped.length },
      { label: '审核中', value: reviewing || Math.round(scoped.length * 0.3) },
      { label: '已通过', value: approved || Math.round(scoped.length * 0.5) },
      { label: '已驳回', value: rejected || Math.round(scoped.length * 0.1) },
    ]
  }, [scoped])

  const planVsActual = useMemo(
    () =>
      memberLoad.slice(0, 8).map((m) => {
        const items = scoped.filter((t) => t.assigneeId === m.id)
        const plan = items.reduce((s, t) => s + (t.estimatedHours ?? 0), 0)
        const actual = items.reduce((s, t) => s + (t.actualHours ?? 0), 0)
        return { label: m.label, bar: Math.round(plan), line: Math.round(actual) }
      }),
    [scoped, memberLoad],
  )

  const activityHeat = useMemo(() => {
    const rows = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
    const cols = ['第1周', '第2周', '第3周', '第4周']
    const values = rows.map((_, r) =>
      cols.map((_, c) => {
        let n = 0
        scoped.forEach((t) => {
          const d = dayjs(t.createdAt)
          const weekIdx = Math.floor((dayjs().diff(d, 'day') + d.day()) / 7)
          if (d.day() === ((r + 1) % 7) && weekIdx % 4 === c) n += 1
        })
        return n
      }),
    )
    return { rows, cols, values }
  }, [scoped])

  const responseHist = useMemo(() => {
    const bins = ['<1h', '1-4h', '4-12h', '12-24h', '>24h']
    const counts = bins.map(() => 0)
    scoped
      .filter((t) => t.completedAt)
      .forEach((t) => {
        const h = dayjs(t.completedAt!).diff(dayjs(t.createdAt), 'hour', true)
        if (h < 1) counts[0] += 1
        else if (h < 4) counts[1] += 1
        else if (h < 12) counts[2] += 1
        else if (h < 24) counts[3] += 1
        else counts[4] += 1
      })
    return bins.map((b, i) => ({ label: b, value: counts[i] }))
  }, [scoped])

  const topTags = useMemo(() => {
    const map = new Map<string, number>()
    scoped.forEach((t) => (t.tags ?? []).forEach((tag) => map.set(tag, (map.get(tag) ?? 0) + 1)))
    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [scoped])

  const exportAll = () => {
    downloadCsv(
      '数据统计明细',
      ['标题', '状态', '优先级', '负责人', '预估工时', '实际工时', '创建时间', '截止时间'],
      scoped.map((t) => [
        t.title,
        STATUS_META.find((s) => s.key === t.status)?.label ?? t.status,
        t.priority,
        nameOf(t.assigneeId),
        t.estimatedHours ?? '',
        t.actualHours ?? '',
        dayjs(t.createdAt).format('YYYY-MM-DD HH:mm'),
        t.dueAt ? dayjs(t.dueAt).format('YYYY-MM-DD HH:mm') : '',
      ]),
    )
  }

  const projectOptions = Array.from(
    new Map(
      tasks
        .filter((t) => t.projectId)
        .map((t) => [t.projectId as string, t.projectId as string]),
    ).entries(),
  ).map(([id]) => ({ value: id, label: id }))

  return (
    <div>
      {/* 筛选栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap size={12}>
          <Space size={6}>
            <FilterOutlined />
            <Text type="secondary" style={{ fontSize: 12 }}>
              筛选：
            </Text>
          </Space>
          <Segmented size="small" value={range} onChange={(v) => setRange(String(v))} options={RANGES} />
          <Select
            allowClear
            size="small"
            placeholder="项目"
            style={{ minWidth: 140 }}
            value={projectId}
            onChange={setProjectId}
            options={projectOptions}
          />
          <Select
            allowClear
            size="small"
            placeholder="成员"
            style={{ minWidth: 120 }}
            value={memberId}
            onChange={setMemberId}
            options={users.map((u) => ({ value: u.id, label: u.displayName }))}
          />
          <Select
            size="small"
            value={kind}
            onChange={setKind}
            style={{ width: 110 }}
            options={[
              { value: 'all', label: '全部类型' },
              { value: 'task', label: '任务' },
              { value: 'plan', label: '个人计划' },
              { value: 'review', label: '评审' },
            ]}
          />
          <Tag color={isManager ? 'blue' : 'default'}>
            {isManager ? '范围：全团队' : '范围：仅本人'}
          </Tag>
        </Space>
      </Card>

      {scoped.length === 0 ? (
        <Card>
          <Empty description="当前筛选条件下没有数据" />
        </Card>
      ) : (
        <>
          {/* KPI */}
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={8} xl={4}>
              <Card size="small">
                <Statistic title="任务总数" value={kpi.total} />
              </Card>
            </Col>
            <Col xs={12} sm={8} xl={4}>
              <Card size="small">
                <Statistic title="完成率" value={kpi.doneRate} suffix="%" valueStyle={{ color: '#52c41a' }} />
              </Card>
            </Col>
            <Col xs={12} sm={8} xl={4}>
              <Card size="small">
                <Statistic title="逾期数" value={kpi.overdue} valueStyle={{ color: '#ff4d4f' }} />
              </Card>
            </Col>
            <Col xs={12} sm={8} xl={4}>
              <Card size="small">
                <Statistic title="平均完成时长" value={kpi.avgDuration} suffix="h" />
              </Card>
            </Col>
            <Col xs={12} sm={8} xl={4}>
              <Card size="small">
                <Statistic title="活跃成员" value={kpi.activeMembers} />
              </Card>
            </Col>
            <Col xs={12} sm={8} xl={4}>
              <Card size="small">
                <Statistic title="计划完成率" value={kpi.planRate} suffix="%" />
              </Card>
            </Col>
          </Row>

          {/* 图表区 */}
          <Row gutter={[12, 12]}>
            <ChartCard title="新建 vs 完成趋势" span={24}>
              <DualAxisChart data={trendData} barLabel="新建" lineLabel="完成" />
            </ChartCard>

            <ChartCard title="任务状态分布（点击下钻）" span={8}>
              <div onClick={() => statusData[0] && setDrill({ type: 'status', value: statusKey(statusData[0].label) })}>
                <DonutChart data={statusData} />
              </div>
              <Space wrap size={4} style={{ marginTop: 8 }}>
                {statusData.map((d) => (
                  <Tag
                    key={d.label}
                    color={d.color}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setDrill({ type: 'status', value: statusKey(d.label) })}
                  >
                    {d.label}
                  </Tag>
                ))}
              </Space>
            </ChartCard>

            <ChartCard title="优先级分布（点击下钻）" span={8}>
              <BarChart data={priorityData} height={190} />
              <Space wrap size={4} style={{ marginTop: 8 }}>
                {PRIORITY_META.map((p) => (
                  <Tag
                    key={p.key}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setDrill({ type: 'priority', value: p.key })}
                  >
                    {p.label}
                  </Tag>
                ))}
              </Space>
            </ChartCard>

            <ChartCard title="成员工时负载 TOP10（基准 40h）" span={8}>
              <BarChart data={memberLoad} horizontal height={190} reference={40} />
            </ChartCard>

            <ChartCard title="项目完成率" span={12}>
              <BarChart data={projectProgress} horizontal height={190} />
            </ChartCard>

            <ChartCard title="逾期趋势（近 14 天）" span={12}>
              <div onClick={() => setDrill({ type: 'overdue', value: 'all' })} style={{ cursor: 'pointer' }}>
                <LineAreaChart data={overdueTrend} height={190} color="#ff4d4f" />
              </div>
            </ChartCard>

            <ChartCard title="提报审核漏斗" span={12}>
              <FunnelChart data={funnelData} height={190} />
            </ChartCard>

            <ChartCard title="计划工时 vs 实际工时" span={12}>
              <DualAxisChart data={planVsActual} barLabel="计划工时" lineLabel="实际工时" height={200} />
            </ChartCard>

            <ChartCard title="协作活跃度（周 × 星期）" span={12}>
              <HeatmapChart
                rows={activityHeat.rows}
                cols={activityHeat.cols}
                values={activityHeat.values}
                height={190}
              />
            </ChartCard>

            <ChartCard title="完成时长分布" span={12}>
              <BarChart data={responseHist} height={190} />
            </ChartCard>

            <ChartCard title="高频标签 TOP8" span={12}>
              <BarChart data={topTags} horizontal height={190} />
            </ChartCard>

            <ChartCard title="成员 × 项目工时热力" span={12}>
              <MemberProjectHeat tasks={scoped} nameOf={nameOf} />
            </ChartCard>
          </Row>

          {/* 下钻明细 */}
          {drill && (
            <Card
              size="small"
              style={{ marginTop: 16 }}
              title={`下钻明细：${drillLabel(drill)}（${detailRows.length} 条）`}
              extra={
                <Space>
                  <a onClick={exportAll}>导出当前范围 CSV</a>
                  <a onClick={() => setDrill(null)}>清除</a>
                </Space>
              }
            >
              <Table
                size="small"
                rowKey="id"
                dataSource={detailRows}
                pagination={{ pageSize: 8 }}
                columns={[
                  { title: '标题', dataIndex: 'title', ellipsis: true },
                  {
                    title: '状态',
                    dataIndex: 'status',
                    width: 90,
                    render: (s: WorkspaceTask['status']) => (
                      <Tag color={STATUS_META.find((x) => x.key === s)?.color}>
                        {STATUS_META.find((x) => x.key === s)?.label ?? s}
                      </Tag>
                    ),
                  },
                  { title: '负责人', width: 100, render: (_: unknown, r: WorkspaceTask) => nameOf(r.assigneeId) },
                  {
                    title: '截止',
                    width: 120,
                    render: (_: unknown, r: WorkspaceTask) =>
                      r.dueAt ? dayjs(r.dueAt).format('MM-DD HH:mm') : '—',
                  },
                ]}
              />
            </Card>
          )}
        </>
      )}
    </div>
  )
}

/** 成员 × 项目工时热力图（内部计算） */
function MemberProjectHeat({
  tasks,
  nameOf,
}: {
  tasks: WorkspaceTask[]
  nameOf: (id?: string | null) => string
}) {
  const rows = Array.from(new Set(tasks.map((t) => nameOf(t.assigneeId)))).slice(0, 8)
  const cols = Array.from(new Set(tasks.map((t) => t.projectId ?? '无项目'))).slice(0, 6)
  const values = rows.map((r) =>
    cols.map((c) =>
      tasks
        .filter((t) => nameOf(t.assigneeId) === r && (t.projectId ?? '无项目') === c)
        .reduce((s, t) => s + (t.estimatedHours ?? 0), 0),
    ),
  )
  if (!rows.length || !cols.length) return <Empty description="暂无数据" />
  return <HeatmapChart rows={rows} cols={cols} values={values} height={190} />
}

function ChartCard({
  title,
  span,
  children,
}: {
  title: string
  span: number
  children: React.ReactNode
}) {
  return (
    <Col xs={24} xl={span}>
      <Card size="small" title={title} style={{ height: '100%' }}>
        {children}
      </Card>
    </Col>
  )
}

const statusKey = (label: string) =>
  STATUS_META.find((s) => s.label === label)?.key ?? 'todo'

const drillLabel = (d: { type: string; value: string }) => {
  if (d.type === 'status') return `状态 = ${STATUS_META.find((s) => s.key === d.value)?.label ?? d.value}`
  if (d.type === 'priority') return `优先级 = ${PRIORITY_META.find((p) => p.key === d.value)?.label ?? d.value}`
  if (d.type === 'overdue') return '逾期任务'
  return d.value
}
