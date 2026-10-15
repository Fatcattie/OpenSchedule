import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { Badge, Button, Empty, Form, Input, Modal, Select, Space, Tag, Typography, theme } from 'antd'
import { DeleteOutlined, EditOutlined, NodeIndexOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { DataSet, Network } from 'vis-network/standalone'
import type { WikiEntry } from '@/types/wiki'
import { buildGraph } from '@/utils/wikiLinks'

const { Title, Paragraph, Text } = Typography

function newId(): string {
  return `wiki-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

const DARK = {
  link: '#4da3ff',
  codeBg: '#252d3d',
  summaryBg: '#2a2318',
  summaryBorder: '#5c4b1f',
  summaryText: '#f5a623',
  panelBg: '#151a27',
  listHoverBg: '#1f2738',
  selectedBg: 'rgba(77, 163, 255, 0.16)',
  dimNodeBg: '#3f4a5e',
  dimNodeBorder: '#5a6478',
  baseNodeBg: '#2a3447',
  baseNodeBorder: '#4da3ff',
  neighborNodeBg: '#1f3a55',
}

/** 轻量 Markdown 渲染：标题 / 列表 / 粗体 / 行内代码，并把 [[字段名]] 渲染为可点链接 */
function renderWikiContent(content: string, onOpenTitle: (t: string) => void): ReactNode {
  const lines = content.split('\n')
  const blocks: ReactNode[] = []
  let listBuffer: string[] = []

  const flushList = () => {
    if (listBuffer.length) {
      const items = [...listBuffer]
      blocks.push(
        <ul key={`ul-${blocks.length}`} style={{ paddingLeft: 20, margin: '4px 0' }}>
          {items.map((it, i) => (
            <li key={i}>{renderInline(it, onOpenTitle)}</li>
          ))}
        </ul>,
      )
      listBuffer = []
    }
  }

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd()
    if (line.startsWith('- ')) {
      listBuffer.push(line.slice(2))
      return
    }
    flushList()
    if (!line.trim()) return
    if (line.startsWith('### ')) {
      blocks.push(
        <Title key={idx} level={5} style={{ margin: '10px 0 4px' }}>
          {renderInline(line.slice(4), onOpenTitle)}
        </Title>,
      )
    } else if (line.startsWith('## ')) {
      blocks.push(
        <Title key={idx} level={4} style={{ margin: '10px 0 4px' }}>
          {renderInline(line.slice(3), onOpenTitle)}
        </Title>,
      )
    } else if (line.startsWith('# ')) {
      blocks.push(
        <Title key={idx} level={3} style={{ margin: '10px 0 4px' }}>
          {renderInline(line.slice(2), onOpenTitle)}
        </Title>,
      )
    } else {
      blocks.push(
        <Paragraph key={idx} style={{ margin: '4px 0' }}>
          {renderInline(line, onOpenTitle)}
        </Paragraph>,
      )
    }
  })
  flushList()
  return <>{blocks}</>
}

function renderInline(text: string, onOpenTitle: (t: string) => void): ReactNode {
  const parts: ReactNode[] = []
  const re = /(\[\[[^\[\]]+\]\])|\*\*(.+?)\*\*|`([^`]+)`/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[1]) {
      const t = m[1].slice(2, -2).trim()
      parts.push(
        <a
          key={i++}
          onClick={(e) => {
            e.preventDefault()
            onOpenTitle(t)
          }}
          style={{ color: DARK.link, cursor: 'pointer' }}
        >
          [[{t}]]
        </a>,
      )
    } else if (m[2]) {
      parts.push(<strong key={i++}>{m[2]}</strong>)
    } else if (m[3]) {
      parts.push(
        <code
          key={i++}
          style={{
            background: DARK.codeBg,
            color: '#e0e6f0',
            padding: '1px 5px',
            borderRadius: 4,
            fontSize: 12,
          }}
        >
          {m[3]}
        </code>,
      )
    }
    last = re.lastIndex
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

function WikiGraph({
  entries,
  selectedId,
  onSelect,
}: {
  entries: WikiEntry[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const { token } = theme.useToken()
  const ref = useRef<HTMLDivElement>(null)
  const netRef = useRef<Network | null>(null)
  const nodesRef = useRef<DataSet<any> | null>(null)

  useEffect(() => {
    if (!ref.current) return
    const nodes = new DataSet<any>(
      entries.map((e) => ({ id: e.id, label: e.title })),
    )
    const { edges } = buildGraph(entries)
    const eds = new DataSet<any>(edges.map((ed) => ({ from: ed.from, to: ed.to })))
    nodesRef.current = nodes

    const options: any = {
      nodes: {
        shape: 'dot',
        size: 14,
        font: { size: 13, color: token.colorText, face: token.fontFamily },
        borderWidth: 2,
        color: { background: DARK.baseNodeBg, border: DARK.baseNodeBorder },
      },
      edges: {
        color: { color: '#4a5568', highlight: token.colorInfo },
        smooth: { type: 'continuous' },
      },
      physics: {
        stabilization: true,
        barnesHut: { gravitationalConstant: -9000, springLength: 110, springConstant: 0.04 },
      },
      interaction: { hover: true, zoomView: true, dragNodes: true, dragView: true },
    }

    const network = new Network(ref.current, { nodes, edges: eds } as any, options)
    network.on('click', (p: any) => {
      if (p.nodes && p.nodes.length) onSelect(p.nodes[0])
    })
    netRef.current = network
    return () => {
      network.destroy()
      netRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries])

  useEffect(() => {
    const net = netRef.current
    const nodes = nodesRef.current
    if (!net || !nodes) return
    const { edges } = buildGraph(entries)
    const neighbors = new Set<string>()
    if (selectedId) {
      neighbors.add(selectedId)
      edges.forEach((e) => {
        if (e.from === selectedId) neighbors.add(e.to)
        if (e.to === selectedId) neighbors.add(e.from)
      })
    }
    const updates = entries.map((e) => {
      if (!selectedId) return { id: e.id, color: { background: DARK.baseNodeBg, border: DARK.baseNodeBorder } }
      if (e.id === selectedId) return { id: e.id, color: { background: DARK.summaryText, border: '#ffce5c' } }
      if (neighbors.has(e.id)) return { id: e.id, color: { background: DARK.neighborNodeBg, border: token.colorInfo } }
      return { id: e.id, color: { background: DARK.dimNodeBg, border: DARK.dimNodeBorder } }
    })
    nodes.update(updates)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, entries])

  return (
    <div
      ref={ref}
      style={{
        height: 380,
        width: '100%',
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadius,
        background: token.colorBgContainer,
      }}
    />
  )
}

export default function WikiKnowledgeBase({
  entries,
  setEntries,
}: {
  entries: WikiEntry[]
  setEntries: Dispatch<SetStateAction<WikiEntry[]>>
}) {
  const { token } = theme.useToken()
  const [selectedId, setSelectedId] = useState<string | null>(entries[0]?.id ?? null)
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [editing, setEditing] = useState<WikiEntry | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()
  const textRef = useRef<HTMLTextAreaElement>(null)

  const allTags = useMemo(
    () => Array.from(new Set(entries.flatMap((e) => e.keywords))).sort(),
    [entries],
  )
  const { backlinks, unresolvedByEntry } = useMemo(() => buildGraph(entries), [entries])

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase()
    return entries.filter((e) => {
      if (tagFilter.length && !tagFilter.some((t) => e.keywords.includes(t))) return false
      if (!kw) return true
      return [e.title, e.summary, e.content, ...e.keywords].join(' ').toLowerCase().includes(kw)
    })
  }, [entries, search, tagFilter])

  const selected = entries.find((e) => e.id === selectedId) ?? null

  useEffect(() => {
    if (!selected && entries[0]) setSelectedId(entries[0].id)
  }, [selected, entries])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ content: '' })
    setModalOpen(true)
  }
  const openEdit = (e: WikiEntry) => {
    setEditing(e)
    form.setFieldsValue({
      title: e.title,
      summary: e.summary,
      keywords: e.keywords.join(', '),
      content: e.content,
    })
    setModalOpen(true)
  }

  const save = () => {
    form.validateFields().then((v) => {
      const keywords = (v.keywords || '')
        .split(/[,，]/)
        .map((s: string) => s.trim())
        .filter(Boolean)
      const now = new Date().toISOString()
      if (editing) {
        setEntries((c) =>
          c.map((x) =>
            x.id === editing.id
              ? { ...x, title: v.title.trim(), summary: v.summary.trim(), content: v.content, keywords, updatedAt: now }
              : x,
          ),
        )
      } else {
        const entry: WikiEntry = {
          id: newId(),
          title: v.title.trim(),
          summary: v.summary.trim(),
          content: v.content,
          keywords,
          source: '手动创建',
          createdAt: now,
          updatedAt: now,
        }
        setEntries((c) => [entry, ...c])
      }
      setModalOpen(false)
    })
  }

  const remove = (e: WikiEntry) => {
    setEntries((c) => c.filter((x) => x.id !== e.id))
    if (selectedId === e.id) setSelectedId(null)
  }

  /** 点正文里的 [[字段名]]：存在则跳转，不存在则一键建卡（待创建链接不断裂） */
  const openByTitle = (t: string) => {
    const title = t.trim()
    const target = entries.find((e) => e.title.trim().toLowerCase() === title.toLowerCase())
    if (target) {
      setSelectedId(target.id)
      return
    }
    const now = new Date().toISOString()
    const entry: WikiEntry = {
      id: newId(),
      title,
      summary: '',
      content: `待补充关于「${title}」的内容。`,
      keywords: [],
      source: '待创建',
      createdAt: now,
      updatedAt: now,
    }
    setEntries((c) => [entry, ...c])
    setSelectedId(entry.id)
  }

  const insertLink = (title: string) => {
    if (!title) return
    const ta = textRef.current
    const cur = (form.getFieldValue('content') as string) || ''
    if (ta) {
      const s = ta.selectionStart ?? cur.length
      const e = ta.selectionEnd ?? cur.length
      const next = cur.slice(0, s) + `[[${title}]]` + cur.slice(e)
      form.setFieldsValue({ content: next })
    } else {
      form.setFieldsValue({ content: cur + `[[${title}]]` })
    }
  }

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
      {/* 左：知识卡列表 */}
      <div style={{ width: 280, flexShrink: 0 }}>
        <Space direction="vertical" style={{ width: '100%', marginBottom: 8 }}>
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索标题/摘要/正文"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
          />
          <Select
            mode="multiple"
            placeholder="按标签筛选"
            style={{ width: '100%' }}
            value={tagFilter}
            onChange={setTagFilter}
            options={allTags.map((t) => ({ value: t, label: t }))}
            maxTagCount="responsive"
          />
          <Button type="primary" icon={<PlusOutlined />} block onClick={openCreate}>
            新建知识卡
          </Button>
        </Space>
        <div
          style={{
            maxHeight: 520,
            overflowY: 'auto',
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: token.borderRadius,
            background: token.colorBgContainer,
          }}
        >
          {filtered.length === 0 ? (
            <Empty description="没有匹配的知识卡" style={{ marginTop: 40 }} />
          ) : (
            filtered.map((e) => (
              <div
                key={e.id}
                onClick={() => setSelectedId(e.id)}
                style={{
                  padding: '10px 12px',
                  cursor: 'pointer',
                  borderBottom: `1px solid ${token.colorBorderSecondary}`,
                  background: e.id === selectedId ? DARK.selectedBg : undefined,
                  transition: 'background .15s',
                }}
                onMouseEnter={(ev) => {
                  if (e.id !== selectedId) (ev.currentTarget.style.background as any) = DARK.listHoverBg
                }}
                onMouseLeave={(ev) => {
                  if (e.id !== selectedId) (ev.currentTarget.style.background as any) = undefined
                }}
              >
                <div style={{ fontWeight: 500, color: token.colorText }}>{e.title}</div>
                <div style={{ fontSize: 12, color: token.colorTextSecondary }}>{e.summary || '（无摘要）'}</div>
                <div>
                  {e.keywords.map((k) => (
                    <Tag key={k} color="blue" style={{ marginRight: 4, marginTop: 4 }}>
                      {k}
                    </Tag>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 中：卡片详情 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {selected ? (
          <div>
            <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 8 }}>
              <Title level={4} style={{ margin: 0 }}>
                {selected.title}
              </Title>
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(selected)}>
                  编辑
                </Button>
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => remove(selected)}>
                  删除
                </Button>
              </Space>
            </Space>
            {selected.source && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                来源：{selected.source}
              </Text>
            )}
            <div
              style={{
                background: DARK.summaryBg,
                border: `1px solid ${DARK.summaryBorder}`,
                borderRadius: token.borderRadius,
                padding: '8px 12px',
                margin: '10px 0',
              }}
            >
              <Text strong style={{ color: DARK.summaryText, fontSize: 12 }}>
                摘要（卡片外展示）
              </Text>
              <div style={{ color: '#e0d4b8' }}>{selected.summary || '（暂无摘要）'}</div>
            </div>
            <div
              style={{
                background: DARK.panelBg,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: token.borderRadius,
                padding: 16,
                minHeight: 200,
                color: token.colorText,
              }}
            >
              {renderWikiContent(selected.content || '（暂无详细介绍）', openByTitle)}
            </div>

            {/* 反向链接 */}
            <div style={{ marginTop: 12 }}>
              <Text strong>反向链接（哪些卡片链到我）</Text>
              <div style={{ marginTop: 6 }}>
                {(backlinks[selected.id] || []).length === 0 ? (
                  <Text type="secondary">暂无其他卡片链到此知识卡。</Text>
                ) : (
                  (backlinks[selected.id] || []).map((sid) => {
                    const src = entries.find((e) => e.id === sid)
                    if (!src) return null
                    return (
                      <Tag
                        key={sid}
                        color="purple"
                        style={{ cursor: 'pointer', marginBottom: 4 }}
                        onClick={() => setSelectedId(sid)}
                      >
                        ← {src.title}
                      </Tag>
                    )
                  })
                )}
              </div>
            </div>

            {/* 待创建链接 */}
            {(unresolvedByEntry[selected.id] || []).length > 0 && (
              <div style={{ marginTop: 8 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  待创建的链接：
                </Text>
                {(unresolvedByEntry[selected.id] || []).map((t) => (
                  <Tag
                    key={t}
                    style={{ cursor: 'pointer', borderStyle: 'dashed', marginBottom: 4 }}
                    onClick={() => openByTitle(t)}
                  >
                    + {t}
                  </Tag>
                ))}
              </div>
            )}
          </div>
        ) : (
          <Empty description="选择或新建一张知识卡" style={{ marginTop: 80 }} />
        )}
      </div>

      {/* 右：知识点拓扑 */}
      <div style={{ width: 340, flexShrink: 0 }}>
        <Space style={{ width: '100%', marginBottom: 8 }}>
          <NodeIndexOutlined />
          <Text strong>知识点拓扑</Text>
          <Badge count={entries.length} showZero color={token.colorInfo} />
        </Space>
        <WikiGraph entries={entries} selectedId={selectedId} onSelect={setSelectedId} />
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
          点击节点打开对应卡片；当前卡片高亮，邻居节点同步高亮。
        </Text>
      </div>

      {/* 新建 / 编辑 弹窗 */}
      <Modal
        title={editing ? '编辑知识卡' : '新建知识卡'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={save}
        width={680}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="title"
            label="字段名 / 概念"
            rules={[{ required: true, message: '请填写字段名' }]}
          >
            <Input placeholder="例如：需求评审清单" />
          </Form.Item>
          <Form.Item
            name="summary"
            label="摘要（卡片外展示）"
            rules={[{ required: true, message: '请填写摘要' }]}
          >
            <Input.TextArea rows={2} placeholder="一句话概括，展示在卡片外" />
          </Form.Item>
          <Form.Item name="keywords" label="标签（逗号分隔）">
            <Input placeholder="评审, 需求, 验收" />
          </Form.Item>
          <Form.Item name="content" label="详细介绍（支持 Markdown 与 [[字段名]] 链接）">
            <Input.TextArea ref={textRef} rows={10} placeholder={'详细介绍...\n用 [[需求评审清单]] 链接到其他知识卡'} />
          </Form.Item>
          <Space>
            <Text type="secondary">快速插入链接：</Text>
            <Select
              showSearch
              style={{ width: 240 }}
              placeholder="选择已有字段"
              value={undefined}
              onChange={insertLink}
              options={entries.map((e) => ({ value: e.title, label: e.title }))}
            />
          </Space>
        </Form>
      </Modal>
    </div>
  )
}
