/**
 * 职责：全局搜索页 —— 关键词搜索任务/项目/评论（第六批需求 1：数据源切换为协作任务体系，
 * 与顶栏即时搜索同源；普通人员仅搜索自己涉及的事项，管理人员不受限），命中按 type 分组展示，点击卡片跳转。
 */
import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Empty, Input, Segmented, Space, Tag, Typography, message } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { useWorkspaceTasks } from '@/hooks/useWorkspaceTasks'
import { useLocalStorageState } from '@/hooks/useLocalStorageState'
import { mockMe } from '@/api/mock/data'
import { searchWorkspace, type WorkspaceSearchHit } from '@/utils/searchWorkspace'
import { taskRoute } from '@/utils/taskTree'
import EmptyView from '@/components/EmptyView'
import SearchResultCard from '@/components/SearchResultCard'

const { Title, Text } = Typography

/** 命中类型展示文案 */
const HIT_TYPE_LABEL: Record<WorkspaceSearchHit['type'], { label: string; color: string }> = {
  task: { label: '任务', color: 'blue' },
  project: { label: '项目', color: 'purple' },
  comment: { label: '评论', color: 'cyan' },
}

type SearchType = 'all' | 'task' | 'project' | 'comment'

const TYPE_OPTIONS: { value: SearchType; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'task', label: '任务' },
  { value: 'project', label: '项目' },
  { value: 'comment', label: '评论' },
]

/** 分组渲染顺序（type=all 时三组全展示；单一 type 时只展示对应组） */
const GROUP_ORDER: { type: WorkspaceSearchHit['type']; label: string }[] = [
  { type: 'task', label: '任务' },
  { type: 'project', label: '项目' },
  { type: 'comment', label: '评论' },
]

export default function SearchPage() {
  const navigate = useNavigate()
  const [tasks] = useWorkspaceTasks()
  const [role] = useLocalStorageState<'manager' | 'member'>('workspace_role', 'manager')
  const isManager = role === 'manager'
  const [searchParams] = useSearchParams()
  const urlKeyword = searchParams.get('q') ?? ''

  const [keyword, setKeyword] = useState(urlKeyword) // 输入框实时值
  const [query, setQuery] = useState(urlKeyword) // 已提交的查询词
  const [type, setType] = useState<SearchType>('all')

  // 从顶栏搜索跳转进来时同步关键词
  useEffect(() => {
    if (urlKeyword) {
      setKeyword(urlKeyword)
      setQuery(urlKeyword)
    }
  }, [urlKeyword])

  /** 统一搜索（同步计算，含角色过滤：member 仅自己涉及的事项） */
  const hits = useMemo(
    () =>
      query.trim()
        ? searchWorkspace(tasks, query, { userId: mockMe.id, displayName: mockMe.displayName, isManager }, type)
        : [],
    [tasks, query, type, isManager],
  )

  const handleSearch = (value: string) => {
    const q = value.trim()
    if (!q) {
      message.warning('请输入搜索关键词')
      return
    }
    setQuery(q)
  }

  /** 命中跳转：项目→项目详情；任务/评论按需求 4 规则（父级→详情页，叶子子任务→执行页） */
  const navigateTo = (hit: WorkspaceSearchHit) => {
    if (hit.type === 'project') {
      navigate(`/projects/${hit.id}`)
      return
    }
    const targetId = hit.type === 'comment' && hit.taskId ? hit.taskId : hit.id
    const task = tasks.find((t) => t.id === targetId)
    if (task) {
      navigate(taskRoute(tasks, task))
      return
    }
    navigate(`/tasks/${targetId}`)
  }

  const hasQuery = query.trim().length > 0
  const groups = GROUP_ORDER.filter((g) => type === 'all' || g.type === type).map((g) => ({
    ...g,
    items: hits.filter((h) => h.type === g.type),
  }))

  return (
    <div>
      <Title level={4} style={{ marginBottom: 4 }}>全局搜索</Title>
      <Space size={12} style={{ marginBottom: 16 }}>
        <Tag color={isManager ? 'blue' : 'gold'}>{isManager ? '管理版面 · 搜索全部' : '成员版面 · 仅我相关'}</Tag>
        <Text type="secondary" style={{ fontSize: 13 }}>
          {isManager ? '可搜索全部任务、项目与评论' : '搜索范围限你承接/创建/参与/评论过的事项'}
        </Text>
      </Space>

      <Space.Compact style={{ width: '100%', maxWidth: 640 }}>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索任务标题 / 描述 / 标签、项目名称、评论内容"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={() => handleSearch(keyword)}
        />
        <Button type="primary" onClick={() => handleSearch(keyword)}>
          搜索
        </Button>
      </Space.Compact>
      <div style={{ margin: '12px 0 20px' }}>
        <Segmented options={TYPE_OPTIONS} value={type} onChange={(v) => setType(v as SearchType)} />
      </div>

      {/* 空态 */}
      {!hasQuery && <EmptyView description="输入关键词，搜索任务、项目与评论" />}

      {/* 结果分组：任务 / 项目 / 评论 */}
      {hasQuery && (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {groups.map((group) => (
            <Card key={group.type} title={`${group.label}（${group.items.length}）`} styles={{ body: { padding: 12 } }}>
              {group.items.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`没有匹配的${group.label}`} />
              ) : (
                group.items.map((hit) => (
                  <SearchResultCard
                    key={`${hit.type}-${hit.id}`}
                    title={hit.title}
                    description={hit.snippet}
                    onClick={() => navigateTo(hit)}
                    tags={<Tag color={HIT_TYPE_LABEL[hit.type].color}>{HIT_TYPE_LABEL[hit.type].label}</Tag>}
                    meta={
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {dayjs(hit.createdAt).format('YYYY-MM-DD')}
                      </Text>
                    }
                  />
                ))
              )}
            </Card>
          ))}
        </Space>
      )}
    </div>
  )
}