/**
 * 库网格（参考 AI-Gist 布局）：工具栏 + 卡片网格
 *
 * 工具栏：搜索 / 排序 / 标签筛选 / 仅看收藏；网格为三列响应式卡片。
 */
import { useMemo, useState } from 'react'
import { Button, Col, Empty, Input, Row, Segmented, Select, Space } from 'antd'
import EntryCard from './EntryCard'

export interface LibraryItem {
  id: string
  name: string
  summary: string
  tags: string[]
  favorite: boolean
  updatedAt: string
  source: 'manual' | 'ai' | 'import'
  sharedWith: string[]
  createdByName: string
}

interface LibraryGridProps {
  items: LibraryItem[]
  /** 卡片主色 */
  accent: string
  /** 来源文案映射 */
  sourceText: (s: LibraryItem['source']) => string
  /** 收到推荐时展示推荐人 */
  showSharedBy?: boolean
  onOpen: (id: string) => void
  onCopy: (id: string) => void
  onDownload: (id: string) => void
  onToggleFavorite: (id: string) => void
  onShare: (id: string) => void
  onDelete: (id: string) => void
  /** 工具栏右侧插槽（如新建按钮） */
  actions?: React.ReactNode
  emptyText?: string
}

type SortKey = 'updated' | 'name'

export default function LibraryGrid({
  items,
  accent,
  sourceText,
  showSharedBy = false,
  onOpen,
  onCopy,
  onDownload,
  onToggleFavorite,
  onShare,
  onDelete,
  actions,
  emptyText,
}: LibraryGridProps) {
  const [keyword, setKeyword] = useState('')
  const [sort, setSort] = useState<SortKey>('updated')
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [favOnly, setFavOnly] = useState(false)

  const allTags = useMemo(() => {
    const set = new Set<string>()
    items.forEach((i) => i.tags.forEach((t) => set.add(t)))
    return Array.from(set)
  }, [items])

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    let list = items.filter((i) => {
      if (favOnly && !i.favorite) return false
      if (tagFilter.length && !tagFilter.some((t) => i.tags.includes(t))) return false
      if (!kw) return true
      return (
        i.name.toLowerCase().includes(kw) ||
        i.summary.toLowerCase().includes(kw) ||
        i.tags.some((t) => t.toLowerCase().includes(kw))
      )
    })
    list = [...list].sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name, 'zh-CN') : b.updatedAt.localeCompare(a.updatedAt),
    )
    return list
  }, [items, keyword, sort, tagFilter, favOnly])

  return (
    <div>
      <Row gutter={[8, 8]} align="middle" style={{ marginBottom: 12 }} wrap>
        <Col flex="auto" style={{ minWidth: 200 }}>
          <Input.Search
            allowClear
            placeholder="搜索名称、摘要或标签"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </Col>
        <Col>
          <Space size={8} wrap>
            <Select
              mode="multiple"
              allowClear
              placeholder="标签筛选"
              style={{ minWidth: 160 }}
              value={tagFilter}
              onChange={setTagFilter}
              options={allTags.map((t) => ({ value: t, label: t }))}
              maxTagCount="responsive"
            />
            <Segmented
              size="small"
              value={sort}
              onChange={(v) => setSort(v as SortKey)}
              options={[
                { value: 'updated', label: '最近更新' },
                { value: 'name', label: '名称' },
              ]}
            />
            <Button
              size="small"
              type={favOnly ? 'primary' : 'default'}
              onClick={() => setFavOnly((v) => !v)}
            >
              仅看收藏
            </Button>
            {actions}
          </Space>
        </Col>
      </Row>

      {filtered.length === 0 ? (
        <Empty description={emptyText ?? '没有匹配的条目'} style={{ padding: '32px 0' }} />
      ) : (
        <Row gutter={[12, 12]}>
          {filtered.map((item) => (
            <Col key={item.id} xs={24} sm={12} xl={8}>
              <EntryCard
                name={item.name}
                summary={item.summary}
                tags={item.tags}
                favorite={item.favorite}
                updatedAt={item.updatedAt}
                sourceText={sourceText(item.source)}
                sharedByName={showSharedBy ? item.createdByName : undefined}
                accent={accent}
                onOpen={() => onOpen(item.id)}
                onCopy={() => onCopy(item.id)}
                onDownload={() => onDownload(item.id)}
                onToggleFavorite={() => onToggleFavorite(item.id)}
                onShare={() => onShare(item.id)}
                onDelete={() => onDelete(item.id)}
              />
            </Col>
          ))}
        </Row>
      )}
    </div>
  )
}
