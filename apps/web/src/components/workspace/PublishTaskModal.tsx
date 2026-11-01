/**
 * PublishTaskModal.tsx —— 发布 / 编辑任务弹窗
 *
 * 覆盖需求：
 * - 需求 1：AI 拆解内嵌进发布任务流程，由用户自主选择是否使用
 * - 需求 2：支持【团队协作任务】与【独立任务】两种模式，独立任务不支持 AI 拆解
 * - 需求 5：可开启「需要评审」，成员完成提报后自动生成评审子任务
 * - 需求 6：编辑模式下（未承接任务）仍可再次使用 AI 拆解
 */
import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  DatePicker,
  Divider,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Radio,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { DeleteOutlined, RobotOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { useMutation } from '@tanstack/react-query'
import dayjs, { type Dayjs } from 'dayjs'
import { useAiRules } from '@/hooks/useAiRules'
import { decomposeWithRules, generateSopFlow, toSopFlow, type DecomposeResult } from '@/utils/aiRules'
import { useDirectory, useMe } from '@/hooks/useWorkspaceIdentity'
import type { DecomposeTask, Importance, RecurrenceRule, SopFlow, TaskMode, TaskPriority, UrgencyDegree, WorkspaceTask } from '@/types'
import { IMPORTANCE_META, INDUSTRY_OPTIONS, TASK_KIND_META, TASK_PRIORITY_META, TASK_TYPE_OPTIONS, URGENCY_DEGREE_META, sopFlowFromLines, sopFlowToLines } from '@/types'
import { detectPersonTimeConflict } from '@/utils/taskTree'
import RecurrenceEditor from '@/components/workspace/RecurrenceEditor'
import ImageUpload from '@/components/workspace/ImageUpload'

const { Text } = Typography
const { RangePicker } = DatePicker

export interface PublishTaskPayload {
  title: string
  description: string
  priority: TaskPriority
  /** 重要程度：重要/不重要（需求：关联日历看板便签） */
  importance: Importance
  /** 紧急程度：紧急/不紧急（需求：关联日历看板便签） */
  urgencyDegree: UrgencyDegree
  taskMode: TaskMode
  needReview: boolean
  assigneeId: string | null
  /** 推荐承接人：留空则直接指派；填入则由管理审核后生效（需求 1） */
  recommendAssigneeId?: string | null
  startAt: string | null
  endAt: string | null
  subtasks: DecomposeTask[]
  /** 行业类型，决定拆解套用哪套经验模板 */
  industry: string
  /** 任务类型，决定拆解套用哪套经验模板 */
  taskType: string
  /** SOP 流程（团队协作任务必填；个人计划/独立任务可空） */
  sop: SopFlow | null
  /** 重复规则（定期/循环）；团队协作项目模式不出现 */
  recurrence?: RecurrenceRule | null
  /** 说明图片（base64） */
  images?: string[]
  /** 时间冲突对象（创建/提报时若与同人其他事项重叠则附上，供审核参考） */
  conflicts?: { id: string; title: string; startAt: string | null; endAt: string | null }[]
}

interface Props {
  open: boolean
  /** 传入则为编辑模式（需求 6：仅未承接任务可编辑） */
  editTask?: WorkspaceTask | null
  /** 从「SOP 与经验」看板选择应用时预填的流程 */
  initialSop?: SopFlow | null
  /** 当前用户角色：管理用「发布」，普通成员用「提报」 */
  role?: 'manager' | 'member'
  /** full = 允许项目模式；task-only = 仅任务模式（如项目详情页新增任务） */
  allowedModes?: 'full' | 'task-only'
  /** 全量任务，用于「仅同人」时间冲突检测（需求 6） */
  tasks: WorkspaceTask[]
  onCancel: () => void
  onSubmit: (payload: PublishTaskPayload) => void
}

export default function PublishTaskModal({ open, editTask, initialSop, role = 'manager', allowedModes = 'full', tasks, onCancel, onSubmit }: Props) {
  const currentUser = useMe()
  const { teamMembers } = useDirectory()
  const [form] = Form.useForm()
  const { rules } = useAiRules()
  const [taskMode, setTaskMode] = useState<TaskMode>('team')
  const [enableAI, setEnableAI] = useState(false)
  const [industry, setIndustry] = useState<string>('互联网/软件')
  const [taskType, setTaskType] = useState<string>('前端开发')
  const [assignMode, setAssignMode] = useState<'direct' | 'recommend'>(role === 'member' ? 'recommend' : 'direct')
  const [result, setResult] = useState<DecomposeResult | null>(null)
  /** SOP 生成来源标签（manual / ai） */
  const [sopSource, setSopSource] = useState<'manual' | 'ai'>('manual')
  /** 重复规则（定期/循环）；团队协作项目模式不出现 */
  const [recurrence, setRecurrence] = useState<RecurrenceRule | null>(null)
  /** 说明图片 */
  const [images, setImages] = useState<string[]>([])
  /** 需求 6：创建/提报时与时间冲突的同人事项（仅同人检测） */
  const [conflicts, setConflicts] = useState<WorkspaceTask[]>([])
  const range = Form.useWatch('range', form) as [Dayjs, Dayjs] | null | undefined
  const watchAssigneeId = Form.useWatch('assigneeId', form) as string | undefined
  const watchRecommendId = Form.useWatch('recommendAssigneeId', form) as string | undefined

  /** 需求 2：SOP 辅助生成 —— 提示词在「AI 规则」页的 sop 场景规则中自配 */
  const sopMutation = useMutation({
    mutationFn: async () => {
      const values = form.getFieldsValue()
      return generateSopFlow(
        {
          title: values.title || '未命名任务',
          description: values.description ?? '',
          industry,
          taskType,
        },
        rules,
      )
    },
    onSuccess: (res) => {
      const flow = toSopFlow(res.steps, res.source === 'agent' ? 'ai' : 'manual')
      form.setFieldValue('sopText', sopFlowToLines(flow).join('\n'))
      setSopSource('ai')
      message.success(res.source === 'agent' ? 'AI 已生成 SOP 流程，可继续手工调整' : '已按经验规则生成 SOP 流程，可在「AI 规则」页配置模板')
    },
    onError: () => message.error('SOP 生成失败，请稍后重试'),
  })

  /** 需求 1：拆解走规则引擎，按行业 × 任务类型匹配经验模板；配了 Agent 就调模型 */
  const decomposeMutation = useMutation({
    mutationFn: (req: { goalTitle: string; goalDescription?: string; totalEstimatedHours?: number; startDate?: string; industry: string; taskType: string }) =>
      decomposeWithRules(req, rules),
    onSuccess: (data) => {
      setResult(data)
      message.success(
        data.source === 'agent'
          ? `Agent 已生成 ${data.tasks.length} 个子任务`
          : `已按「${data.rule?.name ?? '默认规则'}」生成 ${data.tasks.length} 个子任务`,
      )
    },
    onError: () => message.error('生成拆解建议失败，请稍后重试'),
  })

  // 打开时按编辑对象回填；新建时重置（含 SOP 应用预填）
  useEffect(() => {
    if (!open) return
    if (editTask) {
      setTaskMode(editTask.taskMode)
      setEnableAI(false)
      setResult(null)
      setSopSource(editTask.sop?.source === 'ai' ? 'ai' : 'manual')
      setAssignMode(editTask.recommendedAssigneeId ? 'recommend' : 'direct')
      setRecurrence(editTask.recurrence ?? null)
      setImages(editTask.images ?? [])
      // 从历史标签里恢复行业/任务类型，没有则用默认值
      const restoredIndustry = editTask.tags.find((t) => INDUSTRY_OPTIONS.includes(t as (typeof INDUSTRY_OPTIONS)[number]))
      const restoredType = editTask.tags.find((t) => TASK_TYPE_OPTIONS.includes(t as (typeof TASK_TYPE_OPTIONS)[number]))
      setIndustry(restoredIndustry ?? '互联网/软件')
      setTaskType(restoredType ?? '前端开发')
      form.setFieldsValue({
        title: editTask.title,
        description: editTask.description ?? '',
        priority: editTask.priority,
        importance: editTask.importance ?? 'important',
        urgencyDegree: editTask.urgencyDegree ?? 'notUrgent',
        taskMode: editTask.taskMode,
        needReview: editTask.needReview,
        assigneeId: editTask.assigneeId,
        range: editTask.startAt && editTask.endAt ? [dayjs(editTask.startAt), dayjs(editTask.endAt)] : null,
        sopText: editTask.sop ? sopFlowToLines(editTask.sop).join('\n') : '',
      })
    } else {
      setTaskMode('team')
      setEnableAI(false)
      setResult(null)
      setAssignMode(role === 'member' ? 'recommend' : 'direct')
      setRecurrence(null)
      setImages([])
      setIndustry('互联网/软件')
      setTaskType('前端开发')
      setSopSource(initialSop ? 'manual' : 'manual')
      form.resetFields()
      form.setFieldsValue({
        priority: 'high',
        taskMode: 'team',
        needReview: false,
        importance: 'important',
        urgencyDegree: 'notUrgent',
        // 需求 6：从「SOP 与经验」跳转应用时预填流程
        sopText: initialSop ? sopFlowToLines(initialSop).join('\n') : '',
      })
    }
  }, [open, editTask, initialSop, form, role])

  // 需求 6：创建/提报时「仅同人」时间冲突检测，列表附在提报/发布 payload 供审核参考
  useEffect(() => {
    if (!range?.[0] || !range?.[1]) {
      setConflicts([])
      return
    }
    const targetId =
      taskMode === 'individual'
        ? currentUser.id
        : assignMode === 'recommend'
          ? watchRecommendId || currentUser.id
          : watchAssigneeId || currentUser.id
    const hit = detectPersonTimeConflict(
      { start: range[0].toISOString(), end: range[1].toISOString() },
      tasks,
      targetId,
      editTask?.id,
    )
    setConflicts(hit)
  }, [range, tasks, taskMode, assignMode, watchAssigneeId, watchRecommendId, editTask])

  const handleGenerate = () => {
    const goalTitle = form.getFieldValue('aiGoal') || form.getFieldValue('title')
    if (!goalTitle) {
      message.warning('请先填写任务标题或拆解目标')
      return
    }
    const range = form.getFieldValue('range') as [Dayjs, Dayjs] | null
    decomposeMutation.mutate({
      goalTitle,
      goalDescription: form.getFieldValue('description') ?? '',
      totalEstimatedHours: form.getFieldValue('totalEstimatedHours') ?? 40,
      startDate: range?.[0]?.format('YYYY-MM-DD') ?? dayjs().format('YYYY-MM-DD'),
      industry,
      taskType,
    })
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    const range = values.range as [Dayjs, Dayjs] | null
    const recommendAssigneeId =
      values.taskMode === 'individual'
        ? null
        : assignMode === 'recommend'
          ? (values.recommendAssigneeId ?? null)
          : null
    if (values.taskMode === 'team' && assignMode === 'recommend' && !recommendAssigneeId) {
      message.warning(role === 'member' ? '请选择推荐承接人' : '请选择推荐承接人，或切换到「直接指派」')
      return
    }
    const isProject = values.taskMode === 'project'
    // 需求 1/4：团队协作任务与团队协作项目均须填写 SOP 流程；项目用 SOP 作为任务生成蓝图
    const sopLines = String(values.sopText ?? '').split('\n').map((s: string) => s.trim()).filter(Boolean)
    if ((values.taskMode === 'team' || isProject) && sopLines.length === 0) {
      message.warning(`${isProject ? '团队协作项目' : '团队协作任务'}必须填写 SOP 流程（可手工填写或点击「AI 生成」）`)
      return
    }
    onSubmit({
      title: values.title,
      description: values.description ?? '',
      priority: values.priority,
      importance: values.importance ?? 'important',
      urgencyDegree: values.urgencyDegree ?? 'notUrgent',
      taskMode: values.taskMode,
      needReview: values.taskMode === 'team' ? Boolean(values.needReview) : false,
      assigneeId: values.taskMode === 'individual' ? null : assignMode === 'direct' ? (values.assigneeId ?? null) : null,
      recommendAssigneeId,
      startAt: range?.[0]?.toISOString() ?? null,
      endAt: range?.[1]?.toISOString() ?? null,
      // 项目模式不使用 AI 拆解子任务，子任务由 SOP 在审核通过后生成
      subtasks: !isProject && enableAI && result ? result.tasks : [],
      industry,
      taskType,
      sop: sopLines.length > 0 ? sopFlowFromLines(String(values.sopText ?? '').split('\n'), sopSource) : null,
      recurrence:
        values.taskMode === 'project'
          ? null
          : recurrence
            ? { ...recurrence, startDate: (range?.[0] ?? dayjs()).toISOString() }
            : null,
      images,
      conflicts: conflicts.map((t) => ({ id: t.id, title: t.title, startAt: t.startAt, endAt: t.endAt })),
    })
  }

  const removeSubtask = (index: number) => {
    if (!result) return
    setResult({ ...result, tasks: result.tasks.filter((_, i) => i !== index) })
  }

  const subtaskColumns = [
    {
      title: '#',
      width: 40,
      render: (_: unknown, __: DecomposeTask, i: number) => i + 1,
    },
    { title: '子任务名称', dataIndex: 'title' },
    {
      title: '估时 (h)',
      dataIndex: 'estimatedHours',
      width: 80,
    },
    {
      title: '排期',
      width: 180,
      render: (_: unknown, r: DecomposeTask) =>
        r.earliestStart ? `${r.earliestStart} ~ ${r.earliestFinish ?? ''}` : '-',
    },
    {
      title: '操作',
      width: 60,
      render: (_: unknown, __: DecomposeTask, i: number) => (
        <Button type="text" size="small" icon={<DeleteOutlined />} onClick={() => removeSubtask(i)} />
      ),
    },
  ]

  const modalTitle = editTask
    ? '编辑任务'
    : role === 'manager'
      ? allowedModes === 'full'
        ? '发布任务/项目'
        : '新增任务'
      : allowedModes === 'full'
        ? '提报任务/项目'
        : '提报任务'
  const okBtnText = editTask
    ? '保存修改'
    : role === 'manager'
      ? allowedModes === 'full'
        ? '发布'
        : '新增'
      : '提报'

  return (
    <Modal
      title={modalTitle}
      open={open}
      onCancel={onCancel}
      onOk={handleSubmit}
      okText={okBtnText}
      cancelText="取消"
      width={760}
      destroyOnHidden
      confirmLoading={decomposeMutation.isPending}
    >
      <Form form={form} layout="vertical" initialValues={{ priority: 'high', taskMode: 'team', needReview: false, importance: 'important', urgencyDegree: 'notUrgent' }}>
        <Form.Item name="title" label={allowedModes === 'full' ? '任务/项目标题' : '任务标题'} rules={[{ required: true, message: '请输入任务标题' }]}>
          <Input placeholder="例如：完成官网首页改版" />
        </Form.Item>

        <Form.Item name="taskMode" label="任务模式">
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            onChange={(e) => {
              setTaskMode(e.target.value)
              if (e.target.value === 'individual') {
                setEnableAI(false)
                setResult(null)
              }
            }}
            options={[
              { value: 'team', label: '团队协作任务' },
              { value: 'individual', label: '独立任务' },
              ...(allowedModes === 'full' ? [{ value: 'project', label: '团队协作项目' }] : []),
            ]}
          />
        </Form.Item>

        {taskMode === 'individual' ? (
          <Alert
            type="info"
            showIcon
            message="独立任务由本人独立完成，不进入团队待承接池，不支持 AI 拆解。"
            style={{ marginBottom: 16 }}
          />
        ) : taskMode === 'project' ? (
          <Alert
            type="info"
            showIcon
            message="团队协作项目本身不直接执行；其 SOP 流程在项目审核通过后自动生成项目内任务。"
            style={{ marginBottom: 16 }}
          />
        ) : (
          <Alert
            type="info"
            showIcon
            message="团队协作任务可拆解子任务、指派成员，并可开启完成评审。"
            style={{ marginBottom: 16 }}
          />
        )}

        <Form.Item name="description" label="目标与背景">
          <Input.TextArea rows={3} placeholder="描述任务目标、预期结果和约束" />
        </Form.Item>

        <Form.Item label="说明图片">
          <ImageUpload value={images} onChange={setImages} />
        </Form.Item>

        <Space size={12} style={{ display: 'flex' }} align="start" wrap>
          <Form.Item name="priority" label="优先级" style={{ minWidth: 120 }}>
            <Select
              options={Object.entries(TASK_PRIORITY_META).map(([value, meta]) => ({ value, label: meta.label }))}
            />
          </Form.Item>
          <Form.Item name="importance" label="重要程度" style={{ minWidth: 110 }}>
            <Select
              options={Object.entries(IMPORTANCE_META).map(([value, meta]) => ({ value, label: meta.label }))}
            />
          </Form.Item>
          <Form.Item name="urgencyDegree" label="紧急程度" style={{ minWidth: 110 }}>
            <Select
              options={Object.entries(URGENCY_DEGREE_META).map(([value, meta]) => ({ value, label: meta.label }))}
            />
          </Form.Item>
          <Form.Item name="range" label="排期区间">
            <RangePicker showTime format="YYYY-MM-DD HH:mm" />
          </Form.Item>
        </Space>

        {conflicts.length > 0 && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message={
              role === 'manager'
                ? '该任务与以下同人事项时间冲突，确认发布后仍以管理审核通过为准'
                : '该任务与以下同人事项时间冲突，提报后将由管理人员审核通过方可生效'
            }
            description={
              <List
                size="small"
                dataSource={conflicts}
                renderItem={(t) => (
                  <List.Item style={{ padding: '6px 0' }}>
                    <Space wrap>
                      <Text>{t.title}</Text>
                      <Tag color={TASK_KIND_META[t.kind].color}>{TASK_KIND_META[t.kind].label}</Tag>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {dayjs(t.startAt ?? t.dueAt).format('MM-DD HH:mm')} ~ {dayjs(t.endAt ?? t.dueAt).format('MM-DD HH:mm')}
                      </Text>
                    </Space>
                  </List.Item>
                )}
              />
            }
          />
        )}

        {/* 定期 / 循环（团队协作项目模式不出现） */}
        {taskMode !== 'project' && (
          <Form.Item label="重复设置">
            <RecurrenceEditor value={recurrence} onChange={setRecurrence} />
          </Form.Item>
        )}

        {/* 需求 2：任务创建必须填写 SOP 流程（个人计划不在本弹窗创建；独立任务可空） */}
        <Form.Item
          label={
            <Space size={8}>
              <span>
                SOP 流程
                {taskMode === 'team' || taskMode === 'project' ? (
                  <Text type="danger">（必填，每行一步，缩进两个空格表示子步骤{taskMode === 'project' ? '；项目审核通过后按此流程生成项目内任务' : ''}）</Text>
                ) : (
                  <Text type="secondary">（独立任务可选）</Text>
                )}
              </span>
              {sopSource === 'ai' && <Tag color="purple">AI 生成</Tag>}
            </Space>
          }
          style={{ marginBottom: 8 }}
        >
          <Space direction="vertical" style={{ width: '100%' }} size={6}>
            <Form.Item name="sopText" noStyle>
              <Input.TextArea
                rows={4}
                placeholder={'例如：\n需求确认与技术方案\n  输出技术方案文档\n编码实现\n自测与联调'}
              />
            </Form.Item>
            <div>
              <Button size="small" icon={<RobotOutlined />} loading={sopMutation.isPending} onClick={() => sopMutation.mutate()}>
                AI 生成 SOP
              </Button>
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                生成规则可在「AI 规则」页的「SOP 生成」模板中自配
              </Text>
            </div>
          </Space>
        </Form.Item>

        {taskMode === 'team' && (
          <Form.Item label="承接方式">
            {role === 'member' ? (
              <Alert
                type="info"
                showIcon
                message="普通人员提报任务时仅支持「推荐承接人」，由管理人员审核后生效，不支持直接指派。"
                style={{ marginBottom: 12 }}
              />
            ) : (
              <Radio.Group
                value={assignMode}
                optionType="button"
                buttonStyle="solid"
                onChange={(e) => {
                  setAssignMode(e.target.value)
                  // 切换方式时清空另一种方式的取值，避免残留
                  if (e.target.value === 'recommend') form.setFieldValue('assigneeId', undefined)
                  else form.setFieldValue('recommendAssigneeId', undefined)
                }}
                options={[
                  { value: 'direct', label: '直接指派' },
                  { value: 'recommend', label: '推荐承接人' },
                ]}
              />
            )}
            <div style={{ marginTop: 12 }}>
              {role === 'member' || assignMode === 'recommend' ? (
                <Form.Item name="recommendAssigneeId" label="推荐承接人（管理审核后生效）" style={{ marginBottom: 0, minWidth: 240 }} rules={[{ required: true, message: '请选择推荐承接人' }]}>
                  <Select placeholder="选择推荐承接人" options={teamMembers.map((u) => ({ value: u.id, label: u.displayName }))} />
                </Form.Item>
              ) : (
                <Form.Item name="assigneeId" label="指派成员（可选）" style={{ marginBottom: 0, minWidth: 240 }}>
                  <Select allowClear placeholder="留空则进入待承接池" options={teamMembers.map((u) => ({ value: u.id, label: u.displayName }))} />
                </Form.Item>
              )}
            </div>
          </Form.Item>
        )}

        {taskMode === 'team' && (
          <Form.Item name="needReview" label="完成后需要评审" valuePropName="checked">
            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
          </Form.Item>
        )}
        {taskMode === 'team' && (
          <div style={{ marginTop: -8, marginBottom: 16 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              开启后，发布时即在原任务下自动生成「项目评审」子任务（由管理员承接）；评审邀请多位参与人时，系统按人拆成多个评审任务（每任务一人承接）。评审通过后主任务才可审批通过。
            </Text>
          </div>
        )}

        {taskMode !== 'project' && <Divider style={{ margin: '8px 0 16px' }} />}

        {taskMode !== 'project' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Space>
              <Text strong>AI 拆解</Text>
              <Tag color="blue">可选</Tag>
            </Space>
            <Switch
              checked={enableAI}
              onChange={(v) => setEnableAI(v)}
              disabled={taskMode === 'individual'}
              checkedChildren="启用"
              unCheckedChildren="停用"
            />
          </div>
        )}

        {taskMode === 'individual' && (
          <Alert
            type="warning"
            showIcon
            message="独立任务不支持 AI 拆解，如需拆分子任务请切换为团队协作任务。"
            style={{ marginBottom: 12 }}
          />
        )}

        {enableAI && taskMode === 'team' && (
          <div style={{ padding: 12, borderRadius: 6, background: 'var(--bg-input)' }}>
            {/* 需求 1：按行业与任务类型匹配经验模板 */}
            <Space size={12} wrap style={{ marginBottom: 10 }}>
              <span>
                <Text style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>行业类型</Text>
                <Select
                  value={industry}
                  onChange={setIndustry}
                  style={{ width: 150 }}
                  options={INDUSTRY_OPTIONS.map((v) => ({ value: v, label: v }))}
                />
              </span>
              <span>
                <Text style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>任务类型</Text>
                <Select
                  value={taskType}
                  onChange={setTaskType}
                  style={{ width: 150 }}
                  options={TASK_TYPE_OPTIONS.map((v) => ({ value: v, label: v }))}
                />
              </span>
            </Space>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
              将按「{industry} × {taskType}」匹配规则库中的经验模板；可在「AI 规则」页面维护或新增模板。
            </Text>
            <Input.TextArea
              rows={2}
              placeholder="拆解目标，留空则使用任务标题"
              onChange={(e) => form.setFieldValue('aiGoal', e.target.value)}
              style={{ marginBottom: 8 }}
            />
            <Space>
              <Form.Item name="totalEstimatedHours" label="总估时（小时）" initialValue={40} style={{ marginBottom: 0 }}>
                <InputNumber min={1} max={1000} style={{ width: 140 }} />
              </Form.Item>
              <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                onClick={handleGenerate}
                loading={decomposeMutation.isPending}
              >
                生成拆解建议
              </Button>
            </Space>

            {result && (
              <div style={{ marginTop: 12 }}>
                <Space wrap style={{ marginBottom: 8 }}>
                  <Tag color="blue">命中规则：{result.rule?.name ?? '无（使用兜底拆分）'}</Tag>
                  <Tag color={result.source === 'agent' ? 'green' : 'default'}>
                    {result.source === 'agent' ? 'Agent 模型生成' : '本地规则引擎'}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    共 {result.tasks.length} 项，发布后作为子任务挂在本任务下
                  </Text>
                </Space>
                <Table
                  size="small"
                  dataSource={result.tasks.map((t, i) => ({ ...t, rowKey: `${i}-${t.title}` }))}
                  columns={subtaskColumns}
                  pagination={false}
                  rowKey="rowKey"
                />
              </div>
            )}
          </div>
        )}
      </Form>
    </Modal>
  )
}
