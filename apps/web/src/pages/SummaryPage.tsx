/**
 * 职责：周期总结 —— 第五批需求 3：管理 / 成员切割为两个不同版面；本批次扩展当日/年度看板
 *
 * 成员版：个人周期总结（GET /me/summaries，统计 + 草稿保存）
 * 管理版：团队周期总结（基于 useWorkspaceTasks 聚合），顶部展示团队成员完成情况与按时率
 */
import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Col, Empty, Form, Input, List, Row, Segmented, Space, Statistic, Table, Tag, Typography, message } from 'antd'
import { CheckCircleOutlined, FieldTimeOutlined, SaveOutlined, WarningOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { getErrorMessage } from '@/api/errors'
import { getSummary, saveSummary, type PeriodSummary, type SummaryPeriod } from '@/api/summaryApi'
import ErrorView from '@/components/ErrorView'
import LoadingView from '@/components/LoadingView'
import { useCurrentRole } from '@/hooks/useCurrentRole'
import { useWorkspaceTasks } from '@/hooks/useWorkspaceTasks'
import { useDirectory } from '@/hooks/useWorkspaceIdentity'
import type { WorkspaceTask } from '@/types'

const { Title, Text } = Typography

const PERIOD_OPTIONS: { value: SummaryPeriod; label: string }[] = [
  { value: 'day', label: '当日' },
  { value: 'week', label: '本周（近 7 天）' },
  { value: 'month', label: '本月（近 30 天）' },
  { value: 'year', label: '年度' },
]

/** 根据周期计算窗口（含端点） */
function periodWindow(period: SummaryPeriod) {
  const end = dayjs()
  if (period === 'day') {
    return { start: end.startOf('day'), end: end.endOf('day') }
  }
  if (period === 'week') {
    return { start: end.subtract(6, 'day').startOf('day'), end }
  }
  if (period === 'month') {
    return { start: end.subtract(29, 'day').startOf('day'), end }
  }
  // year
  return { start: end.startOf('year'), end: end.endOf('year') }
}

export default function SummaryPage() {
  const role = useCurrentRole()
  const isManager = role === 'manager'
  return isManager ? <ManagerSummary /> : <MemberSummary />
}

/** 成员版：沿用 summaryApi 拉取个人周期总结 */
function MemberSummary() {
  const queryClient = useQueryClient()
  const [period, setPeriod] = useState<SummaryPeriod>('week')
  const [form] = Form.useForm<{ content: string }>()

  const summaryQuery = useQuery({
    queryKey: ['summary', period],
    queryFn: () => getSummary(period),
    retry: false,
  })

  useEffect(() => {
    form.setFieldsValue({ content: summaryQuery.data?.draft?.content ?? '' })
  }, [summaryQuery.data, form])

  const saveMutation = useMutation({
    mutationFn: (content: string) => saveSummary({ period, content }),
    onSuccess: (saved) => {
      message.success('总结草稿已保存')
      queryClient.setQueryData<PeriodSummary>(['summary', period], (old) =>
        old ? { ...old, draft: { id: saved.id, content: saved.content, updatedAt: saved.updatedAt } } : old,
      )
    },
    onError: (e) => message.error(getErrorMessage(e)),
  })

  if (summaryQuery.isLoading) return <LoadingView tip="正在汇总数据…" height={400} />
  if (summaryQuery.isError) return <ErrorView error={summaryQuery.error} onRetry={() => summaryQuery.refetch()} />

  const summary = summaryQuery.data
  const stats = summary?.stats
  const range = summary
    ? `${dayjs(summary.window.start).format('YYYY-MM-DD')} ~ ${dayjs(summary.window.end).format('YYYY-MM-DD')}`
    : ''
  const overdueTasks = summary?.overdueTasks ?? []

  return (
    <div>
      <Title level={3} style={{ margin: 0, color: 'var(--text-primary)' }}>周期总结 · 成员视图</Title>
      <Space size={12} style={{ marginTop: 4, marginBottom: 16 }}>
        <Tag color="gold">成员版面</Tag>
        <Text type="secondary">个人周期完成情况与总结草稿（支持当日 / 本周 / 本月 / 年度）</Text>
      </Space>

      <div style={{ marginBottom: 16 }}>
        <Segmented options={PERIOD_OPTIONS} value={period} onChange={(v) => setPeriod(v as SummaryPeriod)} />
        <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>统计窗口（后端滚动周期口径）：{range}</Text>
      </div>

      <Row gutter={16}>
        <Col span={6}><Card><Statistic title="完成任务" value={stats?.completedCount ?? 0} prefix={<CheckCircleOutlined />} suffix="个" /></Card></Col>
        <Col span={6}><Card><Statistic title="按时完成" value={stats?.onTimeCount ?? 0} suffix="个" /></Card></Col>
        <Col span={6}><Card><Statistic title="延期完成" value={stats?.overdueCount ?? 0} prefix={<WarningOutlined />} suffix="个" /></Card></Col>
        <Col span={6}><Card><Statistic title="实际工时合计" value={stats?.actualHoursTotal ?? 0} prefix={<FieldTimeOutlined />} suffix="h" /></Card></Col>
      </Row>
      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic title="按时完成率" value={stats?.onTimeRate ?? 0} suffix="%" />
            <Text type="secondary" style={{ fontSize: 12 }}>{stats?.onTimeRate == null ? '暂无带截止日期的任务' : '仅统计带截止日期的任务'}</Text>
          </Card>
        </Col>
      </Row>

      <Card title="延期完成的任务" style={{ marginTop: 16 }}>
        {overdueTasks.length > 0 ? (
          <List size="small" dataSource={overdueTasks} renderItem={(item) => (
            <List.Item>
              <Space wrap>
                <Text>{item.title}</Text>
                {item.projectName && <Tag>{item.projectName}</Tag>}
                <Text type="secondary" style={{ fontSize: 12 }}>
                  截止 {item.dueAt ? dayjs(item.dueAt).format('MM-DD') : '—'} · 完成 {dayjs(item.completedAt).format('MM-DD HH:mm')}
                </Text>
              </Space>
            </List.Item>
          )} />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本周期没有延期完成的任务" />
        )}
      </Card>

      <Card title="手动编辑与保存" style={{ marginTop: 16 }}>
        <Form form={form} layout="vertical" onFinish={(values) => saveMutation.mutate(values.content ?? '')}>
          <Form.Item name="content" label="周期总结草稿" rules={[{ whitespace: true, min: 1, message: '请输入总结内容' }, { max: 20000, message: '总结不超过 20000 字符' }]}>
            <Input.TextArea rows={8} placeholder="补充/覆盖本周期总结…" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saveMutation.isPending}>保存</Button>
              {summary?.draft && <Text type="secondary">上次保存：{dayjs(summary.draft.updatedAt).format('YYYY-MM-DD HH:mm')}</Text>}
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

/** 管理版：基于 useWorkspaceTasks 聚合团队周期总结 + 成员完成情况 */
function ManagerSummary() {
  const { teamMembers, nameOf } = useDirectory()
  const [period, setPeriod] = useState<SummaryPeriod>('week')
  const [tasks] = useWorkspaceTasks()

  const win = periodWindow(period)
  const inWindow = (t: WorkspaceTask) => {
    if (t.status === 'done' && t.completedAt) return dayjs(t.completedAt).isAfter(win.start) && dayjs(t.completedAt).isBefore(win.end.add(1, 'day'))
    return false
  }

  const teamDone = tasks.filter((t) => t.kind !== 'project' && inWindow(t))
  const teamOverdue = teamDone.filter((t) => t.dueAt && dayjs(t.completedAt).isAfter(dayjs(t.dueAt)))
  const teamOnTime = teamDone.filter((t) => t.dueAt && !dayjs(t.completedAt).isAfter(dayjs(t.dueAt)))
  const onTimeRate = teamDone.filter((t) => t.dueAt).length > 0 ? Math.round((teamOnTime.length / teamDone.filter((t) => t.dueAt).length) * 100) : 0
  const totalHours = teamDone.reduce((s, t) => s + (t.actualHours ?? 0), 0)

  /** 按成员聚合 */
  const memberStats = useMemo(() => {
    const map = new Map<string, { userId: string; name: string; done: number; overdue: number; hours: number }>()
    teamDone.forEach((t) => {
      const uid = t.assigneeId ?? t.createdBy
      const user = teamMembers.find((u) => u.id === uid)
      if (!map.has(uid)) map.set(uid, { userId: uid, name: user?.displayName ?? '未指派', done: 0, overdue: 0, hours: 0 })
      const e = map.get(uid)!
      e.done += 1
      e.hours += t.actualHours ?? 0
      if (t.dueAt && dayjs(t.completedAt).isAfter(dayjs(t.dueAt))) e.overdue += 1
    })
    return Array.from(map.values()).sort((a, b) => b.done - a.done)
  }, [teamDone])

  return (
    <div>
      <Title level={3} style={{ margin: 0, color: 'var(--text-primary)' }}>周期总结 · 管理视图</Title>
      <Space size={12} style={{ marginTop: 4, marginBottom: 16 }}>
        <Tag color="blue">管理版面</Tag>
        <Text type="secondary">基于工作台数据聚合团队周期总结（支持当日 / 本周 / 本月 / 年度）</Text>
      </Space>

      <div style={{ marginBottom: 16 }}>
        <Segmented options={PERIOD_OPTIONS} value={period} onChange={(v) => setPeriod(v as SummaryPeriod)} />
        <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
          统计窗口：{win.start.format('YYYY-MM-DD')} ~ {win.end.format('YYYY-MM-DD')}
        </Text>
      </div>

      <Row gutter={16}>
        <Col span={6}><Card><Statistic title="团队完成任务" value={teamDone.length} prefix={<CheckCircleOutlined />} suffix="个" /></Card></Col>
        <Col span={6}><Card><Statistic title="按时完成" value={teamOnTime.length} suffix="个" /></Card></Col>
        <Col span={6}><Card><Statistic title="延期完成" value={teamOverdue.length} prefix={<WarningOutlined />} suffix="个" /></Card></Col>
        <Col span={6}><Card><Statistic title="实际工时合计" value={totalHours} prefix={<FieldTimeOutlined />} suffix="h" /></Card></Col>
      </Row>
      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic title="按时完成率" value={onTimeRate} suffix="%" />
            <Text type="secondary" style={{ fontSize: 12 }}>仅统计带截止日期的任务</Text>
          </Card>
        </Col>
      </Row>

      <Card title="成员完成情况" style={{ marginTop: 16 }}>
        {memberStats.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本周期团队没有完成的任务" />
        ) : (
          <Table
            rowKey="userId"
            size="small"
            dataSource={memberStats}
            pagination={false}
            columns={[
              { title: '成员', dataIndex: 'name' },
              { title: '完成数', dataIndex: 'done', width: 100 },
              { title: '延期', dataIndex: 'overdue', width: 100, render: (v) => v > 0 ? <Tag color="red">{v}</Tag> : <Tag>{v}</Tag> },
              { title: '实际工时 (h)', dataIndex: 'hours', width: 120 },
              { title: '按时率', width: 120, render: (_, r) => {
                const withDue = teamDone.filter((t) => (t.assigneeId ?? t.createdBy) === r.userId && t.dueAt).length
                const onTime = teamDone.filter((t) => (t.assigneeId ?? t.createdBy) === r.userId && t.dueAt && !dayjs(t.completedAt).isAfter(dayjs(t.dueAt))).length
                return withDue > 0 ? `${Math.round((onTime / withDue) * 100)}%` : '—'
              } },
            ]}
          />
        )}
      </Card>

      <Card title="团队延期任务" style={{ marginTop: 16 }}>
        {teamOverdue.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本周期团队没有延期完成的任务" />
        ) : (
          <List size="small" dataSource={teamOverdue} renderItem={(t) => (
            <List.Item>
              <Space wrap>
                <Text>{t.title}</Text>
                <Tag color="cyan">{nameOf((t.assigneeId ?? t.createdBy)) ?? '未指派'}</Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  截止 {t.dueAt ? dayjs(t.dueAt).format('MM-DD') : '—'} · 完成 {dayjs(t.completedAt).format('MM-DD HH:mm')}
                </Text>
              </Space>
            </List.Item>
          )} />
        )}
      </Card>
    </div>
  )
}