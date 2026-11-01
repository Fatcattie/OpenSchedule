/**
 * 职责：通知中心 —— 支持模糊搜索 + 事件分类筛选 + 未读/已读切换 + 一键全部已读
 *
 * 数据来自 useNotifications（已按当前角色过滤可见性：
 * 管理人员全量 / 普通人员仅 personal 且与自己相关），点击通知按 data.route 跳转。
 */
import { useMemo, useState } from 'react'
import { Button, Card, Empty, Input, List, Segmented, Select, Space, Tag, Tooltip, Typography } from 'antd'
import { BellOutlined, CheckOutlined, SearchOutlined, SendOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_META,
  useNotifications,
} from '@/hooks/useNotifications'
import { useUsers } from '@/hooks/useUsers'
import { useWorkspaceState } from '@/hooks/useWorkspaceState'
import ForwardMessageModal, { type ForwardLogEntry } from '@/components/notifications/ForwardMessageModal'
import { providerMeta } from '@/services/imProvider'

const { Title, Text } = Typography

type ReadFilter = 'all' | 'unread' | 'read'

export default function NotificationsPage() {
  const navigate = useNavigate()
  const { items, unreadCount, markRead, markAllRead } = useNotifications()
  const { users } = useUsers()
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState<string>('all')
  const [readFilter, setReadFilter] = useState<ReadFilter>('all')
  const [forwardLog, setForwardLog] = useWorkspaceState<ForwardLogEntry[]>('notification_forward_log', [])
  const [forwardState, setForwardState] = useState<{ title: string; content: string } | null>(null)

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return items.filter((n) => {
      if (category !== 'all' && n.category !== category) return false
      if (readFilter === 'unread' && n.read) return false
      if (readFilter === 'read' && !n.read) return false
      if (kw) {
        const hay = `${n.title} ${n.body ?? ''}`.toLowerCase()
        if (!hay.includes(kw)) return false
      }
      return true
    })
  }, [items, keyword, category, readFilter])

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }} align="center">
        <div>
          <Title level={4} style={{ margin: 0 }}>
            <BellOutlined style={{ marginRight: 8 }} />
            通知中心
          </Title>
          <Text type="secondary">{unreadCount} 条未读 · 共 {items.length} 条</Text>
        </div>
        <Space wrap>
          {forwardLog.length > 0 && (
            <Tooltip
              title={
                <div>
                  {forwardLog.slice(0, 5).map((l) => (
                    <div key={l.key}>
                      {providerMeta(l.provider).name} · {l.ok ? '成功' : `失败：${l.error ?? ''}`} ·{' '}
                      {dayjs(l.at).format('MM-DD HH:mm')}
                    </div>
                  ))}
                </div>
              }
            >
              <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                转发记录 {forwardLog.length}
              </Tag>
            </Tooltip>
          )}
          <Button
            icon={<SendOutlined />}
            disabled={filtered.length === 0}
            onClick={() =>
              setForwardState({
                title: `批量转发 ${filtered.length} 条通知`,
                content: filtered
                  .slice(0, 10)
                  .map((n, i) => `${i + 1}. 【${NOTIFICATION_CATEGORY_META[n.category]?.label ?? '通知'}】${n.title}${n.body ? ` —— ${n.body}` : ''}`)
                  .join('\n'),
              })
            }
          >
            批量转发（{filtered.length}）
          </Button>
          <Button icon={<CheckOutlined />} onClick={markAllRead} disabled={!unreadCount}>
            全部已读
          </Button>
        </Space>
      </Space>

      {/* 搜索 / 分类 / 已读状态 */}
      <Space wrap style={{ marginBottom: 12, width: '100%' }} size={12}>
        <Input
          allowClear
          prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)' }} />}
          placeholder="搜索标题或内容…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ width: 240 }}
        />
        <Select
          value={category}
          onChange={setCategory}
          style={{ width: 150 }}
          options={[
            { value: 'all', label: '全部分类' },
            ...NOTIFICATION_CATEGORIES.filter((c) => c !== 'other').map((c) => ({
              value: c,
              label: NOTIFICATION_CATEGORY_META[c].label,
            })),
            { value: 'other', label: '其他' },
          ]}
        />
        <Segmented
          value={readFilter}
          onChange={(v) => setReadFilter(v as ReadFilter)}
          options={[
            { value: 'all', label: '全部' },
            { value: 'unread', label: `未读 ${unreadCount}` },
            { value: 'read', label: '已读' },
          ]}
        />
      </Space>

      <Card>
        {filtered.length === 0 ? (
          <Empty description={items.length === 0 ? '暂无通知' : '没有符合条件的通知'} />
        ) : (
          <List
            dataSource={filtered}
            renderItem={(item) => {
              const meta = NOTIFICATION_CATEGORY_META[item.category] ?? NOTIFICATION_CATEGORY_META.other
              return (
                <List.Item
                  style={{ cursor: item.data?.route ? 'pointer' : 'default', padding: '12px 4px' }}
                  onClick={() => {
                    if (item.data?.route) navigate(item.data.route)
                    if (!item.read) markRead(item.id)
                  }}
                  actions={[
                    item.read ? null : (
                      <Button
                        key="read"
                        type="link"
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation()
                          markRead(item.id)
                        }}
                      >
                        标为已读
                      </Button>
                    ),
                    <Button
                      key="forward"
                      type="link"
                      size="small"
                      icon={<SendOutlined />}
                      onClick={(e) => {
                        e.stopPropagation()
                        setForwardState({
                          title: item.title,
                          content: `【${
                            NOTIFICATION_CATEGORY_META[item.category]?.label ?? '通知'
                          }】${item.title}${item.body ? `\n${item.body}` : ''}`,
                        })
                      }}
                    >
                      转发
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space size={6} wrap>
                        {!item.read && <Tag color="blue" style={{ fontSize: 10 }}>未读</Tag>}
                        <Tag color={meta.color} style={{ fontSize: 10 }}>{meta.label}</Tag>
                        <Text strong={!item.read} style={{ color: item.read ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                          {item.title}
                        </Text>
                      </Space>
                    }
                    description={
                      <>
                        {item.body && (
                          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>
                            {item.body}
                          </Text>
                        )}
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {dayjs(item.createdAt).format('YYYY-MM-DD HH:mm')}
                        </Text>
                      </>
                    }
                  />
                </List.Item>
              )
            }}
          />
        )}
      </Card>

      <ForwardMessageModal
        open={!!forwardState}
        title={forwardState?.title ?? ''}
        defaultContent={forwardState?.content ?? ''}
        users={users.filter((u) => u.status !== 'disabled')}
        onCancel={() => setForwardState(null)}
        onDone={(entry) => setForwardLog((prev) => [entry, ...prev].slice(0, 50))}
      />
    </div>
  )
}
