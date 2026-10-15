/**
 * MergeTaskModal.tsx —— 任务合并弹窗
 *
 * 覆盖需求 9：管理人员可随时把任务并入其他任务作为子任务，
 * 该任务下的子任务一并转移，成为目标任务的孙子任务（原有层级关系不变）。
 */
import { useEffect, useMemo, useState } from 'react'
import { Alert, List, Modal, Select, Space, Tag, Typography } from 'antd'
import type { WorkspaceTask } from '@/types'
import { TASK_PRIORITY_META } from '@/types'
import { findDescendantIds, isDescendant } from '@/utils/taskTree'

const { Text } = Typography

interface Props {
  open: boolean
  /** 被合并的源任务 */
  sourceTask: WorkspaceTask | null
  tasks: WorkspaceTask[]
  onCancel: () => void
  onSubmit: (targetId: string) => void
}

export default function MergeTaskModal({ open, sourceTask, tasks, onCancel, onSubmit }: Props) {
  const [targetId, setTargetId] = useState<string | null>(null)

  useEffect(() => {
    if (open) setTargetId(null)
  }, [open])

  // 候选目标：排除源任务自身、其子孙（避免成环）、已取消任务、评审任务
  const candidates = useMemo(() => {
    if (!sourceTask) return []
    return tasks.filter((t) => {
      if (t.id === sourceTask.id) return false
      if (t.status === 'cancelled') return false
      if (t.kind === 'review') return false
      if (isDescendant(tasks, sourceTask.id, t.id)) return false
      return true
    })
  }, [tasks, sourceTask])

  // 将被一并转移的子孙任务
  const movingIds = useMemo(() => {
    if (!sourceTask) return []
    return findDescendantIds(tasks, sourceTask.id)
  }, [tasks, sourceTask])

  const movingTasks = tasks.filter((t) => movingIds.includes(t.id))

  const handleOk = () => {
    if (!targetId) return
    onSubmit(targetId)
  }

  return (
    <Modal
      title="合并任务"
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okText="确认合并"
      cancelText="取消"
      okButtonProps={{ disabled: !targetId }}
      destroyOnHidden
    >
      {sourceTask && (
        <>
          <Alert
            type="info"
            showIcon
            message={
              <Space wrap>
                <Text>将任务</Text>
                <Text strong>{sourceTask.title}</Text>
                <Text>并入目标任务，作为其子任务</Text>
              </Space>
            }
            style={{ marginBottom: 16 }}
          />
          <div style={{ marginBottom: 8 }}>
            <Text strong>选择目标任务</Text>
          </div>
          <Select
            style={{ width: '100%', marginBottom: 16 }}
            placeholder="请选择要并入的任务"
            value={targetId}
            onChange={setTargetId}
            showSearch
            optionFilterProp="label"
            options={candidates.map((t) => ({
              value: t.id,
              label: t.title,
              priority: t.priority,
            }))}
            optionRender={(opt) => (
              <Space>
                <span>{opt.data.label}</span>
                <Tag color={TASK_PRIORITY_META[opt.data.priority as keyof typeof TASK_PRIORITY_META].color}>
                  {TASK_PRIORITY_META[opt.data.priority as keyof typeof TASK_PRIORITY_META].label}
                </Tag>
              </Space>
            )}
          />

          <div style={{ marginBottom: 8 }}>
            <Text strong>将一并转移的子任务（{movingTasks.length} 项）</Text>
          </div>
          {movingTasks.length === 0 ? (
            <Text type="secondary">该任务没有子任务，合并后仅自身成为子任务。</Text>
          ) : (
            <List
              size="small"
              bordered
              dataSource={movingTasks}
              renderItem={(t) => (
                <List.Item>
                  <Space>
                    <Text>{t.title}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {t.parentId === sourceTask.id ? '直接子任务' : '后代任务'}
                    </Text>
                  </Space>
                </List.Item>
              )}
            />
          )}
          <div style={{ marginTop: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              合并后原有的父子关系保持不变：源任务成为目标任务的子任务，其原有子任务自动成为目标任务的孙子任务。
            </Text>
          </div>
        </>
      )}
    </Modal>
  )
}
