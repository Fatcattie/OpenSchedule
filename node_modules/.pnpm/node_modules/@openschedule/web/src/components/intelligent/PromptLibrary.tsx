/**
 * 提示词管理：提示词仓库（我的）+ 收到的推荐
 *
 * 创建支持手动编写与 AI 辅助生成（使用 Meta 提示词作为元指令）。
 */
import { useState } from 'react'
import { App, Button, Space, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { usePrompts } from '@/hooks/usePrompts'
import { useUsers } from '@/hooks/useUsers'
import { useMetaConfig } from '@/hooks/useMetaConfig'
import type { PromptItem } from '@/types/intelligent'
import LibraryGrid from './LibraryGrid'
import PromptEditorDrawer, { type PromptFormValues } from './PromptEditorDrawer'
import ShareModal from './ShareModal'
import SharedDetailModal from './SharedDetailModal'
import { downloadMarkdown } from '@/utils/download'

const { Text } = Typography
const ACCENT = '#1677ff'

const sourceText = (s: 'manual' | 'ai' | 'import') =>
  s === 'ai' ? 'AI 生成' : s === 'import' ? '导入' : '手动创建'

export default function PromptLibrary() {
  const { message } = App.useApp()
  const { mine, sharedWithMe, create, update, remove, toggleFavorite, share, duplicate } = usePrompts()
  const { users, me } = useUsers()
  const { config } = useMetaConfig()

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<PromptItem | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareTarget, setShareTarget] = useState<PromptItem | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailItem, setDetailItem] = useState<PromptItem | null>(null)

  const candidates = users.filter((u) => u.id !== me.id && u.status !== 'disabled')

  const copyContent = (item: PromptItem) => {
    navigator.clipboard
      ?.writeText(item.content)
      .then(() => message.success('已复制到剪贴板'))
      .catch(() => message.warning('复制失败，请手动选择内容复制'))
  }

  const handleSave = (values: PromptFormValues) => {
    if (editing) {
      update(editing.id, values)
      message.success('已更新')
    } else {
      create(values)
      message.success('已保存')
    }
    setEditorOpen(false)
    setEditing(null)
  }

  return (
    <div>
      <LibraryGrid
        items={mine}
        accent={ACCENT}
        sourceText={sourceText}
        onOpen={(id) => {
          const item = mine.find((p) => p.id === id)
          if (item) {
            setEditing(item)
            setEditorOpen(true)
          }
        }}
        onCopy={(id) => {
          const item = mine.find((p) => p.id === id)
          if (item) copyContent(item)
        }}
        onDownload={(id) => {
          const item = mine.find((p) => p.id === id)
          if (item) {
            downloadMarkdown(item.name, item.content)
            message.success('已下载 Markdown')
          }
        }}
        onToggleFavorite={toggleFavorite}
        onShare={(id) => {
          const item = mine.find((p) => p.id === id)
          if (item) {
            setShareTarget(item)
            setShareOpen(true)
          }
        }}
        onDelete={(id) => {
          remove(id)
          message.success('已删除')
        }}
        emptyText="还没有提示词，点击右上角「新建提示词」开始"
        actions={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null)
              setEditorOpen(true)
            }}
          >
            新建提示词
          </Button>
        }
      />

      {sharedWithMe.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <Space style={{ marginBottom: 10 }}>
            <Text strong>收到的推荐</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              同事推荐给你的提示词，可查看、复制与下载
            </Text>
          </Space>
          <LibraryGrid
            items={sharedWithMe.map((s) => s.item)}
            accent="#52c41a"
            sourceText={sourceText}
            showSharedBy
            onOpen={(id) => {
              const entry = sharedWithMe.find((s) => s.item.id === id)
              if (entry) {
                setDetailItem(entry.item)
                setDetailOpen(true)
              }
            }}
            onCopy={(id) => {
              const entry = sharedWithMe.find((s) => s.item.id === id)
              if (entry) copyContent(entry.item)
            }}
            onDownload={(id) => {
              const entry = sharedWithMe.find((s) => s.item.id === id)
              if (entry) downloadMarkdown(entry.item.name, entry.item.content)
            }}
            onToggleFavorite={() => message.info('推荐内容无法收藏，可先保存到我的库')}
            onShare={() => message.info('推荐内容暂不支持再次转发')}
            onDelete={() => message.info('推荐内容无法删除，可联系分享人取消推荐')}
          />
        </div>
      )}

      <PromptEditorDrawer
        open={editorOpen}
        item={editing}
        metaPrompt={config.metaPrompt}
        onClose={() => {
          setEditorOpen(false)
          setEditing(null)
        }}
        onSave={handleSave}
      />

      <ShareModal
        open={shareOpen}
        itemName={shareTarget?.name ?? ''}
        users={candidates}
        initialSelected={shareTarget?.sharedWith ?? []}
        initialNote={shareTarget?.sharedWith.length ? shareTarget.shareNotes[shareTarget.sharedWith[0]] : ''}
        onCancel={() => {
          setShareOpen(false)
          setShareTarget(null)
        }}
        onOk={(userIds, note) => {
          if (shareTarget) {
            share(shareTarget.id, userIds, note)
            message.success(
              userIds.length ? `已推荐给 ${userIds.length} 位同事` : '已取消推荐',
            )
          }
          setShareOpen(false)
          setShareTarget(null)
        }}
      />

      <SharedDetailModal
        open={detailOpen}
        title={detailItem?.name ?? ''}
        summary={detailItem?.summary ?? ''}
        content={detailItem?.content ?? ''}
        sharedByName={
          sharedWithMe.find((s) => s.item.id === detailItem?.id)?.sharedByName ?? ''
        }
        note={sharedWithMe.find((s) => s.item.id === detailItem?.id)?.note}
        onClose={() => {
          setDetailOpen(false)
          setDetailItem(null)
        }}
        onCopy={() => {
          if (detailItem) copyContent(detailItem)
        }}
        onDownload={() => {
          if (detailItem) downloadMarkdown(detailItem.name, detailItem.content)
        }}
        onSaveToMine={() => {
          if (detailItem) {
            duplicate(detailItem)
            message.success('已保存到我的提示词库')
            setDetailOpen(false)
            setDetailItem(null)
          }
        }}
      />
    </div>
  )
}
