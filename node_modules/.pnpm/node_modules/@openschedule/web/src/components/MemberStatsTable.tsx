/**
 * 职责：项目成员工时统计表格 —— 完成率/准时率/负载/实际工时（可排序），契约 §B17.2
 */
import { Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { MemberStat } from '@/types'

const { Text } = Typography

const pct = (n: number) => `${Math.round(n * 100)}%`
const hours = (n: number) => (Math.round(n * 10) / 10).toFixed(1)

/** 比率着色：≥80% 绿 / ≥50% 蓝 / 其余红 */
function RateTag({ value }: { value: number }) {
  const color = value >= 0.8 ? 'green' : value >= 0.5 ? 'blue' : 'red'
  return <Tag color={color}>{pct(value)}</Tag>
}

/** 负载着色：0-1 绿 / 2-3 蓝 / 4-5 橙 / >5 红 */
function LoadTag({ value }: { value: number }) {
  const color = value <= 1 ? 'green' : value <= 3 ? 'blue' : value <= 5 ? 'orange' : 'red'
  return <Tag color={color}>{value}</Tag>
}

const columns: ColumnsType<MemberStat> = [
  { title: '成员', dataIndex: 'displayName', width: 120, fixed: 'left' },
  { title: '完成数', dataIndex: 'completedCount', width: 90, sorter: (a, b) => a.completedCount - b.completedCount },
  {
    title: '完成率',
    dataIndex: 'completionRate',
    width: 110,
    sorter: (a, b) => a.completionRate - b.completionRate,
    render: (v: number) => <RateTag value={v} />,
  },
  {
    title: '准时率',
    dataIndex: 'onTimeRate',
    width: 110,
    sorter: (a, b) => a.onTimeRate - b.onTimeRate,
    render: (v: number) => <RateTag value={v} />,
  },
  {
    title: '负载',
    dataIndex: 'activeLoad',
    width: 90,
    sorter: (a, b) => a.activeLoad - b.activeLoad,
    render: (v: number) => <LoadTag value={v} />,
  },
  {
    title: '实际工时',
    dataIndex: 'totalActualHours',
    width: 110,
    sorter: (a, b) => a.totalActualHours - b.totalActualHours,
    render: (v: number) => <Text>{hours(v)} h</Text>,
  },
  {
    title: '预估工时',
    dataIndex: 'totalEstimatedHours',
    width: 110,
    sorter: (a, b) => a.totalEstimatedHours - b.totalEstimatedHours,
    render: (v: number) => <Text type="secondary">{hours(v)} h</Text>,
  },
  {
    title: '平均工时/任务',
    dataIndex: 'avgActualHoursPerTask',
    width: 130,
    sorter: (a, b) => a.avgActualHoursPerTask - b.avgActualHoursPerTask,
    render: (v: number) => <Text type="secondary">{hours(v)} h</Text>,
  },
]

export default function MemberStatsTable({ members }: { members: MemberStat[] }) {
  return (
    <Table<MemberStat>
      rowKey="userId"
      size="middle"
      dataSource={members}
      columns={columns}
      pagination={false}
      scroll={{ x: 880 }}
    />
  )
}
