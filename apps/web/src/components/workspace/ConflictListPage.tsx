/**
 * ConflictListPage.tsx —— 「时间冲突事项」页（需求 7/8/9）。
 *
 * 入口：时间容器（CalendarPage）新增的 Tab。
 *
 * - 仅同人：冲突以「同一人」名下互相重叠的任务/个人计划聚合展示（useTimeConflicts）。
 * - 角色区分：
 *   · 普通人员：仅展示本人冲突；可「调整时间」，本人个人计划直接生效、参与的任务提交调整申请待管理审核。
 *   · 管理人员：可切换查看各成员冲突，直接调整任意事项时间或删除。
 * - 每个冲突簇内的事项可点名称跳转到详情/执行页。
 */
import { useMemo, useState } from 'react'
import { Card, Empty, Select, Space, Tag, Typography, Button, Timeline, Popconfirm, Alert, message } from 'antd'
import {
  WarningOutlined,
  EditOutlined,
  DeleteOutlined,
  UserOutlined,
  ClockCircleOutlined,
  LinkOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { useTimeConflicts } from '@/hooks/useTimeConflicts'
import { taskRoute, type ConflictCluster } from '@/utils/taskTree'
import { mockMe, mockUsers } from '@/api/mock/data'
import { TASK_KIND_META, type TaskKind, type WorkspaceTask } from '@/types'
import TimeEditModal from '@/components/workspace/TimeEditModal'
import { useNotifications } from '@/hooks/useNotifications'

const { Title, Text } = Typography

export default function ConflictListPage() {
  const { tasks, setTasks, isManager, myConflicts, allMemberConflicts } = useTimeConflicts()
  const navigate = useNavigate()
  const { addNotification } = useNotifications()
  const [memberId, setMemberId] = useState<string>(mockMe.id)
  const [editTask, setEditTask] = useState<WorkspaceTask | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  /** 当前展示的冲突簇：管理按所选成员，成员只看自己 */
  const clusters = useMemo<ConflictCluster[]>(
    () => (isManager ? allMemberConflicts[memberId] ?? [] : myConflicts),
    [isManager, allMemberConflicts, memberId, myConflicts],
  )
  const totalItems = clusters.reduce((s, c) => s + c.items.length, 0)
  const ownerName = (uid: string) =>
    uid === mockMe.id ? `${mockMe.displayName}（我）` : mockUsers.find((u) => u.id === uid)?.displayName ?? uid

  const openEdit = (t: WorkspaceTask) => {
    setEditTask(t)
    setEditOpen(true)
  }

  const handleSave = (startAt: string, endAt: string) => {
    if (!editTask) return
    const now = new Date().toISOString()
    const isOwnPlan = editTask.kind === 'plan'
    if (isManager || isOwnPlan) {
      setTasks((c) =>
        c.map((t) =>
          t.id === editTask.id
            ? {
                ...t,
                startAt,
                endAt,
                dueAt: isOwnPlan ? endAt : t.dueAt ?? endAt,
                updatedAt: now,
                approvalStatus: isManager ? 'none' : t.approvalStatus,
                approvalType: isManager ? null : t.approvalType,
                pendingContent: isManager ? null : t.pendingContent,
              }
            : t,
        ),
      )
      message.success(isManager ? '时间已调整' : '个人计划时间已更新')
    } else {
      // 普通人员修改本人参与的任务：提交调整申请，管理审核后生效
      setTasks((c) =>
        c.map((t) =>
          t.id === editTask.id
            ? {
                ...t,
                approvalStatus: 'pending',
                approvalType: 'reschedule',
                pendingContent: {
                  title: t.title,
                  description: '',
                  submittedBy: mockMe.displayName,
                  submittedAt: now,
                  startAt,
                  endAt,
                },
                updatedAt: now,
              }
            : t,
        ),
      )
      message.success('已提交时间调整申请，等待管理人员审核')
      addNotification({
        eventType: 'approval_pending',
        title: `${mockMe.displayName} 申请调整「${editTask.title}」时间`,
        body: `${dayjs(startAt).format('MM-DD HH:mm')} ~ ${dayjs(endAt).format('MM-DD HH:mm')} · 请到审核中心处理`,
        scope: 'manager',
        data: { taskId: editTask.id, route: '/audit' },
        relatedUserIds: [editTask.assigneeId ?? '', editTask.createdBy].filter(Boolean),
        dedupKey: `approval_pending:${editTask.id}`,
      })
    }
    setEditOpen(false)
  }

  const handleDelete = (t: WorkspaceTask) => {
    setTasks((c) => c.filter((x) => x.id !== t.id))
    message.success('已删除该事项')
  }

  const renderItem = (t: WorkspaceTask) => {
    const isOwnPlan = t.kind === 'plan'
    const pending = t.approvalStatus === 'pending' && t.approvalType === 'reschedule'
    const kindMeta = TASK_KIND_META[t.kind as TaskKind] ?? { color: 'default', label: t.kind }
    return (
      <div style={{ paddingBottom: 4 }}>
        <Space size={8} wrap align="center">
          <LinkOutlined
            style={{ cursor: 'pointer', color: 'var(--accent-cyan)' }}
            onClick={() => navigate(taskRoute(tasks, t))}
          />
          <Text strong style={{ color: 'var(--text-primary)', cursor: 'pointer' }} onClick={() => navigate(taskRoute(tasks, t))}>
            {t.title}
          </Text>
          <Tag color={kindMeta.color} style={{ fontSize: 10 }}>{kindMeta.label}</Tag>
          {pending && <Tag color="gold" style={{ fontSize: 10 }}>调整申请待审核</Tag>}
        </Space>
        <div style={{ marginTop: 2 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            <ClockCircleOutlined /> {t.startAt && t.endAt ? `${dayjs(t.startAt).format('MM-DD HH:mm')} ~ ${dayjs(t.endAt).format('MM-DD HH:mm')}` : '无排期'}
          </Text>
        </div>
        <Space size={8} style={{ marginTop: 6 }}>
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEdit(t)}>
            {isManager ? '调整时间' : isOwnPlan ? '调整时间' : '申请调整时间'}
          </Button>
          {isManager && (
            <Popconfirm
              title="删除该事项？"
              description="删除后该冲突项将不再出现"
              okText="删除"
              okButtonProps={{ danger: true }}
              onConfirm={() => handleDelete(t)}
            >
              <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          )}
        </Space>
      </div>
    )
  }

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Space>
          <WarningOutlined style={{ color: 'var(--accent-coral)' }} />
          <Title level={5} style={{ margin: 0 }}>时间冲突事项</Title>
          <Tag color={clusters.length ? 'red' : 'green'}>{clusters.length} 个冲突簇 / {totalItems} 项</Tag>
        </Space>
        {isManager ? (
          <Space>
            <UserOutlined />
            <Text type="secondary" style={{ fontSize: 12 }}>查看成员：</Text>
            <Select
              size="small"
              style={{ width: 160 }}
              value={memberId}
              onChange={setMemberId}
              options={mockUsers.map((u) => ({ value: u.id, label: ownerName(u.id) }))}
            />
          </Space>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>仅展示你本人的时间冲突（任务与个人计划）</Text>
        )}
      </div>

      {isManager && memberId !== mockMe.id && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={`当前查看 ${ownerName(memberId)} 的时间冲突，可直接调整或删除其事项`}
        />
      )}

      {clusters.length === 0 ? (
        <Empty
          description={isManager ? `${ownerName(memberId)} 当前没有时间冲突事项` : '你当前没有时间冲突事项，排期健康'}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        clusters.map((cluster) => (
          <Card
            key={cluster.id}
            size="small"
            style={{ marginBottom: 16 }}
            title={
              <Space>
                <WarningOutlined style={{ color: 'var(--accent-coral)' }} />
                <span>冲突簇（{cluster.items.length} 项互相重叠）</span>
                {isManager && <Tag>{ownerName(cluster.ownerId)}</Tag>}
              </Space>
            }
          >
            <Timeline
              items={cluster.items.map((t) => ({
                color: 'red',
                children: renderItem(t),
              }))}
            />
          </Card>
        ))
      )}

      <TimeEditModal
        open={editOpen}
        task={editTask}
        hasPending={Boolean(editTask?.approvalStatus === 'pending' && editTask?.approvalType === 'reschedule')}
        onCancel={() => setEditOpen(false)}
        onSave={handleSave}
      />
    </div>
  )
}
