/**
 * SopFlowTree.tsx —— 任务流程（SOP）树形图
 *
 * 覆盖需求 4：任务执行页右侧展示任务流程（树形图），承接人可随时修改；
 * 需求 5：继承展示（标记来源父任务）；需求 2：支持 AI 辅助生成新流程。
 *
 * 编辑语义：编辑继承来的流程时直接修改持有该流程的祖先任务（需求 5：
 * 子任务变动，父级任务展示的也随之更改），由调用方通过 onChange 提供写入回调。
 */
import { useRef, useState } from 'react'
import { Button, Empty, Form, Input, Modal, Space, Tag, Tooltip, Typography, message } from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ApartmentOutlined,
  RobotOutlined,
  PlusSquareOutlined,
} from '@ant-design/icons'
import type { SopNode } from '@/types'
import { newSopNodeId } from '@/types'

const { Text } = Typography

interface Props {
  /** 顶层步骤（森林）；null 表示尚无流程 */
  steps: SopNode[] | null
  /** 流程来源：manual/ai/inherited（展示标签） */
  source?: 'manual' | 'ai' | 'inherited'
  /** 继承来源任务名（sop 挂在祖先上时传入） */
  inheritedFrom?: string | null
  /** 是否可编辑 */
  editable?: boolean
  /** 步骤变更回调（整棵树替换） */
  onChange?: (steps: SopNode[]) => void
  /** AI 重新生成回调 */
  onAiGenerate?: () => void
  aiLoading?: boolean
  /** 第四批需求 3：在节点上点击「生成子任务」时回调，传入该节点 */
  onGenerateTask?: (n: SopNode) => void
}

/** 递归渲染节点行 */
function NodeRow({
  node,
  depth,
  editable,
  onEdit,
  onAddChild,
  onDelete,
  onGenerateTask,
}: {
  node: SopNode
  depth: number
  editable: boolean
  onEdit: (n: SopNode) => void
  onAddChild: (parent: SopNode) => void
  onDelete: (n: SopNode) => void
  onGenerateTask?: (n: SopNode) => void
}) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          padding: '5px 0 5px 0',
          marginLeft: depth * 20,
          position: 'relative',
        }}
      >
        {/* 树形连线 */}
        <span
          style={{
            flexShrink: 0,
            width: 8,
            height: 8,
            borderRadius: depth === 0 ? 4 : 2,
            background: depth === 0 ? 'var(--accent-cyan, #1677ff)' : 'var(--border-strong, #bfbfbf)',
            marginTop: 6,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 13, fontWeight: depth === 0 ? 600 : 400 }}>{node.title}</Text>
          {node.note && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>{node.note}</Text>
            </div>
          )}
        </div>
        {editable && (
          <Space size={0} style={{ flexShrink: 0 }}>
            <Tooltip title="编辑">
              <Button type="text" size="small" icon={<EditOutlined />} onClick={() => onEdit(node)} />
            </Tooltip>
            <Tooltip title="添加子步骤">
              <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => onAddChild(node)} />
            </Tooltip>
            {onGenerateTask && (
              <Tooltip title="基于此节点生成子任务">
                <Button type="text" size="small" icon={<PlusSquareOutlined />} onClick={() => onGenerateTask(node)} />
              </Tooltip>
            )}
            <Tooltip title="删除">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(node)} />
            </Tooltip>
          </Space>
        )}
      </div>
      {(node.children ?? []).map((c) => (
        <NodeRow
          key={c.id}
          node={c}
          depth={depth + 1}
          editable={editable}
          onEdit={onEdit}
          onAddChild={onAddChild}
          onDelete={onDelete}
          onGenerateTask={onGenerateTask}
        />
      ))}
    </div>
  )
}

/** 在树中查找并替换节点（immutable） */
function mapTree(nodes: SopNode[], id: string, fn: (n: SopNode) => SopNode): SopNode[] {
  return nodes.map((n) => {
    if (n.id === id) return fn(n)
    return { ...n, children: mapTree(n.children ?? [], id, fn) }
  })
}

function removeNode(nodes: SopNode[], id: string): SopNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => ({ ...n, children: removeNode(n.children ?? [], id) }))
}

function findNode(nodes: SopNode[], id: string): SopNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    const hit = findNode(n.children ?? [], id)
    if (hit) return hit
  }
  return null
}

export default function SopFlowTree({
  steps,
  source,
  inheritedFrom,
  editable = false,
  onChange,
  onAiGenerate,
  aiLoading = false,
  onGenerateTask,
}: Props) {
  const [editOpen, setEditOpen] = useState(false)
  const [addChildParent, setAddChildParent] = useState<SopNode | null>(null)
  /** 当前编辑目标节点 id（null 表示新增子步骤模式） */
  const editTargetRef = useRef<string | null>(null)
  const [form] = Form.useForm<{ title: string; note?: string }>()

  const commit = (next: SopNode[]) => onChange?.(next)

  const openEdit = (n: SopNode) => {
    form.setFieldsValue({ title: n.title, note: n.note ?? '' })
    setAddChildParent(null)
    editTargetRef.current = n.id
    setEditOpen(true)
  }

  const openAddChild = (parent: SopNode) => {
    form.resetFields()
    setAddChildParent(parent)
    editTargetRef.current = null
    setEditOpen(true)
  }

  const handleOk = async () => {
    const values = await form.validateFields()
    if (!steps) return
    if (addChildParent) {
      const child: SopNode = { id: newSopNodeId(), title: values.title, note: values.note || undefined, children: [] }
      commit(mapTree(steps, addChildParent.id, (n) => ({ ...n, children: [...(n.children ?? []), child] })))
      message.success('子步骤已添加')
    } else if (editTargetRef.current && findNode(steps, editTargetRef.current)) {
      commit(mapTree(steps, editTargetRef.current, (n) => ({ ...n, title: values.title, note: values.note || undefined })))
      message.success('步骤已更新')
    }
    setEditOpen(false)
  }

  const handleDelete = (n: SopNode) => {
    if (!steps) return
    commit(removeNode(steps, n.id))
    message.success('步骤已删除')
  }

  const addTopLevel = () => {
    const title = window.prompt('新步骤标题')
    if (!title || !title.trim()) return
    commit([...(steps ?? []), { id: newSopNodeId(), title: title.trim(), children: [] }])
  }

  if ((!steps || steps.length === 0) && !editable) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary">暂无 SOP 流程</Text>} />
  }

  return (
    <div>
      <Space size={6} wrap style={{ marginBottom: 8 }}>
        {source === 'ai' && <Tag color="purple">AI 生成</Tag>}
        {inheritedFrom && (
          <Tag color="blue">继承自「{inheritedFrom}」</Tag>
        )}
        {steps && steps.length > 0 && <Tag>{steps.length} 个顶层步骤</Tag>}
        {editable && (
          <>
            <Button size="small" icon={<PlusOutlined />} onClick={addTopLevel}>添加步骤</Button>
            {onAiGenerate && (
              <Button size="small" icon={<RobotOutlined />} loading={aiLoading} onClick={onAiGenerate}>
                AI 生成新流程
              </Button>
            )}
          </>
        )}
      </Space>
      {(!steps || steps.length === 0) ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary">暂无流程，可手动添加或由 AI 生成</Text>} />
      ) : (
        <div style={{ borderLeft: editable ? undefined : '2px solid var(--border-subtle, #f0f0f0)', paddingLeft: 10 }}>
          {steps.map((n) => (
            <NodeRow
              key={n.id}
              node={n}
              depth={0}
              editable={editable}
              onEdit={openEdit}
              onAddChild={openAddChild}
              onDelete={handleDelete}
              onGenerateTask={onGenerateTask}
            />
          ))}
        </div>
      )}
      {editable && (
        <>
          <div style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <ApartmentOutlined /> {inheritedFrom
                ? '该流程继承自父级任务，修改会同步到父级与所有兄弟子任务'
                : '修改流程会实时同步到任务看板'}
            </Text>
          </div>
          <Form form={form} layout="vertical">
            <Modal
              title={addChildParent ? `添加子步骤（${addChildParent.title}）` : '编辑步骤'}
              open={editOpen}
              onOk={handleOk}
              onCancel={() => setEditOpen(false)}
              okText="保存"
              cancelText="取消"
              destroyOnHidden
            >
              <Form.Item name="title" label="步骤标题" rules={[{ required: true, message: '请输入步骤标题' }]}>
                <Input placeholder="例如：完成接口联调" />
              </Form.Item>
              <Form.Item name="note" label="补充说明（可选）">
                <Input.TextArea rows={2} placeholder="验收标准、注意事项等" />
              </Form.Item>
            </Modal>
          </Form>
        </>
      )}
    </div>
  )
}
