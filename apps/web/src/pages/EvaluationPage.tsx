/**
 * 职责：智能评估页 —— 第六批需求 2：管理 / 成员切割
 *
 * 管理版：Tab1 任务推荐（选项目→任务→生成 Top-3 候选人，多因子规则引擎）/ 我的画像 / 项目统计
 * 成员版：Tab1 为我推荐 —— 基于自身多因子加权（技能 40% + 绩效 30% + 负载 20% + 复杂度 10%）
 *         推荐合适的执行任务；展示任务全部上级关系（项目 → 根任务 → … → 父任务），
 *         点击事项名称进入项目详情页/任务执行页；可承接，承接需管理人员审核通过后生效。
 */
import { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Progress,
  Radio,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import { CheckCircleOutlined, EditOutlined, ReloadOutlined, SaveOutlined, ThunderboltOutlined, UserOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { projectApi } from '@/api/projectApi'
import { evaluationApi } from '@/api/evaluationApi'
import { getErrorMessage } from '@/api/errors'
import ErrorView from '@/components/ErrorView'
import LoadingView from '@/components/LoadingView'
import MemberStatsTable from '@/components/MemberStatsTable'
import RecommendCard from '@/components/RecommendCard'
import { useCurrentRole } from '@/hooks/useCurrentRole'
import { useWorkspaceTasks } from '@/hooks/useWorkspaceTasks'
import { useDirectory, useMe } from '@/hooks/useWorkspaceIdentity'
import { taskRoute } from '@/utils/taskTree'
import type { CandidateScore, ComplexityTier, MemberDayEntry, MemberProfile, UpdateProfileInput, WorkspaceTask } from '@/types'

const { Title, Text } = Typography

const TIER_META: Record<ComplexityTier, { label: string; color: string }> = {
  low: { label: '低', color: 'green' },
  medium: { label: '中', color: 'orange' },
  high: { label: '高', color: 'red' },
}

const TAG_SUGGESTIONS = ['前端', '后端', '设计', '原型', '测试', '基建', '调研', '架构', '接入', '运维', '数据']

const pct = (n: number) => `${Math.round(n * 100)}%`

function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => projectApi.listProjects({ page: 1, pageSize: 100 }),
    retry: false,
  })
}

// ─────────────────────────── Tab1 任务推荐（管理版：项目 → 父级任务 → 普通任务三级级联 + 指派承接） ───────────────────────────

const NONE_VALUE = '__none__'

function RecommendTab() {
  const { nameOf } = useDirectory()
  const [tasks, setTasks] = useWorkspaceTasks()
  const [projectId, setProjectId] = useState<string>(NONE_VALUE)
  const [parentId, setParentId] = useState<string>(NONE_VALUE)
  const [taskId, setTaskId] = useState<string>()

  const recommendMutation = useMutation({
    mutationFn: (tid: string) => evaluationApi.getTaskRecommendation(tid),
  })

  // 父级任务集合（含下级子任务的主任务）
  const parentIdSet = useMemo(
    () => new Set(tasks.filter((t) => tasks.some((x) => x.parentId === t.id)).map((t) => t.id)),
    [tasks],
  )
  const isParent = (t: WorkspaceTask) => parentIdSet.has(t.id)

  // 项目选项：工作台中 kind=project 的项目任务（排除已完成/已取消）+「无」
  const projectOptions = useMemo(() => {
    const list = tasks
      .filter((t) => t.kind === 'project' && t.status !== 'done' && t.status !== 'cancelled')
      .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
    return [
      { value: NONE_VALUE, label: '无（无项目归属）' },
      ...list.map((t) => ({ value: t.id, label: t.title })),
    ]
  }, [tasks])

  // 父级任务选项：在已选项目范围内、且存在子任务的任务 +「无」
  const parentOptions = useMemo(() => {
    const list = tasks
      .filter(
        (t) =>
          isParent(t) &&
          t.kind === 'task' &&
          (projectId === NONE_VALUE ? !t.projectId : t.projectId === projectId) &&
          (t.status === 'todo' || t.status === 'in_progress'),
      )
      .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
    return [
      { value: NONE_VALUE, label: '无（无父级任务）' },
      ...list.map((t) => ({ value: t.id, label: t.title })),
    ]
  }, [tasks, parentIdSet, projectId])

  // 普通任务（叶子任务）候选池：待办/进行中、非父级任务
  const ordinaryCandidates = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.kind === 'task' &&
          !isParent(t) &&
          (t.status === 'todo' || t.status === 'in_progress'),
      ),
    [tasks, parentIdSet],
  )

  // 普通任务选项：按已选项目 + 已选父级任务级联过滤
  const taskOptions = useMemo(() => {
    return ordinaryCandidates
      .filter(
        (t) =>
          (projectId === NONE_VALUE ? !t.projectId : t.projectId === projectId) &&
          (parentId === NONE_VALUE ? !t.parentId : t.parentId === parentId),
      )
      .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
  }, [ordinaryCandidates, projectId, parentId])

  const taskOf = (id?: string) => ordinaryCandidates.find((t) => t.id === id)
  const result = recommendMutation.data

  /** 管理版「指派承接」：直接把候选人指派为任务承接人，立即生效（无需审核） */
  const assign = (candidate: CandidateScore) => {
    if (!taskId) return
    const tid = taskId
    const t = taskOf(tid)
    // 待审事项只能经审核命令结算（D-07 二期写入守卫），直接指派会被服务端拒绝
    if (t?.approvalStatus === 'pending') {
      message.warning('该任务有待审事项，请先在审核中心处理后再指派')
      return
    }
    setTasks((c) =>
      c.map((x) =>
        x.id === tid
          ? {
              ...x,
              assigneeId: candidate.userId,
              status: x.status === 'todo' ? 'in_progress' : x.status,
              approvalStatus: 'approved' as const,
              approvalType: null,
              recommendedAssigneeId: null,
              updatedAt: new Date().toISOString(),
            }
          : x,
      ),
    )
    const name = nameOf(candidate.userId) ?? candidate.displayName
    message.success(`已指派 ${name} 承接「${t?.title ?? '任务'}」`)
  }

  return (
    <Card>
      <Row gutter={[12, 12]} align="middle" style={{ marginBottom: 20 }}>
        <Col xs={24} sm={8}>
          <Select
            placeholder="选择项目"
            style={{ width: '100%' }}
            showSearch
            optionFilterProp="label"
            value={projectId}
            onChange={(v) => {
              setProjectId(v)
              setParentId(NONE_VALUE)
              setTaskId(undefined)
              recommendMutation.reset()
            }}
            options={projectOptions}
          />
        </Col>
        <Col xs={24} sm={8}>
          <Select
            placeholder="选择父级任务"
            style={{ width: '100%' }}
            showSearch
            optionFilterProp="label"
            value={parentId}
            onChange={(v) => {
              setParentId(v)
              setTaskId(undefined)
              recommendMutation.reset()
            }}
            options={parentOptions}
          />
        </Col>
        <Col xs={24} sm={8}>
          <Select
            placeholder="选择普通任务"
            style={{ width: '100%' }}
            showSearch
            optionFilterProp="label"
            value={taskId}
            onChange={(v) => {
              setTaskId(v)
              recommendMutation.reset()
            }}
            options={taskOptions.map((t) => ({
              value: t.id,
              label: t.title,
            }))}
          />
        </Col>
        <Col span={24}>
          <Button type="primary" icon={<ThunderboltOutlined />} loading={recommendMutation.isPending} disabled={!taskId} block onClick={() => recommendMutation.mutate(taskId!)}>生成推荐</Button>
        </Col>
      </Row>

      {recommendMutation.isError && <ErrorView error={recommendMutation.error} onRetry={() => taskId && recommendMutation.mutate(taskId)} />}
      {!result && !recommendMutation.isPending && !recommendMutation.isError && (
        <Empty description={<Text type="secondary">按「项目 → 父级任务 → 普通任务」级联选择后点击「生成推荐」；如要选择没有上级的任务，父级任务选择「无」即可。系统将按 技能 40% + 绩效 30% + 负载 20% + 复杂度 10% 计算 Top-3 候选人</Text>} />
      )}

      {result && (
        <div>
          {result.coldStart && (
            <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="冷启动 · 自评画像模式" description="所有候选成员暂无历史完成记录，推荐基于自评画像（技能标签 + 复杂度档位）与中性分计算，建议先完善「我的画像」再人工复核。" />
          )}
          <Row align="middle" style={{ marginBottom: 16 }}>
            <Col flex="auto">
              <Space wrap>
                <Text strong style={{ color: 'var(--text-primary)' }}>{result.taskTitle}</Text>
                {result.taskTags.map(tag => <Tag key={tag}>{tag}</Tag>)}
                <Tag color={TIER_META[result.taskComplexity].color}>复杂度 {TIER_META[result.taskComplexity].label}</Tag>
              </Space>
            </Col>
            <Col>
              <Text type="secondary" style={{ fontSize: 12 }}>分数越高越匹配 · 管理可直接指派承接</Text>
            </Col>
          </Row>
          {result.candidates.length === 0 ? (
            <Empty description="暂无可推荐成员" />
          ) : (
            <Row gutter={[16, 16]}>
              {result.candidates.map((c, i) => (
                <Col key={c.userId} xs={24} md={12} xl={8}>
                  <RecommendCard candidate={c} rank={i} onAssign={assign} />
                </Col>
              ))}
            </Row>
          )}
        </div>
      )}
    </Card>
  )
}

// ─────────────────────────── Tab1 为我推荐（成员版，第六批需求 2） ───────────────────────────

interface ScoredTask {
  task: WorkspaceTask
  total: number
  skill: number
  performance: number
  load: number
  complexity: number
  /** 任务的估计复杂度档位 */
  taskTier: ComplexityTier
}

/** 任务估时 → 复杂度档位（h：<8 低 / <24 中 / ≥24 高） */
function taskTierOf(t: WorkspaceTask): ComplexityTier {
  const h = t.estimatedHours ?? 2
  return h >= 24 ? 'high' : h >= 8 ? 'medium' : 'low'
}

const TIER_ORDER: ComplexityTier[] = ['low', 'medium', 'high']

/** 档位匹配度：同档 1 / 差一档 0.6 / 差两档 0.3；我的档位未设置给中性 0.6 */
function tierFit(myTier: ComplexityTier | null, taskTier: ComplexityTier): number {
  if (!myTier) return 0.6
  const gap = Math.abs(TIER_ORDER.indexOf(myTier) - TIER_ORDER.indexOf(taskTier))
  return gap === 0 ? 1 : gap === 1 ? 0.6 : 0.3
}

function MyRecommendTab() {
  const currentUser = useMe()
  const navigate = useNavigate()
  const [tasks, setTasks] = useWorkspaceTasks()
  const [topN, setTopN] = useState(5)
  const [claimedIds, setClaimedIds] = useState<Set<string>>(new Set())

  const profileQuery = useQuery({
    queryKey: ['my-profile-recommend'],
    queryFn: () => evaluationApi.getMyProfile(),
    retry: false,
  })
  const profile: MemberProfile | undefined = profileQuery.data

  /** 候选任务：未承接、待办、非项目/评审/草稿 */
  const candidates = useMemo(
    () => tasks.filter((t) => !t.isDraft && t.kind === 'task' && t.status === 'todo' && !t.assigneeId),
    [tasks],
  )

  /** 多因子加权打分（技能 40% + 绩效 30% + 负载 20% + 复杂度 10%） */
  const scored = useMemo<ScoredTask[]>(() => {
    const myTags = profile?.skillTags ?? []
    const myTier = profile?.complexityTier ?? null
    const stats = profile?.stats
    const performance = stats ? stats.completionRate * 0.5 + stats.onTimeRate * 0.5 : 0.6
    const activeLoad = stats?.activeLoad ?? 0
    const load = 1 / (1 + activeLoad / 5)

    return candidates
      .map((task) => {
        const taskTags = (task.tags ?? []).filter((x) => x !== '团队协作' && x !== '独立任务' && x !== '团队协作项目' && x !== '项目任务')
        const skill = myTags.length === 0 || taskTags.length === 0
          ? 0.6
          : taskTags.filter((tag) => myTags.some((m) => tag.includes(m) || m.includes(tag))).length / taskTags.length
        const taskTier = taskTierOf(task)
        const complexity = tierFit(myTier, taskTier)
        const total = skill * 0.4 + performance * 0.3 + load * 0.2 + complexity * 0.1
        return { task, total, skill, performance, load, complexity, taskTier }
      })
      .sort((a, b) => b.total - a.total)
  }, [candidates, profile])

  const top = scored.slice(0, topN)

  /** 上级关系链：项目（kind=project）→ 根任务 → … → 直接父任务（从根到近） */
  const chainOf = (task: WorkspaceTask): { level: 'project' | 'task'; id: string; title: string }[] => {
    const chain: { level: 'project' | 'task'; id: string; title: string }[] = []
    // 所属项目
    const project = task.projectId ? tasks.find((t) => t.id === task.projectId && t.kind === 'project') : undefined
    if (project) chain.push({ level: 'project', id: project.id, title: project.title })
    // 父级任务链（根 → 近）
    const ancestors: WorkspaceTask[] = []
    let cursor = task.parentId ? tasks.find((t) => t.id === task.parentId) : undefined
    while (cursor) {
      ancestors.unshift(cursor)
      cursor = cursor.parentId ? tasks.find((t) => t.id === cursor!.parentId) : undefined
    }
    ancestors.forEach((a) => chain.push({ level: 'task', id: a.id, title: a.title }))
    return chain
  }

  /** 承接：进入待审核（approvalType assign），管理审核通过后生效 */
  const claim = (task: WorkspaceTask) => {
    setTasks((c) =>
      c.map((t) =>
        t.id === task.id
          ? {
              ...t,
              recommendedAssigneeId: currentUser.id,
              approvalStatus: 'pending' as const,
              approvalType: 'assign' as const,
              updatedAt: new Date().toISOString(),
            }
          : t,
      ),
    )
    setClaimedIds((c) => new Set(c).add(task.id))
    message.success(`已申请承接「${task.title}」，待管理人员审核通过后生效`)
  }

  if (profileQuery.isLoading) return <LoadingView height={300} tip="正在加载你的画像以计算匹配…" />
  if (profileQuery.isError) return <ErrorView error={profileQuery.error} onRetry={() => profileQuery.refetch()} />

  const myTier = profile?.complexityTier ?? null

  return (
    <Card>
      <Row align="middle" style={{ marginBottom: 16 }}>
        <Col flex="auto">
          <Space wrap>
            <Text strong>按你的画像加权推荐（技能 40% + 绩效 30% + 负载 20% + 复杂度 10%）</Text>
            {myTagsView(profile)}
            {myTier && <Tag color={TIER_META[myTier].color}>我的档位 {TIER_META[myTier].label}</Tag>}
          </Space>
        </Col>
        <Col>
          <Select value={topN} style={{ width: 110 }} onChange={setTopN} options={[3, 5, 10].map((n) => ({ value: n, label: `Top ${n}` }))} />
        </Col>
      </Row>

      {top.length === 0 ? (
        <Empty description={candidates.length === 0 ? '当前没有待承接的任务' : '暂无可推荐任务'} />
      ) : (
        <Row gutter={[16, 16]}>
          {top.map((s, i) => {
            const chain = chainOf(s.task)
            const claimed = claimedIds.has(s.task.id) || s.task.approvalStatus === 'pending'
            return (
              <Col key={s.task.id} xs={24} lg={12}>
                <Card
                  size="small"
                  title={
                    <Space wrap size={6}>
                      <Tag color="gold">#{i + 1}</Tag>
                      {/* 需求 2：点击事项名称进入任务执行页/详情页 */}
                      <a onClick={() => navigate(taskRoute(tasks, s.task))} style={{ fontWeight: 600 }}>{s.task.title}</a>
                    </Space>
                  }
                  extra={<Tag color={s.total >= 0.7 ? 'green' : s.total >= 0.5 ? 'orange' : 'default'}>匹配度 {pct(s.total)}</Tag>}
                >
                  {/* 上级关系链（需求 2：展示该任务所有上级关系，可点击） */}
                  {chain.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>上级关系：</Text>
                      <Space wrap size={4}>
                        {chain.map((node, idx) => (
                          <Space key={node.id} size={4}>
                            {idx > 0 && <Text type="secondary" style={{ fontSize: 11 }}>→</Text>}
                            {node.level === 'project' ? (
                              <Link to={`/projects/${node.id}`} style={{ fontSize: 12 }}>
                                <Tag color="purple" style={{ fontSize: 11, cursor: 'pointer' }}>项目 · {node.title}</Tag>
                              </Link>
                            ) : (
                              <a onClick={() => navigate(`/tasks/${node.id}`)}>
                                <Tag color="blue" style={{ fontSize: 11, cursor: 'pointer' }}>父级 · {node.title}</Tag>
                              </a>
                            )}
                          </Space>
                        ))}
                      </Space>
                    </div>
                  )}

                  {/* 因子明细 */}
                  <Row gutter={8} style={{ marginBottom: 10 }}>
                    <Col span={6}><Tooltip title="技能匹配 40% 权重"><Statistic title={<span style={{ fontSize: 11 }}>技能 40%</span>} value={pct(s.skill)} valueStyle={{ fontSize: 15 }} /></Tooltip></Col>
                    <Col span={6}><Tooltip title="历史绩效 30% 权重"><Statistic title={<span style={{ fontSize: 11 }}>绩效 30%</span>} value={pct(s.performance)} valueStyle={{ fontSize: 15 }} /></Tooltip></Col>
                    <Col span={6}><Tooltip title="负载余量 20% 权重（活跃越少分越高）"><Statistic title={<span style={{ fontSize: 11 }}>负载 20%</span>} value={pct(s.load)} valueStyle={{ fontSize: 15 }} /></Tooltip></Col>
                    <Col span={6}><Tooltip title="复杂度匹配 10% 权重"><Statistic title={<span style={{ fontSize: 11 }}>复杂度 10%</span>} value={pct(s.complexity)} valueStyle={{ fontSize: 15 }} /></Tooltip></Col>
                  </Row>
                  <Progress percent={Math.round(s.total * 100)} size="small" showInfo={false} strokeColor="var(--accent-cyan)" />

                  <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Space wrap size={4}>
                      <Tag>{(s.task.tags ?? []).filter((x) => !['团队协作', '独立任务', '团队协作项目', '项目任务'].includes(x)).join(' / ') || '无标签'}</Tag>
                      <Tag color={TIER_META[s.taskTier].color}>复杂度 {TIER_META[s.taskTier].label}</Tag>
                      {s.task.dueAt && <Tag>{dayjs(s.task.dueAt).format('MM-DD 截止')}</Tag>}
                    </Space>
                    <Button
                      type="primary"
                      size="small"
                      icon={<CheckCircleOutlined />}
                      disabled={claimed}
                      onClick={() => claim(s.task)}
                    >
                      {claimed ? '待审核' : '承接'}
                    </Button>
                  </div>
                </Card>
              </Col>
            )
          })}
        </Row>
      )}

      <Alert
        type="info"
        showIcon
        style={{ marginTop: 16 }}
        message="承接需管理人员审核通过后生效；可在「审核中心」跟进审核进度。"
      />
    </Card>
  )
}

function myTagsView(profile?: MemberProfile) {
  if (!profile || profile.skillTags.length === 0) return <Tag>未设置技能标签（默认中性分）</Tag>
  return profile.skillTags.slice(0, 5).map((tag) => <Tag key={tag} color="blue">{tag}</Tag>)
}

// ─────────────────────────── Tab2 我的画像 ───────────────────────────

function ProfileTab() {
  const queryClient = useQueryClient()
  const profileQuery = useQuery({
    queryKey: ['my-profile'],
    queryFn: () => evaluationApi.getMyProfile(),
    retry: false,
  })
  const statsQuery = useQuery({
    queryKey: ['my-stats'],
    queryFn: () => evaluationApi.getMyStats(30),
    retry: false,
  })

  const [editing, setEditing] = useState(false)
  const [skillTags, setSkillTags] = useState<string[]>([])
  const [tierValue, setTierValue] = useState<ComplexityTier | ''>('')
  const [selfAssessed, setSelfAssessed] = useState(true)

  const profile = profileQuery.data

  const updateMutation = useMutation({
    mutationFn: (input: UpdateProfileInput) => evaluationApi.updateMyProfile(input),
    onSuccess: () => { message.success('画像已保存'); setEditing(false); queryClient.invalidateQueries({ queryKey: ['my-profile'] }) },
    onError: e => message.error(getErrorMessage(e)),
  })

  const startEdit = () => {
    if (!profile) return
    setSkillTags(profile.skillTags)
    setTierValue(profile.complexityTier ?? '')
    setSelfAssessed(profile.selfAssessed)
    setEditing(true)
  }

  const save = () => updateMutation.mutate({ skillTags, complexityTier: tierValue === '' ? undefined : tierValue, selfAssessed })

  if (profileQuery.isLoading) return <LoadingView height={300} tip="正在加载画像…" />
  if (profileQuery.isError) return <ErrorView error={profileQuery.error} onRetry={() => profileQuery.refetch()} />

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={10}>
        <Card
          title={<Space><UserOutlined />我的画像</Space>}
          extra={
            editing ? (
              <Space>
                <Button size="small" onClick={() => setEditing(false)}>取消</Button>
                <Button size="small" type="primary" icon={<SaveOutlined />} loading={updateMutation.isPending} onClick={save}>保存</Button>
              </Space>
            ) : (
              <Button size="small" icon={<EditOutlined />} onClick={startEdit}>编辑</Button>
            )
          }
        >
          {editing ? (
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div>
                <Text type="secondary">技能标签（输入后回车添加）</Text>
                <Select mode="tags" style={{ width: '100%', marginTop: 4 }} placeholder="例如：前端、设计" value={skillTags} onChange={setSkillTags} options={TAG_SUGGESTIONS.map(t => ({ value: t, label: t }))} />
              </div>
              <div>
                <Text type="secondary">复杂度档位（自评：常处理的任务复杂度）</Text>
                <Radio.Group style={{ marginTop: 4 }} value={tierValue} onChange={e => setTierValue(e.target.value as ComplexityTier)}>
                  <Radio.Button value="low">低</Radio.Button>
                  <Radio.Button value="medium">中</Radio.Button>
                  <Radio.Button value="high">高</Radio.Button>
                </Radio.Group>
                {tierValue === '' && <div><Text type="secondary" style={{ fontSize: 12 }}>当前未设置档位（推荐计算给 0.6 中性分），完成自评请选择一档</Text></div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text type="secondary">自评完成</Text>
                <Switch checked={selfAssessed} onChange={setSelfAssessed} checkedChildren="已自评" unCheckedChildren="未自评" />
              </div>
            </Space>
          ) : (
            <Space direction="vertical" size="middle">
              <div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>技能标签</Text>
                <Space wrap>
                  {profile!.skillTags.length === 0 ? <Text type="secondary">未设置（冷启动建议先自评）</Text> : profile!.skillTags.map((tag, i) => <Tag key={tag} color={['blue', 'geekblue', 'purple', 'cyan'][i % 4]}>{tag}</Tag>)}
                </Space>
              </div>
              <div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>复杂度档位</Text>
                {profile!.complexityTier ? <Tag color={TIER_META[profile!.complexityTier].color}>{TIER_META[profile!.complexityTier].label}</Tag> : <Tag>未设置</Tag>}
              </div>
              <div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>自评状态</Text>
                <Tag color={profile!.selfAssessed ? 'green' : 'default'}>{profile!.selfAssessed ? '已自评' : '未自评'}</Tag>
              </div>
              <Alert type="info" showIcon message={`历史绩效：完成 ${profile!.stats.completedCount} 项 · 完成率 ${pct(profile!.stats.completionRate)} · 准时率 ${pct(profile!.stats.onTimeRate)} · 当前活跃 ${profile!.stats.activeLoad} 项`} />
            </Space>
          )}
        </Card>
      </Col>

      <Col xs={24} lg={14}>
        <Card title={<Space><ThunderboltOutlined />我的工时统计（近 30 天）</Space>}>
          {statsQuery.isLoading ? <LoadingView height={220} tip="正在统计工时…" /> : statsQuery.isError ? <ErrorView error={statsQuery.error} onRetry={() => statsQuery.refetch()} /> : statsQuery.data ? (
            <div>
              <Row gutter={16}>
                <Col span={6}><Statistic title="总工时" value={statsQuery.data.totalActualHours} suffix="h" precision={1} /></Col>
                <Col span={6}><Statistic title="完成率" value={Math.round(statsQuery.data.completionRate * 100)} suffix="%" /></Col>
                <Col span={6}><Statistic title="准时率" value={Math.round(statsQuery.data.onTimeRate * 100)} suffix="%" /></Col>
                <Col span={6}><Statistic title="活跃负载" value={statsQuery.data.activeLoad} suffix="项" /></Col>
              </Row>
              <Text type="secondary" style={{ display: 'block', margin: '16px 0 4px' }}>按天工时（悬停查看日期）</Text>
              <DailyBars entries={statsQuery.data.entries} />
            </div>
          ) : null}
        </Card>
      </Col>
    </Row>
  )
}

/** 按天柱状条：悬停显示日期+工时，使用 CSS 变量 */
function DailyBars({ entries }: { entries: MemberDayEntry[] }) {
  const max = Math.max(...entries.map(e => e.hours), 0.0001)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 150, overflowX: 'auto', paddingTop: 8 }}>
      {entries.map(e => (
        <Tooltip key={e.date} title={`${e.date}：${e.hours.toFixed(1)}h`}>
          <div style={{ flex: '1 0 14px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <div style={{ height: `${Math.max((e.hours / max) * 100, 2)}%`, background: e.hours > 0 ? 'var(--accent-cyan)' : 'var(--border-subtle)', borderRadius: '2px 2px 0 0', transition: 'height 0.2s' }} />
          </div>
        </Tooltip>
      ))}
    </div>
  )
}

// ─────────────────────────── Tab3 项目统计（仅管理版展示） ───────────────────────────

function MembersTab() {
  const [projectId, setProjectId] = useState<string>()
  const [days, setDays] = useState(30)
  const projectsQuery = useProjects()

  const statsQuery = useQuery({
    queryKey: ['members-stats', projectId, days],
    queryFn: () => evaluationApi.getMembersStats(projectId!, days),
    enabled: !!projectId,
    retry: false,
  })

  return (
    <Card
      extra={
        <Space wrap>
          <Select placeholder="选择项目" style={{ width: 200 }} loading={projectsQuery.isLoading} value={projectId} onChange={v => setProjectId(v)} options={(projectsQuery.data?.items ?? []).map(p => ({ value: p.id, label: p.name }))} />
          <Select value={days} style={{ width: 100 }} onChange={setDays} options={[30, 90, 180, 365].map(d => ({ value: d, label: `${d} 天` }))} />
          <Button icon={<ReloadOutlined />} onClick={() => statsQuery.refetch()}>刷新</Button>
        </Space>
      }
    >
      {!projectId ? <Empty description={<Text type="secondary">选择项目查看成员工时统计</Text>} /> : statsQuery.isLoading ? <LoadingView height={300} tip="正在统计成员工时…" /> : statsQuery.isError ? <ErrorView error={statsQuery.error} onRetry={() => statsQuery.refetch()} /> : statsQuery.data?.members.length === 0 ? <Empty description="该项目暂无成员数据" /> : <MemberStatsTable members={statsQuery.data!.members} />}
    </Card>
  )
}

// ─────────────────────────── 页面（第六批需求 2：按角色切割版面） ───────────────────────────

export default function EvaluationPage() {
  const role = useCurrentRole()
  const isManager = role === 'manager'
  const [activeTab, setActiveTab] = useState('recommend')
  return (
    <div>
      <Row align="middle" justify="space-between" style={{ marginBottom: 20 }}>
        <Col>
          <Title level={3} style={{ margin: 0, color: 'var(--text-primary)' }}>{isManager ? '智能评估 · 管理视图' : '智能评估 · 成员视图'}</Title>
          <Space size={12} style={{ marginTop: 4 }}>
            <Tag color={isManager ? 'blue' : 'gold'}>{isManager ? '管理版面' : '成员版面'}</Tag>
            <Text type="secondary">{isManager ? '为任务推荐最合适的候选人（技能 40% + 绩效 30% + 负载 20% + 复杂度 10%）· 只建议不指派' : '基于你的画像推荐合适的执行任务 · 承接需管理审核'}</Text>
          </Space>
        </Col>
      </Row>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'recommend', label: <Space><ThunderboltOutlined />{isManager ? '任务推荐' : '为我推荐'}</Space>, children: isManager ? <RecommendTab /> : <MyRecommendTab /> },
          { key: 'profile', label: <Space><UserOutlined />我的画像</Space>, children: <ProfileTab /> },
          ...(isManager ? [{ key: 'members', label: <Space><UserOutlined />项目统计</Space>, children: <MembersTab /> }] : []),
        ]}
      />
    </div>
  )
}