/**
 * TaskExecutionPanel.tsx —— 任务详情与执行合并面板
 *
 * 覆盖需求：
 * - 任务详情页与执行页合并，入口不变（/tasks/:taskId 与 /tasks/:taskId/execution 均复用本面板）
 * - 优先从本地 WorkspaceTask 读取；本地不存在时自动从 taskApi 加载并补齐为 WorkspaceTask
 * - 需求 2：每个任务有独立执行页，执行者记录执行情况；管理与创建者可补充/修改内容（需重新提审）
 * - 需求 5：管理人员与项目参与人员（父级/子级负责人）可在执行页评论互动
 * - 需求 6：负责人切换 待执行/执行中/已完成；提报完成须选标签 + 精确到分钟的完成时间 + 任务总结
 * - 需求 7：任务总结可由 AI 生成（读取执行页全部信息），提示词模板在 AI 规则页维护
 */
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Empty,
  Form,
  Image,
  Input,
  List,
  Modal,
  Popconfirm,
  Row,
  Segmented,
  Select,
  Space,
  Tag,
  TimePicker,
  Timeline,
  Typography,
  Upload,
  message,
} from 'antd'
import {
  ArrowLeftOutlined,
  ArrowUpOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  MessageOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  RobotOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useMutation, useQuery } from '@tanstack/react-query'
import dayjs, { type Dayjs } from 'dayjs'
import { Link, useNavigate } from 'react-router-dom'
import { mockMe, mockUsers } from '@/api/mock/data'
import { taskApi } from '@/api/taskApi'
import { useAiRules } from '@/hooks/useAiRules'
import { useLocalStorageState } from '@/hooks/useLocalStorageState'
import { readIndustryAndType, useWorkspaceTasks } from '@/hooks/useWorkspaceTasks'
import { generateSopFlow, toSopFlow, generateTaskReport } from '@/utils/aiRules'
import { archiveSopFromTask, effectiveSop, syncSopStep } from '@/utils/sopLibrary'
import { findDescendantIds, spansMoreThanOneDay, toWorkspaceTask } from '@/utils/taskTree'
import SopFlowTree from '@/components/workspace/SopFlowTree'
import {
  APPROVAL_STATUS_META,
  APPROVAL_TYPE_META,
  IMPORTANCE_META,
  REVIEW_STATUS_META,
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  TASK_URGENCY_META,
  URGENCY_DEGREE_META,
  deriveTaskUrgency,
  type DailyPlanNode,
  type ExecutionComment,
  type ExecutionLog,
  type Importance,
  type MediaAttachment,
  type SopNode,
  type TaskCompletion,
  type TaskStatus,
  type UrgencyDegree,
  type WorkspaceTask,
} from '@/types'

const { Title, Text, Paragraph } = Typography

type WorkspaceRole = 'manager' | 'member'

/** 完成标签（需求 6） */
const COMPLETION_TAGS = ['按计划完成', '提前完成', '延期完成', '部分完成', '超预期完成']

const statusLabels: Record<TaskStatus, string> = {
  todo: '待执行',
  in_progress: '执行中',
  blocked: '已阻塞',
  done: '已完成',
  cancelled: '已取消',
}

const userName = (id: string | null) =>
  id ? (mockUsers.find((u) => u.id === id)?.displayName ?? id) : '未指派'

function ImageGallery({ images }: { images: string[] }) {
  return (
    <Image.PreviewGroup>
      <Space wrap size={8}>
        {images.map((src, i) => (
          <Image
            key={`${src.slice(0, 24)}-${i}`}
            src={src}
            alt={`图片 ${i + 1}`}
            width={120}
            height={80}
            style={{ objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border-subtle)' }}
          />
        ))}
      </Space>
    </Image.PreviewGroup>
  )
}

export interface TaskExecutionPanelProps {
  taskId: string
}

export default function TaskExecutionPanel({ taskId }: TaskExecutionPanelProps) {
  const navigate = useNavigate()
  const [tasks, setTasks] = useWorkspaceTasks()
  const [role] = useLocalStorageState<WorkspaceRole>('workspace_role', 'manager')
  const { rules } = useAiRules()

  const [logForm] = Form.useForm()
  const [commentForm] = Form.useForm()
  const [contentForm] = Form.useForm()
  const [completeForm] = Form.useForm()
  const [subtaskForm] = Form.useForm()
  const [reassignForm] = Form.useForm()
  const [dailyPlanForm] = Form.useForm()

  const [editingContent, setEditingContent] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [addingSubtask, setAddingSubtask] = useState(false)
  /** 第四批需求 3：基于 SOP 节点生成子任务的 Modal 状态 */
  const [generateOpen, setGenerateOpen] = useState(false)
  const [generateTarget, setGenerateTarget] = useState<{ id: string; title: string } | null>(null)
  const [generateForm] = Form.useForm<{ title: string; description?: string; mode: 'self' | 'other'; assigneeId?: string }>()
  const [reassignOpen, setReassignOpen] = useState(false)
  const [aiReport, setAiReport] = useState<{ summary: string; notes: string; sopImprovement: string; suggestions: string; source: string } | null>(null)
  /** 需求 2：审核阶段管理可直接修改任务内容/执行人 */
  const [managerEditOpen, setManagerEditOpen] = useState(false)
  const [managerEditForm] = Form.useForm()

  /** 需求 1：执行记录 / 评论的本地附件（mock 演示，不真正上传后端） */
  const [logAttachments, setLogAttachments] = useState<MediaAttachment[]>([])
  const [commentAttachments, setCommentAttachments] = useState<MediaAttachment[]>([])
  /** 预览弹窗：{ type, url } | null */
  const [preview, setPreview] = useState<{ type: 'image' | 'video'; url: string } | null>(null)
  /** 所有通过 URL.createObjectURL 生成的 blob URL，组件卸载时统一回收 */
  const objectUrlsRef = useRef<string[]>([])

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u))
      objectUrlsRef.current = []
    }
  }, [])

  const localTask = tasks.find((t) => t.id === taskId)

  /** 本地不存在时，从 taskApi 加载并补齐为 WorkspaceTask */
  const remoteQuery = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => taskApi.getTask(taskId),
    enabled: !!taskId && !localTask,
    retry: false,
  })

  useEffect(() => {
    if (!localTask && remoteQuery.data) {
      const converted = toWorkspaceTask(remoteQuery.data)
      setTasks((c) => {
        if (c.some((t) => t.id === converted.id)) return c
        return [converted, ...c]
      })
    }
  }, [localTask, remoteQuery.data, setTasks])

  const task = tasks.find((t) => t.id === taskId)

  const isManager = role === 'manager'
  const isOwner = task?.assigneeId === mockMe.id
  const isCreator = task?.createdBy === mockMe.id
  /** 第四批：项目负责人（kind='project' 的项目任务，其 assigneeId/createdBy === mockMe） */
  const isProjectOwner = useMemo(() => {
    if (!task?.projectId) return false
    const p = tasks.find((x) => x.id === task.projectId && x.kind === 'project')
    if (!p) return false
    return p.assigneeId === mockMe.id || p.createdBy === mockMe.id
  }, [task, tasks])
  /** 第四批：父级任务负责人（链路上承接人 === mockMe）——递归 ancestor assignee */
  const isAncestorOwner = useMemo(() => {
    if (!task?.parentId) return false
    let cursor: WorkspaceTask | undefined = tasks.find((t) => t.id === task.parentId)
    while (cursor) {
      if (cursor.assigneeId === mockMe.id) return true
      cursor = cursor.parentId ? tasks.find((t) => t.id === cursor!.parentId) : undefined
    }
    return false
  }, [task, tasks])
  /** 第四批：父级任务承接人或项目负责人或任务承接人都可发起子任务相关变更（管理审核才生效） */
  const canProposeSubtaskChange = isManager || isOwner || isProjectOwner || isAncestorOwner
  const canEditContent = isManager || isCreator

  /**
   * 需求 5：项目参与人员 = 本任务 + 其所有祖先 + 其所有后代的负责人与创建人。
   * 这些人都可以在执行页评论互动。
   */
  const participants = useMemo(() => {
    if (!task) return new Set<string>()
    const ids = new Set<string>([task.id, ...findDescendantIds(tasks, task.id)])
    // 向上找祖先
    let cursor = task.parentId
    while (cursor) {
      ids.add(cursor)
      cursor = tasks.find((t) => t.id === cursor)?.parentId ?? null
    }
    const people = new Set<string>()
    tasks
      .filter((t) => ids.has(t.id))
      .forEach((t) => {
        if (t.assigneeId) people.add(t.assigneeId)
        people.add(t.createdBy)
        t.participants.forEach((p) => { if (p) people.add(p) })
      })
    return people
  }, [task, tasks])

  const canComment = isManager || participants.has(mockMe.id)

  /** 需求 7：AI 根据执行页全部信息生成总结 */
  const reportMutation = useMutation({
    mutationFn: async () => {
      if (!task) throw new Error('任务不存在')
      const { industry, taskType } = readIndustryAndType(task)
      return generateTaskReport(
        {
          title: task.title,
          description: task.description ?? '',
          industry,
          taskType,
          logs: task.executionLogs.map((l) => `[${dayjs(l.createdAt).format('MM-DD HH:mm')}] ${l.authorName}：${l.content}`).join('\n'),
          comments: task.comments.map((c) => `${c.authorName}：${c.content}`).join('\n'),
          completedAt: task.completion?.completedAt ?? dayjs().format('YYYY-MM-DD HH:mm'),
        },
        rules,
      )
    },
    onSuccess: (data) => {
      setAiReport({ summary: data.summary, notes: data.notes, sopImprovement: data.sopImprovement, suggestions: data.suggestions, source: data.source })
      completeForm.setFieldsValue({
        summary: data.summary,
        notes: data.notes,
        sopImprovement: data.sopImprovement,
        suggestions: data.suggestions,
      })
      message.success(data.source === 'agent' ? 'AI 已生成总结报告' : '已按规则生成总结报告')
    },
    onError: () => message.error('生成总结失败，请稍后重试'),
  })

  /** 需求 4：AI 生成/重生成 SOP 流程（提示词在「AI 规则」页 sop 场景模板中自配） */
  const sopMutation = useMutation({
    mutationFn: async () => {
      if (!task) throw new Error('任务不存在')
      const { industry, taskType } = readIndustryAndType(task)
      return generateSopFlow(
        {
          title: task.title,
          description: task.description ?? '',
          industry,
          taskType,
          extra: task.completion?.summary ?? '',
        },
        rules,
      )
    },
    onSuccess: (res) => {
      const flow = toSopFlow(res.steps, res.source === 'agent' ? 'ai' : 'manual')
      applySopChange(flow.steps, flow.source)
      message.success(res.source === 'agent' ? 'AI 已生成新流程' : '已按经验规则生成新流程')
    },
    onError: () => message.error('流程生成失败，请稍后重试'),
  })

  if (!task) {
    if (remoteQuery.isLoading) {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Text type="secondary">正在加载任务…</Text>
        </div>
      )
    }
    if (remoteQuery.isError) {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Empty description="任务不存在或已被删除">
            <Link to="/workspace">返回协作工作台</Link>
          </Empty>
        </div>
      )
    }
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Empty description="任务不存在或已被删除">
          <Link to="/workspace">返回协作工作台</Link>
        </Empty>
      </div>
    )
  }

  const patch = (fn: (t: WorkspaceTask) => WorkspaceTask) => {
    setTasks((c) => c.map((t) => (t.id === taskId ? fn(t) : t)))
  }

  /**
   * 需求 4/5：保存流程修改。
   * 编辑继承来的流程时直接写入持有该流程的祖先任务，父级与兄弟子任务的展示随之同步。
   */
  const applySopChange = (steps: SopNode[], source: 'manual' | 'ai' | 'inherited' = 'manual') => {
    const hit = effectiveSop(tasks, task)
    const flow = { steps, source, updatedAt: new Date().toISOString() }
    const ownerId = hit ? hit.owner.id : task.id
    setTasks((c) => c.map((t) => (t.id === ownerId ? { ...t, sop: flow, updatedAt: new Date().toISOString() } : t)))
    message.success('流程已更新')
  }

  /** 需求 4：执行中承接人随时可改；完成提报后管理在审核阶段可最终修改 */
  const canEditSop = (isOwner && task.status !== 'done') || (isManager && (task.approvalStatus === 'pending' || !task.assigneeId))

  /** 需求 1：重要程度/紧急程度创建后可修改，看板便签同步变化 */
  const patchUrgency = (imp: Importance, urg: UrgencyDegree) => {
    patch((t) => ({
      ...t,
      importance: imp,
      urgencyDegree: urg,
      urgency: deriveTaskUrgency(imp, urg),
      updatedAt: new Date().toISOString(),
    }))
  }

  /** 需求 5：周期超过一天的任务 —— 每日完成时间节点规划（可随时增删改/勾选完成） */
  const addDailyPlan = (values: { date: Dayjs; time: Dayjs; goal: string }) => {
    const node: DailyPlanNode = {
      id: `dplan-${Date.now()}`,
      date: values.date.format('YYYY-MM-DD'),
      time: values.time.format('HH:mm'),
      goal: values.goal,
      done: false,
    }
    patch((t) => ({ ...t, dailyPlans: [...t.dailyPlans, node], updatedAt: new Date().toISOString() }))
    dailyPlanForm.resetFields()
    message.success(`已添加 ${node.date} ${node.time} 的完成节点`)
  }

  const toggleDailyPlan = (id: string) => {
    patch((t) => ({
      ...t,
      dailyPlans: t.dailyPlans.map((n) => (n.id === id ? { ...n, done: !n.done } : n)),
      updatedAt: new Date().toISOString(),
    }))
  }

  const removeDailyPlan = (id: string) => {
    patch((t) => ({ ...t, dailyPlans: t.dailyPlans.filter((n) => n.id !== id), updatedAt: new Date().toISOString() }))
  }

  /** 需求 2：审核阶段管理直接修改任务内容与执行人（最终修改，无需再提审） */
  const submitManagerEdit = (values: { title: string; description: string; assigneeId?: string }) => {
    patch((t) => ({
      ...t,
      title: values.title,
      description: values.description || null,
      assigneeId: values.assigneeId ?? t.assigneeId,
      updatedAt: new Date().toISOString(),
    }))
    setManagerEditOpen(false)
    message.success('已按管理审核修改任务内容')
  }

  /**
   * 需求 1：mock 演示——拦截默认上传，把 File 转成 blob URL 存入本地附件列表。
   * 真正上传会在 afterUpload/提交后进行，这里仅做本地预览。
   */
  const makeBeforeUpload = (setter: Dispatch<SetStateAction<MediaAttachment[]>>) =>
    (file: File) => {
      const isImage = file.type.startsWith('image/')
      const isVideo = file.type.startsWith('video/')
      if (!isImage && !isVideo) {
        message.error('仅支持上传图片或视频文件')
        return Upload.LIST_IGNORE
      }
      const url = URL.createObjectURL(file)
      objectUrlsRef.current.push(url)
      const att: MediaAttachment = {
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: isImage ? 'image' : 'video',
        url,
        name: file.name,
        size: file.size,
      }
      setter((prev) => [...prev, att])
      return false
    }

  /** 需求 1：从待提交附件列表中移除（同时回收其 blob URL） */
  const removeAttachment = (
    setter: Dispatch<SetStateAction<MediaAttachment[]>>,
    list: MediaAttachment[],
    id: string,
  ) => {
    const target = list.find((a) => a.id === id)
    if (target) {
      URL.revokeObjectURL(target.url)
      objectUrlsRef.current = objectUrlsRef.current.filter((u) => u !== target.url)
    }
    setter((prev) => prev.filter((a) => a.id !== id))
  }

  /** 需求 1：渲染一条记录/评论的附件网格（图片缩略图 + 视频封面） */
  const renderAttachments = (attachments: MediaAttachment[]) => {
    if (!attachments || attachments.length === 0) return null
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        {attachments.map((a) =>
          a.type === 'image' ? (
            <img
              key={a.id}
              src={a.url}
              alt={a.name}
              title={a.name}
              onClick={() => setPreview({ type: 'image', url: a.url })}
              style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, cursor: 'pointer' }}
            />
          ) : (
            <div
              key={a.id}
              onClick={() => setPreview({ type: 'video', url: a.url })}
              style={{
                position: 'relative',
                width: 80,
                height: 80,
                borderRadius: 6,
                overflow: 'hidden',
                cursor: 'pointer',
                background: '#000',
              }}
            >
              <video src={a.url} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <PlayCircleOutlined
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  fontSize: 24,
                  color: 'rgba(255,255,255,0.9)',
                }}
              />
            </div>
          ),
        )}
      </div>
    )
  }

  const addLog = (values: { content: string }) => {
    const log: ExecutionLog = {
      id: `log-${Date.now()}`,
      taskId,
      authorId: mockMe.id,
      authorName: mockMe.displayName,
      content: values.content,
      attachments: logAttachments,
      createdAt: new Date().toISOString(),
    }
    patch((t) => ({ ...t, executionLogs: [...t.executionLogs, log], updatedAt: new Date().toISOString() }))
    logForm.resetFields()
    setLogAttachments([])
    message.success('执行记录已添加')
  }

  const addComment = (values: { content: string }) => {
    const comment: ExecutionComment = {
      id: `cmt-${Date.now()}`,
      taskId,
      authorId: mockMe.id,
      authorName: mockMe.displayName,
      content: values.content,
      attachments: commentAttachments,
      createdAt: new Date().toISOString(),
    }
    patch((t) => ({ ...t, comments: [...t.comments, comment], updatedAt: new Date().toISOString() }))
    commentForm.resetFields()
    setCommentAttachments([])
    message.success('评论已发布')
  }

  /** 需求 2：内容修改需提审，审核通过后才覆盖正式内容 */
  const submitContentChange = (values: { title: string; description: string }) => {
    if (task.approvalStatus === 'pending') {
      message.warning('该任务已有待审核事项，请等待管理人员处理后再次修改')
      return
    }
    patch((t) => ({
      ...t,
      pendingContent: {
        title: values.title,
        description: values.description,
        submittedBy: mockMe.displayName,
        submittedAt: new Date().toISOString(),
      },
      approvalStatus: 'pending',
      approvalType: 'content',
      updatedAt: new Date().toISOString(),
    }))
    setEditingContent(false)
    message.success('内容变更已提交，等待管理人员审核')
  }

  const approveContent = (approved: boolean) => {
    patch((t) => {
      if (!t.pendingContent) return t
      if (!approved) {
        return { ...t, pendingContent: null, approvalStatus: 'rejected', updatedAt: new Date().toISOString() }
      }
      return {
        ...t,
        title: t.pendingContent.title,
        description: t.pendingContent.description,
        pendingContent: null,
        approvalStatus: 'approved',
        updatedAt: new Date().toISOString(),
      }
    })
    message.success(approved ? '内容变更已通过并生效' : '内容变更已驳回')
  }

  /** 需求 6：提报完成必须带标签、精确到分钟的完成时间与总结 */
  const submitCompletion = (values: {
    tags: string[]
    completedAt: Dayjs
    summary: string
    notes: string
    sopImprovement: string
    suggestions: string
  }) => {
    if (task.approvalStatus === 'pending') {
      message.warning('该任务已有待审核事项，请等待管理人员处理后再次提报')
      return
    }
    const completion: TaskCompletion = {
      completedAt: values.completedAt.format('YYYY-MM-DD HH:mm'),
      tags: values.tags,
      notes: values.notes,
      sopImprovement: values.sopImprovement,
      suggestions: values.suggestions,
      summary: values.summary,
      aiGenerated: Boolean(aiReport),
    }
    patch((t) => ({
      ...t,
      completion,
      approvalStatus: 'pending',
      approvalType: 'completion',
      updatedAt: new Date().toISOString(),
    }))
    setCompleting(false)
    setAiReport(null)
    message.success('完成提报已提交，等待管理人员审核')
  }

  const approveCompletion = (approved: boolean) => {
    patch((t) => {
      if (!approved) {
        return { ...t, completion: null, approvalStatus: 'rejected', updatedAt: new Date().toISOString() }
      }
      return {
        ...t,
        status: 'done',
        completedAt: t.completion?.completedAt ? dayjs(t.completion.completedAt).toISOString() : new Date().toISOString(),
        approvalStatus: 'approved',
        updatedAt: new Date().toISOString(),
      }
    })
    // 需求 6：完成审核通过 = 任务闭环，SOP 以标题+总结+流程图沉淀到「SOP 与经验」
    if (approved) {
      const doc = archiveSopFromTask(tasks, { ...task, status: 'done' })
      if (doc) message.info(`SOP 已沉淀：「${doc.title}」可在「SOP 与经验」查看与应用`)
    }
    message.success(approved ? '审核通过，任务已完成' : '完成提报已驳回')
  }

  const changeStatus = (status: TaskStatus) => {
    patch((t) => ({ ...t, status, updatedAt: new Date().toISOString() }))
    message.success(`状态已更新为「${statusLabels[status]}」`)
  }

  /** 需求 1：管理可直接重新指派承接人 */
  const reassignOwner = (values: { assigneeId: string }) => {
    patch((t) => ({ ...t, assigneeId: values.assigneeId, updatedAt: new Date().toISOString() }))
    setReassignOpen(false)
    reassignForm.resetFields()
    message.success(`已将承接人改派为 ${userName(values.assigneeId)}`)
  }

  /**
   * 需求 9 + 第四批 5：父级任务下新增子任务。
   * - 管理直接生效；父级承接人/项目负责人/父级祖先承接人可发起，进入待审核（approvalType content）。
   */
  const createSubtask = (values: { title: string; description?: string; mode: 'self' | 'other'; assigneeId?: string }) => {
    if (!canProposeSubtaskChange) {
      message.warning('仅父级任务承接人/项目负责人/管理人员可新增子任务')
      return
    }
    const now = new Date().toISOString()
    const needsApproval = !isManager
    const sub: WorkspaceTask = {
      id: `sub-${Date.now()}`, tenantId: 'tenant-001', projectId: task.projectId, parentId: task.id,
      title: values.title, description: values.description ?? null,
      status: 'todo',
      priority: 'medium', assigneeId: values.mode === 'self' ? mockMe.id : null,
      dueAt: null, estimatedHours: 2, actualHours: null, completedAt: null, startedAt: null,
      createdBy: mockMe.id, tags: ['子任务'], sortOrder: 0, workflowColumnId: null, isAiGenerated: false,
      version: 1, createdAt: now, updatedAt: now,
      taskMode: task.taskMode, kind: 'task', needReview: false, reviewStatus: 'none',
      proposalStatus: 'none', participants: [], reviewOfTaskId: null,
      startAt: null, endAt: null,
      recommendedAssigneeId: values.mode === 'other' ? (values.assigneeId ?? null) : null,
      approvalStatus: needsApproval ? 'pending' : 'none',
      approvalType: needsApproval ? 'content' : null,
      pendingContent: null, executionLogs: [], comments: [], completion: null,
      auditLogs: [],
      dailyPlans: [],
      isDraft: false,
      pendingDelete: false,
      pendingSop: null,
    }
    setTasks((c) => [sub, ...c])
    subtaskForm.resetFields()
    setAddingSubtask(false)
    message.success(
      needsApproval
        ? '子任务已创建，已推送管理人员审核'
        : '子任务已创建',
    )
  }

  const childTasks = tasks.filter((t) => t.parentId === task.id)
  const pendingApproval = task.approvalStatus === 'pending'

  /** 需求 9 + 第四批 5：删除子任务。父级承接人/项目负责人/父级祖先承接人/管理人员可操作；
   *  管理直接删并同步父任务流程节点；其他角色进入管理审核。 */
  const requestDeleteSubtask = (sub: WorkspaceTask) => {
    const now = new Date().toISOString()
    const canDirect = isManager
    const canPropose = canProposeSubtaskChange
    if (!canPropose) {
      message.warning('仅父级任务承接人/项目负责人/管理人员可删除子任务')
      return
    }
    if (canDirect) {
      const removeIds = new Set([sub.id, ...findDescendantIds(tasks, sub.id)])
      setTasks((c) => {
        // 同步父任务流程节点（子任务=流程节点，删除后流程对应节点移除）
        const newFlow = syncSopStep(c, task.id, sub.title, 'remove')
        return c
          .filter((t) => !removeIds.has(t.id))
          .map((t) =>
            t.id === task.id && newFlow ? { ...t, sop: newFlow, updatedAt: now } : t,
          )
      })
      message.success('子任务已删除，父级流程对应节点已移除')
      return
    }
    // 普通成员（父级任务承接人）：进入待审核（流程节点同步在审核通过后由审核中心执行）
    setTasks((c) =>
      c.map((t) =>
        t.id === sub.id
          ? { ...t, pendingDelete: true, approvalStatus: 'pending' as const, updatedAt: now }
          : t,
      ),
    )
    message.success('删除子任务已推送管理人员审核，通过后子任务与流程节点将一并移除')
  }

  /** 第四批需求 4：批量删除子任务。管理直接删 + 同步父任务 SOP 节点；其他可发起角色批量进入审核。 */
  const requestDeleteAllSubtasks = () => {
    if (!canProposeSubtaskChange) {
      message.warning('无权批量删除子任务')
      return
    }
    if (childTasks.length === 0) return
    const now = new Date().toISOString()
    if (isManager) {
      const removeIds = new Set<string>(childTasks.flatMap((s) => [s.id, ...findDescendantIds(tasks, s.id)]))
      const titles = childTasks.map((s) => s.title)
      setTasks((c) => {
        let updated = c.filter((t) => !removeIds.has(t.id))
        titles.forEach((title) => {
          const flow = syncSopStep(updated, task.id, title, 'remove')
          if (flow) updated = updated.map((t) => (t.id === task.id ? { ...t, sop: flow, updatedAt: now } : t))
        })
        return updated
      })
      message.success(`已批量删除 ${childTasks.length} 个子任务，流程节点同步移除`)
      return
    }
    // 非管理：批量标记 pendingDelete
    const titles = childTasks.map((s) => s.title)
    setTasks((c) => {
      const next = c.map((t) =>
        childTasks.some((s) => s.id === t.id)
          ? { ...t, pendingDelete: true, approvalStatus: 'pending' as const, updatedAt: now }
          : t,
      )
      // 同步父任务 SOP：先把要删的步骤从 SOP 中移除（pendingSop 体现待审变动）
      const parent = next.find((x) => x.id === task.id)
      if (parent?.sop) {
        const flow: typeof parent.sop = { ...parent.sop, steps: parent.sop.steps.filter((st) => !titles.includes(st.title)), updatedAt: now }
        const result = next.map((t) => (t.id === task.id ? { ...t, sop: flow, pendingSop: flow, updatedAt: now } : t))
        return result
      }
      return next
    })
    message.success('批量删除子任务已推送管理人员审核，通过后流程节点将一并移除')
  }

  /** 第四批需求 3：基于 SOP 节点生成子任务 → 创建子任务（待审）；审核通过后该任务成为父任务，子任务发布到任务协作列表。 */
  const openGenerateFromSop = (node: { id: string; title: string }) => {
    if (!canProposeSubtaskChange) {
      message.warning('仅父级任务承接人/项目负责人/管理人员可基于流程节点生成子任务')
      return
    }
    setGenerateTarget(node)
    generateForm.setFieldsValue({ title: `${node.title} · 子任务`, description: '', mode: 'self' })
    setGenerateOpen(true)
  }
  const submitGenerateFromSop = async () => {
    if (!generateTarget) return
    const values = await generateForm.validateFields()
    const now = new Date().toISOString()
    const needsApproval = !isManager
    const sub: WorkspaceTask = {
      id: `t-sop-${Date.now()}`, tenantId: 'tenant-001', projectId: task.projectId, parentId: task.id,
      title: values.title, description: values.description ?? null,
      status: 'todo', priority: task.priority,
      assigneeId: values.mode === 'self' ? mockMe.id : null,
      dueAt: task.dueAt, estimatedHours: 2, actualHours: null, completedAt: null, startedAt: null,
      createdBy: mockMe.id, tags: ['子任务', '流程节点生成'], sortOrder: 0,
      workflowColumnId: null, isAiGenerated: false, version: 1, createdAt: now, updatedAt: now,
      taskMode: task.taskMode, kind: 'task', needReview: false, reviewStatus: 'none',
      proposalStatus: needsApproval ? 'pending' : 'none', participants: [], reviewOfTaskId: null,
      startAt: task.startAt, endAt: task.endAt,
      importance: task.importance, urgencyDegree: task.urgencyDegree,
      sop: { steps: [], source: 'inherited', updatedAt: now },
      approvalStatus: needsApproval ? 'pending' : 'none',
      approvalType: needsApproval ? 'content' : null,
      recommendedAssigneeId: values.mode === 'other' ? (values.assigneeId ?? null) : null,
      pendingContent: null, executionLogs: [], comments: [], completion: null,
      auditLogs: [], dailyPlans: [], isDraft: false, pendingDelete: false, pendingSop: null,
    }
    setTasks((c) => [sub, ...c])
    generateForm.resetFields()
    setGenerateOpen(false)
    setGenerateTarget(null)
    message.success(
      needsApproval
        ? `已基于流程节点「${generateTarget.title}」创建子任务，推送管理人员审核`
        : `已基于流程节点「${generateTarget.title}」创建子任务并发布到任务协作列表`,
    )
  }
  // 需求 8：所属项目（有则显示，无则空）——kind==='project' 的任务即项目实体；旧体系 projectId 走看板
  const parentTask = task.parentId ? tasks.find((t) => t.id === task.parentId) : undefined
  const projectTask = task.projectId ? tasks.find((t) => t.id === task.projectId && t.kind === 'project') : undefined
  const projectCrumb = projectTask
    ? { title: <Link to={`/projects/${projectTask.id}`} style={{ color: 'var(--accent-purple)' }}>{projectTask.title}</Link> }
    : task.projectId
      ? { title: <Link to={`/projects/${task.projectId}/board`}>看板</Link> }
      : null

  const breadcrumbItems = [
    { title: <Link to="/projects">项目与看板</Link> },
    ...(parentTask ? [{ title: <Link to={`/tasks/${parentTask.id}`}>{parentTask.title}</Link> }] : []),
    ...(projectCrumb ? [projectCrumb] : []),
    { title: task.title },
  ]

  return (
    <div>
      <Breadcrumb style={{ marginBottom: 12 }} items={breadcrumbItems} />
      <Row align="middle" justify="space-between" style={{ marginBottom: 16 }}>
        <Col>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} />
            <Title level={3} style={{ margin: 0, color: 'var(--text-primary)' }}>{task.title}</Title>
            <Tag color={TASK_PRIORITY_META[task.priority].color}>{TASK_PRIORITY_META[task.priority].label}</Tag>
            {task.urgency && (
              <Tag color={TASK_URGENCY_META[task.urgency].color}>{TASK_URGENCY_META[task.urgency].label}</Tag>
            )}
            <Tag>{statusLabels[task.status]}</Tag>
            <Tag color={TASK_STATUS_META[task.status].color}>{TASK_STATUS_META[task.status].label}</Tag>
            {/* 需求 3：待审核字样 */}
            {pendingApproval && (
              <Tag color={APPROVAL_STATUS_META.pending.color}>
                待审核 · {task.approvalType ? APPROVAL_TYPE_META[task.approvalType].label : '待审事项'}
              </Tag>
            )}
            {task.reviewStatus !== 'none' && (
              <Tag color={REVIEW_STATUS_META[task.reviewStatus].color}>{REVIEW_STATUS_META[task.reviewStatus].label}</Tag>
            )}
          </Space>
        </Col>
        <Col>
          <Space>
            {/* 需求 4：子任务执行页提供跳转父级任务详情页的入口；无父级任务则不显示 */}
            {task.parentId && (
              <Button
                icon={<ArrowUpOutlined />}
                onClick={() => navigate(`/tasks/${task.parentId}`)}
              >
                父级任务详情
              </Button>
            )}
            <Link to="/workspace">
              <Button>返回工作台</Button>
            </Link>
          </Space>
        </Col>
      </Row>

      {pendingApproval && (
        <Alert
          type="warning"
          showIcon
          message={`该任务有「${task.approvalType ? APPROVAL_TYPE_META[task.approvalType].label : '待审事项'}」等待管理人员审核`}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* 任务信息摘要（原详情页 Descriptions 保留） */}
      <Card style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} bordered size="small">
          <Descriptions.Item label="负责人">{userName(task.assigneeId)}</Descriptions.Item>
          <Descriptions.Item label="截止时间">
            {task.dueAt ? dayjs(task.dueAt).format('YYYY-MM-DD HH:mm') : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="估时（小时）">{task.estimatedHours ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="实际工时（小时）">{task.actualHours ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{dayjs(task.createdAt).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
          <Descriptions.Item label="完成时间">
            {task.completedAt ? dayjs(task.completedAt).format('YYYY-MM-DD HH:mm') : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="创建人">{userName(task.createdBy)}</Descriptions.Item>
          <Descriptions.Item label="任务模式">{task.taskMode === 'individual' ? '独立任务' : '团队协作'}</Descriptions.Item>
          <Descriptions.Item label="版本">v{task.version}（乐观锁）</Descriptions.Item>
        </Descriptions>
        <Divider style={{ margin: '16px 0' }} />
        <Paragraph style={{ marginBottom: 0 }}>{task.description || '暂无描述'}</Paragraph>
        {task.images && task.images.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <ImageGallery images={task.images} />
          </div>
        )}
        {/* 需求 1：创建后可修改重要程度/紧急程度，日历看板便签同步变化 */}
        {(isOwner || isManager) && (
          <div style={{ marginTop: 12 }}>
            <Space size={10} wrap>
              <Text type="secondary" style={{ fontSize: 12 }}>重要程度 / 紧急程度（日历便签联动）：</Text>
              <Select
                size="small"
                style={{ width: 100 }}
                value={task.importance ?? 'important'}
                onChange={(v: Importance) => patchUrgency(v, task.urgencyDegree ?? 'notUrgent')}
                options={Object.entries(IMPORTANCE_META).map(([value, meta]) => ({ value, label: meta.label }))}
              />
              <Select
                size="small"
                style={{ width: 100 }}
                value={task.urgencyDegree ?? 'notUrgent'}
                onChange={(v: UrgencyDegree) => patchUrgency(task.importance ?? 'important', v)}
                options={Object.entries(URGENCY_DEGREE_META).map(([value, meta]) => ({ value, label: meta.label }))}
              />
              {task.urgency && <Tag color={TASK_URGENCY_META[task.urgency].color}>{TASK_URGENCY_META[task.urgency].label}</Tag>}
            </Space>
          </div>
        )}
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={15}>
          {/* 任务内容：管理与创建者可修改，修改需提审 */}
          <Card
            title="任务内容"
            extra={
              canEditContent && !editingContent ? (
                <Button type="link" icon={<EditOutlined />} onClick={() => {
                  contentForm.setFieldsValue({ title: task.title, description: task.description ?? '' })
                  setEditingContent(true)
                }}>
                  修改内容
                </Button>
              ) : null
            }
            style={{ marginBottom: 16 }}
          >
            {editingContent ? (
              <Form form={contentForm} layout="vertical" onFinish={submitContentChange}>
                <Form.Item name="title" label="任务标题" rules={[{ required: true, message: '请输入标题' }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="description" label="任务描述">
                  <Input.TextArea rows={4} />
                </Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit">提交审核</Button>
                  <Button onClick={() => setEditingContent(false)}>取消</Button>
                </Space>
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    提交后需管理人员审核通过才会覆盖正式内容。
                  </Text>
                </div>
              </Form>
            ) : (
              <>
                <Paragraph style={{ marginBottom: 8 }}>{task.description || '暂无描述'}</Paragraph>
                {task.images && task.images.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <ImageGallery images={task.images} />
                  </div>
                )}
                {task.pendingContent && (
                  <Alert
                    type="info"
                    showIcon
                    message={`${task.pendingContent.submittedBy} 提交的内容变更待审核`}
                    description={
                      <div>
                        <div>新标题：{task.pendingContent.title}</div>
                        <div>新描述：{task.pendingContent.description || '（空）'}</div>
                      </div>
                    }
                  />
                )}
              </>
            )}
          </Card>

          {/* 执行记录 */}
          <Card title="执行记录" style={{ marginBottom: 16 }}>
            {task.executionLogs.length === 0 ? (
              <Text type="secondary">还没有执行记录，执行者可在下方记录进展。</Text>
            ) : (
              <Timeline
                items={task.executionLogs.map((l) => ({
                  children: (
                    <div>
                      <Space size={6} wrap>
                        <Text strong style={{ fontSize: 13 }}>{l.authorName}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {dayjs(l.createdAt).format('YYYY-MM-DD HH:mm')}
                        </Text>
                      </Space>
                      <div style={{ marginTop: 2 }}>{l.content}</div>
                      {renderAttachments(l.attachments)}
                    </div>
                  ),
                }))}
              />
            )}
            <Divider style={{ margin: '12px 0' }} />
            <Form form={logForm} layout="vertical" onFinish={addLog}>
              <Form.Item name="content" label="记录执行情况" rules={[{ required: true, message: '请填写执行情况' }]}>
                <Input.TextArea rows={2} placeholder="例如：完成接口联调，剩余埋点待验证" />
              </Form.Item>
              <div style={{ marginBottom: 12 }}>
                <Upload
                  accept="image/*,video/*"
                  showUploadList={false}
                  multiple
                  beforeUpload={makeBeforeUpload(setLogAttachments)}
                >
                  <Button icon={<PlusOutlined />}>上传图片/视频</Button>
                </Upload>
                {logAttachments.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {logAttachments.map((a) => (
                      <div key={a.id} style={{ position: 'relative', width: 80, height: 80 }}>
                        {a.type === 'image' ? (
                          <img
                            src={a.url}
                            alt={a.name}
                            title={a.name}
                            onClick={() => setPreview({ type: 'image', url: a.url })}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6, cursor: 'pointer' }}
                          />
                        ) : (
                          <div
                            onClick={() => setPreview({ type: 'video', url: a.url })}
                            style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 6, overflow: 'hidden', cursor: 'pointer', background: '#000' }}
                          >
                            <video src={a.url} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <PlayCircleOutlined style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: 22, color: 'rgba(255,255,255,0.9)' }} />
                          </div>
                        )}
                        <Button
                          size="small"
                          danger
                          type="text"
                          icon={<span style={{ fontSize: 12 }}>×</span>}
                          onClick={() => removeAttachment(setLogAttachments, logAttachments, a.id)}
                          style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, padding: 0, lineHeight: 1, background: '#fff', borderRadius: '50%' }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>添加记录</Button>
            </Form>
          </Card>

          {/* 评论互动（需求 5） */}
          <Card title={<Space><MessageOutlined />协作沟通</Space>} style={{ marginBottom: 16 }}>
            {task.comments.length === 0 ? (
              <Text type="secondary">还没有评论，项目参与人员可在此沟通协作事宜。</Text>
            ) : (
              <List
                size="small"
                dataSource={task.comments}
                renderItem={(c) => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={<UserOutlined />}
                      title={
                        <Space size={6}>
                          <Text style={{ fontSize: 13 }}>{c.authorName}</Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {dayjs(c.createdAt).format('MM-DD HH:mm')}
                          </Text>
                        </Space>
                      }
                      description={
                        <div>
                          <div>{c.content}</div>
                          {renderAttachments(c.attachments)}
                        </div>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
            <Divider style={{ margin: '12px 0' }} />
            {canComment ? (
              <Form form={commentForm} layout="vertical" onFinish={addComment}>
                <Form.Item name="content" label="发表评论" rules={[{ required: true, message: '请输入评论内容' }]}>
                  <Input.TextArea rows={2} placeholder="沟通问题、请求协助或给出建议" />
                </Form.Item>
                <div style={{ marginBottom: 12 }}>
                  <Upload
                    accept="image/*,video/*"
                    showUploadList={false}
                    multiple
                    beforeUpload={makeBeforeUpload(setCommentAttachments)}
                  >
                    <Button icon={<PlusOutlined />}>上传图片/视频</Button>
                  </Upload>
                  {commentAttachments.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                      {commentAttachments.map((a) => (
                        <div key={a.id} style={{ position: 'relative', width: 80, height: 80 }}>
                          {a.type === 'image' ? (
                            <img
                              src={a.url}
                              alt={a.name}
                              title={a.name}
                              onClick={() => setPreview({ type: 'image', url: a.url })}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6, cursor: 'pointer' }}
                            />
                          ) : (
                            <div
                              onClick={() => setPreview({ type: 'video', url: a.url })}
                              style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 6, overflow: 'hidden', cursor: 'pointer', background: '#000' }}
                            >
                              <video src={a.url} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              <PlayCircleOutlined style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: 22, color: 'rgba(255,255,255,0.9)' }} />
                            </div>
                          )}
                          <Button
                            size="small"
                            danger
                            type="text"
                            icon={<span style={{ fontSize: 12 }}>×</span>}
                            onClick={() => removeAttachment(setCommentAttachments, commentAttachments, a.id)}
                            style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, padding: 0, lineHeight: 1, background: '#fff', borderRadius: '50%' }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <Button type="primary" htmlType="submit">发布评论</Button>
              </Form>
            ) : (
              <Text type="secondary">你不是该项目参与人员，暂不能参与讨论。</Text>
            )}
          </Card>

          {/* 子任务（需求 1：负责人细化；第四批需求 4：右上角"新增子任务"+"删除子任务"两个按钮） */}
          <Card
            title={`子任务（${childTasks.length}）`}
            extra={
              canProposeSubtaskChange ? (
                <Space>
                  <Button type="link" icon={<PlusOutlined />} onClick={() => setAddingSubtask((v) => !v)}>
                    新增子任务
                  </Button>
                  <Popconfirm
                    title="批量删除子任务"
                    description={`将删除 ${childTasks.length} 个子任务；非管理角色进入待审核`}
                    okText="确认"
                    cancelText="取消"
                    disabled={childTasks.length === 0}
                    onConfirm={() => requestDeleteAllSubtasks()}
                  >
                    <Button type="link" danger icon={<DeleteOutlined />} disabled={childTasks.length === 0}>
                      删除子任务
                    </Button>
                  </Popconfirm>
                </Space>
              ) : null
            }
          >
            {addingSubtask && (
              <Form form={subtaskForm} layout="vertical" onFinish={createSubtask} style={{ marginBottom: 16 }}>
                <Form.Item name="title" label="子任务名称" rules={[{ required: true, message: '请输入名称' }]}>
                  <Input placeholder="例如：补充登录埋点" />
                </Form.Item>
                <Form.Item name="description" label="说明（可选）">
                  <Input.TextArea rows={2} />
                </Form.Item>
                <Form.Item name="mode" label="执行方式" initialValue="self">
                  <Segmented
                    options={[
                      { value: 'self', label: '独立完成' },
                      { value: 'other', label: '需他人承接' },
                    ]}
                  />
                </Form.Item>
                <div style={{ marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    子任务需拆到一人执行的颗粒度：每个子任务仅支持一人承接执行；多人协作请拆成多个子任务。
                  </Text>
                </div>
                <Form.Item noStyle shouldUpdate={(prev, cur) => prev.mode !== cur.mode}>
                  {({ getFieldValue }) =>
                    getFieldValue('mode') === 'other' ? (
                      <Form.Item name="assigneeId" label="推荐承接人" rules={[{ required: true, message: '请选择推荐承接人' }]}>
                        <Select
                          placeholder="选择推荐的承接人，管理审核后生效"
                          options={mockUsers.filter((u) => u.id !== mockMe.id).map((u) => ({ value: u.id, label: u.displayName }))}
                        />
                      </Form.Item>
                    ) : null
                  }
                </Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit">创建</Button>
                  <Button onClick={() => setAddingSubtask(false)}>取消</Button>
                </Space>
              </Form>
            )}
            {childTasks.length === 0 ? (
              <Empty description="暂无子任务" />
            ) : (
              <List
                size="small"
                dataSource={childTasks}
                renderItem={(s) => {
                  const hasSubChildren = tasks.some((t) => t.parentId === s.id)
                  return (
                    <List.Item
                      actions={[
                        <Link key="open" to={hasSubChildren ? `/tasks/${s.id}` : `/tasks/${s.id}/execution`}>
                          <Button type="link" size="small">
                            {hasSubChildren ? '查看详情' : '打开执行页'}
                          </Button>
                        </Link>,
                        // 需求 9：父级任务承接人/管理人员可删除子任务（普通成员删除走管理审核）
                        ...((isOwner || isManager) && s.status !== 'done'
                          ? [
                              <Popconfirm
                                key="del"
                                title="确认删除该子任务？"
                                description={isManager ? '将删除子任务并移除流程节点' : '删除需管理人员审核通过后生效'}
                                onConfirm={() => requestDeleteSubtask(s)}
                              >
                                <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
                              </Popconfirm>,
                            ]
                          : []),
                      ]}
                    >
                      <List.Item.Meta
                        title={
                          <Space wrap size={4}>
                            <Text>{s.title}</Text>
                            <Tag>{statusLabels[s.status]}</Tag>
                            {s.approvalStatus === 'pending' && <Tag color="gold">待审核</Tag>}
                          </Space>
                        }
                        description={
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            负责人：{userName(s.assigneeId)}
                            {s.recommendedAssigneeId ? ` · 推荐承接人：${userName(s.recommendedAssigneeId)}` : ''}
                            {hasSubChildren && ' · 含子任务'}
                          </Text>
                        }
                      />
                    </List.Item>
                  )
                }}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={9}>
          {/* 状态与完成（需求 6） */}
          <Card title="执行状态" style={{ marginBottom: 16 }}>
            <Descriptions column={1} size="small" style={{ marginBottom: 12 }}>
              <Descriptions.Item label="负责人">{userName(task.assigneeId)}</Descriptions.Item>
              <Descriptions.Item label="创建人">{userName(task.createdBy)}</Descriptions.Item>
              <Descriptions.Item label="当前状态">{statusLabels[task.status]}</Descriptions.Item>
              {task.startAt && (
                <Descriptions.Item label="排期">
                  {dayjs(task.startAt).format('MM-DD HH:mm')} ~ {dayjs(task.endAt ?? task.dueAt).format('MM-DD HH:mm')}
                </Descriptions.Item>
              )}
            </Descriptions>
            {isOwner || isManager ? (
              <Segmented
                block
                value={task.status === 'blocked' ? 'in_progress' : task.status}
                onChange={(v) => changeStatus(v as TaskStatus)}
                options={[
                  { value: 'todo', label: '待执行' },
                  { value: 'in_progress', label: '执行中' },
                  // 注：「已完成」不在此直选，必须走下方「提报任务完成」门禁（填完成时间+总结+管理审核）
                ]}
              />
            ) : null}
            <div style={{ marginTop: 12 }}>
              {isManager && (
                <Button
                  block
                  icon={<UserOutlined />}
                  style={{ marginBottom: 8 }}
                  onClick={() => {
                    reassignForm.setFieldsValue({ assigneeId: task.assigneeId ?? undefined })
                    setReassignOpen(true)
                  }}
                >
                  重新指派承接人
                </Button>
              )}
              {task.status !== 'done' && (isOwner || isManager) && (
                <Button
                  type="primary"
                  block
                  icon={<CheckCircleOutlined />}
                  onClick={() => {
                    completeForm.resetFields()
                    completeForm.setFieldsValue({ tags: ['按计划完成'], completedAt: dayjs() })
                    setCompleting(true)
                  }}
                >
                  提报任务完成
                </Button>
              )}
              {task.completion && task.status !== 'done' && (
                <Alert
                  style={{ marginTop: 12 }}
                  type="info"
                  showIcon
                  message="已提报完成，等待管理审核"
                  description={
                    <div>
                      <div>完成时间：{task.completion.completedAt}</div>
                      <div>标签：{task.completion.tags.join('、')}</div>
                    </div>
                  }
                />
              )}
            </div>
          </Card>

          {/* 第四批需求 4：执行页右侧新增关键信息（所属项目 / 所属父级任务 / 项目参与人员 / 父级任务负责人） */}
          <Card title="所属架构" style={{ marginBottom: 16 }} size="small">
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              {/* 所属项目（任务有 projectId 时显示，kind=project 时跳详情页，否则跳看板） */}
              {task.projectId && (
                <Space size={6} wrap>
                  <Text type="secondary" style={{ fontSize: 12, minWidth: 84 }}>所属项目：</Text>
                  {projectTask ? (
                    <Link to={`/projects/${projectTask.id}`} style={{ color: 'var(--accent-purple)', fontWeight: 600 }}>
                      {projectTask.title}
                    </Link>
                  ) : (
                    <Link to={`/projects/${task.projectId}/board?taskId=${task.id}`}>看板</Link>
                  )}
                </Space>
              )}
              {/* 所属父级任务 */}
              {parentTask && (
                <Space size={6} wrap>
                  <Text type="secondary" style={{ fontSize: 12, minWidth: 84 }}>所属父级任务：</Text>
                  <Link to={`/tasks/${parentTask.id}`} style={{ color: 'var(--accent-cyan)' }}>
                    {parentTask.title}
                  </Link>
                </Space>
              )}
              {/* 项目参与人员（project.kind==='project' 时显示） */}
              {projectTask && (
                <Space size={6} wrap>
                  <Text type="secondary" style={{ fontSize: 12, minWidth: 84 }}>项目参与人员：</Text>
                  <Text style={{ fontSize: 12 }}>
                    {userName(projectTask.assigneeId)}
                    {projectTask.assigneeId && projectTask.createdBy && projectTask.createdBy !== projectTask.assigneeId && (
                      <Tag style={{ marginLeft: 4 }}>{userName(projectTask.createdBy)} 创建人</Tag>
                    )}
                  </Text>
                </Space>
              )}
              {/* 父级任务负责人 */}
              {parentTask && (
                <Space size={6} wrap>
                  <Text type="secondary" style={{ fontSize: 12, minWidth: 84 }}>父级任务负责人：</Text>
                  <Text style={{ fontSize: 12, fontWeight: 600 }}>
                    {userName(parentTask.assigneeId)}
                    {parentTask.assigneeId === mockMe.id && <Tag color="cyan" style={{ marginLeft: 4 }}>我</Tag>}
                  </Text>
                </Space>
              )}
              {!task.projectId && !parentTask && (
                <Text type="secondary" style={{ fontSize: 12 }}>本任务为独立任务，无上级架构。</Text>
              )}
            </Space>
          </Card>

          {/* 需求 5：每日节点规划 —— 周期超过一天的任务可自行设置每日完成时间节点，随时调整 */}
          {spansMoreThanOneDay(task) && (
            <Card title="每日节点规划" style={{ marginBottom: 16 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                任务周期 {dayjs(task.startAt).format('MM-DD')} ~ {dayjs(task.endAt).format('MM-DD')}（超过一天），可按天设置完成时间节点，随时调整；今日聚焦将按节点展示。
              </Text>
              <Divider style={{ margin: '12px 0' }} />
              {task.dailyPlans.length === 0 ? (
                <Text type="secondary">还没有规划节点，请在下方添加。</Text>
              ) : (
                <List
                  size="small"
                  dataSource={[...task.dailyPlans].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))}
                  renderItem={(n) => (
                    <List.Item
                      actions={[
                        <Button
                          key="del"
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => removeDailyPlan(n.id)}
                        />,
                      ]}
                      style={{ padding: '6px 0' }}
                    >
                      <Space size={8}>
                        <Checkbox checked={n.done} onChange={() => toggleDailyPlan(n.id)} />
                        <div>
                          <div style={{ fontSize: 13, textDecoration: n.done ? 'line-through' : undefined, color: n.done ? 'var(--text-secondary)' : undefined }}>
                            <Text strong style={{ fontSize: 13 }}>{n.date}</Text>
                            <Tag style={{ marginLeft: 8, fontSize: 11 }} color="blue">{n.time}</Tag>
                          </div>
                          <Text type="secondary" style={{ fontSize: 12 }}>{n.goal}</Text>
                        </div>
                      </Space>
                    </List.Item>
                  )}
                />
              )}
              <Divider style={{ margin: '12px 0' }} />
              <Form form={dailyPlanForm} layout="inline" onFinish={addDailyPlan} style={{ rowGap: 8 }}>
                <Form.Item name="date" rules={[{ required: true, message: '选日期' }]}>
                  <DatePicker
                    size="small"
                    placeholder="日期"
                    disabledDate={(d) => {
                      const start = dayjs(task.startAt).startOf('day')
                      const end = dayjs(task.endAt).endOf('day')
                      return d.isBefore(start) || d.isAfter(end)
                    }}
                  />
                </Form.Item>
                <Form.Item name="time" rules={[{ required: true, message: '选时间' }]}>
                  <TimePicker size="small" format="HH:mm" placeholder="时间节点" minuteStep={5} />
                </Form.Item>
                <Form.Item name="goal" rules={[{ required: true, message: '填写当日完成目标' }]}>
                  <Input size="small" style={{ width: 180 }} placeholder="当日完成目标" />
                </Form.Item>
                <Form.Item>
                  <Button size="small" type="primary" icon={<PlusOutlined />} htmlType="submit">添加节点</Button>
                </Form.Item>
              </Form>
            </Card>
          )}

          {/* 任务流程（需求 4：树形图，承接人可随时改；管理审核期可最终改；需求 5：继承父级展示） */}
          <Card title="任务流程 (SOP)" style={{ marginBottom: 16 }}>
            {(() => {
              const hit = effectiveSop(tasks, task)
              return (
                <SopFlowTree
                  steps={hit?.flow.steps ?? null}
                  source={hit?.flow.source}
                  inheritedFrom={hit && hit.owner.id !== task.id ? hit.owner.title : null}
                  editable={canEditSop}
                  onChange={(steps) => applySopChange(steps)}
                  onAiGenerate={() => sopMutation.mutate()}
                  aiLoading={sopMutation.isPending}
                  onGenerateTask={(node) => openGenerateFromSop(node)}
                />
              )
            })()}
          </Card>

          {/* 审核区（需求 3） */}
          {isManager && pendingApproval && (
            <Card title="审核" style={{ marginBottom: 16 }}>
              <Text type="secondary">
                待审事项：{task.approvalType ? APPROVAL_TYPE_META[task.approvalType].label : '待审'}
              </Text>
              <Divider style={{ margin: '12px 0' }} />
              {task.approvalType === 'content' && (
                <Space>
                  <Button type="primary" onClick={() => approveContent(true)}>通过变更</Button>
                  <Button danger onClick={() => approveContent(false)}>驳回</Button>
                </Space>
              )}
              {task.approvalType === 'completion' && (
                <Space>
                  <Button type="primary" onClick={() => approveCompletion(true)}>通过完成</Button>
                  <Button danger onClick={() => approveCompletion(false)}>驳回</Button>
                </Space>
              )}
              {task.approvalType === 'assign' && (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text style={{ fontSize: 12 }}>
                    推荐承接人：{userName(task.recommendedAssigneeId)}
                  </Text>
                  <Space>
                    <Button
                      type="primary"
                      onClick={() => {
                        patch((t) => ({
                          ...t,
                          assigneeId: t.recommendedAssigneeId,
                          approvalStatus: 'approved',
                          updatedAt: new Date().toISOString(),
                        }))
                        message.success('承接人已生效')
                      }}
                    >
                      通过并指派
                    </Button>
                    <Button
                      danger
                      onClick={() => {
                        patch((t) => ({ ...t, approvalStatus: 'rejected', updatedAt: new Date().toISOString() }))
                        message.success('已驳回')
                      }}
                    >
                      驳回
                    </Button>
                  </Space>
                </Space>
              )}
              {isManager && (
                <Button block style={{ marginTop: 12 }} icon={<EditOutlined />} onClick={() => { managerEditForm.setFieldsValue({ title: task.title, description: task.description ?? '', assigneeId: task.assigneeId ?? undefined }); setManagerEditOpen(true) }}>
                  修改任务内容 / 承接人
                </Button>
              )}
            </Card>
          )}

          {/* 参与人员（需求 5） */}
          <Card title={`项目参与人员（${participants.size}）`}>
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              {[...participants].map((uid) => (
                <Space key={uid} size={6}>
                  <UserOutlined />
                  <Text style={{ fontSize: 13 }}>{userName(uid)}</Text>
                  {uid === task.assigneeId && <Tag color="blue">负责人</Tag>}
                  {uid === task.createdBy && <Tag>创建人</Tag>}
                </Space>
              ))}
            </Space>
          </Card>
        </Col>
      </Row>

      {/* 完成提报弹窗（需求 6/7） */}
      <Form form={completeForm} layout="vertical" onFinish={submitCompletion}>
        <Modal
          title="提报任务完成"
          open={completing}
          onCancel={() => setCompleting(false)}
          onOk={() => completeForm.submit()}
          okText="提交审核"
          cancelText="取消"
          width={720}
          destroyOnHidden
        >
          <Form.Item name="tags" label="完成标签" rules={[{ required: true, message: '请选择完成标签' }]}>
            <Select mode="multiple" options={COMPLETION_TAGS.map((t) => ({ value: t, label: t }))} />
          </Form.Item>
          <Form.Item
            name="completedAt"
            label="完成时间（精确到分钟）"
            rules={[{ required: true, message: '请选择完成时间' }]}
          >
            <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} />
          </Form.Item>
          <div style={{ marginBottom: 12 }}>
            <Space>
              {/* 需求 7：AI 根据执行页信息生成总结 */}
              <Button
                icon={<RobotOutlined />}
                onClick={() => reportMutation.mutate()}
                loading={reportMutation.isPending}
              >
                AI 生成总结
              </Button>
              {aiReport && (
                <Tag color={aiReport.source === 'agent' ? 'green' : 'default'}>
                  {aiReport.source === 'agent' ? 'Agent 生成' : '规则生成'}
                </Tag>
              )}
            </Space>
          </div>
          <Form.Item name="summary" label="任务总结" rules={[{ required: true, message: '请填写任务总结' }]}>
            <Input.TextArea rows={3} placeholder="完成情况概述" />
          </Form.Item>
          <Form.Item name="notes" label="执行注意点" rules={[{ required: true, message: '请填写执行注意点' }]}>
            <Input.TextArea rows={2} placeholder="过程中的关键判断、踩坑与注意事项" />
          </Form.Item>
          <Form.Item name="sopImprovement" label="SOP 优化" rules={[{ required: true, message: '请填写 SOP 优化建议' }]}>
            <Input.TextArea rows={2} placeholder="对该类任务标准流程的优化建议" />
          </Form.Item>
          <Form.Item name="suggestions" label="优化建议" rules={[{ required: true, message: '请填写优化建议' }]}>
            <Input.TextArea rows={2} placeholder="下次可改进的地方" />
          </Form.Item>
        </Modal>
      </Form>

      {/* 管理重新指派承接人（需求 1） */}
      <Form form={reassignForm} layout="vertical" onFinish={reassignOwner}>
        <Modal
          title="重新指派承接人"
          open={reassignOpen}
          onCancel={() => setReassignOpen(false)}
          onOk={() => reassignForm.submit()}
          okText="确认改派"
          cancelText="取消"
          destroyOnHidden
        >
          <Form.Item name="assigneeId" label="新的承接人" rules={[{ required: true, message: '请选择承接人' }]}>
            <Select
              placeholder="选择新的承接人"
              options={mockUsers.map((u) => ({ value: u.id, label: u.displayName }))}
            />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 12 }}>
            管理改派立即生效，承接人将成为该任务的负责人并可继续细化子任务。
          </Text>
        </Modal>
      </Form>

      {/* 管理审核修改（需求 2/4：管理在审核期直接改任务内容/承接人/执行人） */}
      <Form form={managerEditForm} layout="vertical" onFinish={submitManagerEdit}>
        <Modal
          title="管理审核修改"
          open={managerEditOpen}
          onCancel={() => setManagerEditOpen(false)}
          onOk={() => managerEditForm.submit()}
          okText="保存修改"
          cancelText="取消"
          destroyOnHidden
        >
          <Form.Item name="title" label="任务标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="任务描述">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="assigneeId" label="承接人">
            <Select allowClear placeholder="选择承接人" options={mockUsers.map((u) => ({ value: u.id, label: u.displayName }))} />
          </Form.Item>
        </Modal>
      </Form>

      {/* 需求 1：图片/视频预览弹窗 */}
      <Modal
        open={!!preview}
        footer={null}
        onCancel={() => setPreview(null)}
        width={preview?.type === 'video' ? 720 : 480}
        title={preview?.type === 'image' ? '图片预览' : '视频播放'}
        destroyOnHidden
      >
        {preview?.type === 'image' ? (
          <img src={preview.url} alt="preview" style={{ width: '100%' }} />
        ) : preview ? (
          <video src={preview.url} controls autoPlay style={{ width: '100%' }} />
        ) : null}
      </Modal>

      {/* 第四批需求 3：基于流程节点生成子任务（管理人员审核后该任务升级为父任务，子任务同时发布） */}
      <Modal
        open={generateOpen}
        title={generateTarget ? `基于「${generateTarget.title}」生成子任务` : '生成子任务'}
        onCancel={() => { setGenerateOpen(false); setGenerateTarget(null) }}
        onOk={submitGenerateFromSop}
        okText={isManager ? '生成并发布' : '提报审核'}
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={generateForm} layout="vertical">
          <Form.Item name="title" label="子任务标题" rules={[{ required: true, message: '请输入子任务标题' }]}>
            <Input placeholder="例如：完成接口联调" />
          </Form.Item>
          <Form.Item name="description" label="说明（可选）">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="mode" label="执行方式" initialValue="self">
            <Segmented
              options={[
                { value: 'self', label: '我独立完成' },
                { value: 'other', label: '推荐他人承接' },
              ]}
            />
          </Form.Item>
          <Form.Item shouldUpdate={(prev, cur) => prev.mode !== cur.mode} noStyle>
            {({ getFieldValue }) =>
              getFieldValue('mode') === 'other' ? (
                <Form.Item name="assigneeId" label="推荐承接人" rules={[{ required: true, message: '请选择推荐承接人' }]}>
                  <Select
                    placeholder="选择推荐的承接人，管理审核后生效"
                    options={mockUsers.filter((u) => u.id !== mockMe.id).map((u) => ({ value: u.id, label: u.displayName }))}
                  />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Alert
            type={isManager ? 'success' : 'info'}
            showIcon
            message={isManager ? '管理角色直接生成并发布到任务协作列表，本任务升级为父任务' : '子任务需管理人员审核通过后生效；审核通过后该任务升级为父任务'}
            style={{ marginTop: 8 }}
          />
        </Form>
      </Modal>
    </div>
  )
}
