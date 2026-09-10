/**
 * Skill 技能管理：技能仓库（我的）+ 收到的推荐
 *
 * 顶部展示当前 MetaSkill（AI 创建技能时遵循的元规范），支持在设置弹窗中查看/编辑/上传替换。
 */
import { useState } from 'react'
import { App, Button, Card, Space, Tag, Typography } from 'antd'
import { PlusOutlined, SettingOutlined, ToolOutlined } from '@ant-design/icons'
import { useSkills } from '@/hooks/useSkills'
import { useUsers } from '@/hooks/useUsers'
import { useMetaConfig } from '@/hooks/useMetaConfig'
import type { SkillItem } from '@/types/intelligent'
import LibraryGrid from './LibraryGrid'
import SkillEditorDrawer, { type SkillFormValues } from './SkillEditorDrawer'
import ShareModal from './ShareModal'
import SharedDetailModal from './SharedDetailModal'
import { downloadSkillZip } from '@/utils/download'

const { Text } = Typography
const ACCENT = '#13c2c2'

const sourceText = (s: 'manual' | 'ai' | 'import') =>
  s === 'ai' ? 'AI 生成' : s === 'import' ? '导入/副本' : '手动创建'

export default function SkillLibrary({ onOpenMetaSkill }: { onOpenMetaSkill: () => void }) {
  const { message } = App.useApp()
  const { mine, sharedWithMe, create, update, remove, toggleFavorite, share, duplicate } = useSkills()
  const { users, me } = useUsers()
  const { config } = useMetaConfig()

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<SkillItem | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareTarget, setShareTarget] = useState<SkillItem | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailItem, setDetailItem] = useState<SkillItem | null>(null)

  const candidates = users.filter((u) => u.id !== me.id && u.status !== 'disabled')

  const copyContent = (item: SkillItem) => {
    navigator.clipboard
      ?.writeText(item.content)
      .then(() => message.success('已复制 SKILL.md'))
      .catch(() => message.warning('复制失败，请手动选择内容复制'))
  }

  const downloadZip = (item: SkillItem) => {
    void downloadSkillZip(item).then(() => message.success('已下载技能包（zip）'))
  }

  const handleSave = (values: SkillFormValues) => {
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
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space align="start">
            <ToolOutlined style={{ fontSize: 18, marginTop: 2 }} />
            <div>
              <Space wrap>
                <Text strong>当前 MetaSkill</Text>
                <Tag color={config.customized ? 'orange' : 'default'}>
                  {config.customized ? '已自定义' : '系统默认'}
                </Tag>
              </Space>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                <Text type="secondary">{config.metaSkillName}</Text>
              </div>
              <div style={{ fontSize: 12 }}>
                <Text type="secondary">来源：{config.metaSkillSource}</Text>
              </div>
            </div>
          </Space>
          <Button size="small" icon={<SettingOutlined />} onClick={onOpenMetaSkill}>
            查看 / 更换
          </Button>
        </Space>
      </Card>

      <LibraryGrid
        items={mine}
        accent={ACCENT}
        sourceText={sourceText}
        onOpen={(id) => {
          const item = mine.find((s) => s.id === id)
          if (item) {
            setEditing(item)
            setEditorOpen(true)
          }
        }}
        onCopy={(id) => {
          const item = mine.find((s) => s.id === id)
          if (item) copyContent(item)
        }}
        onDownload={(id) => {
          const item = mine.find((s) => s.id === id)
          if (item) downloadZip(item)
        }}
        onToggleFavorite={toggleFavorite}
        onShare={(id) => {
          const item = mine.find((s) => s.id === id)
          if (item) {
            setShareTarget(item)
            setShareOpen(true)
          }
        }}
        onDelete={(id) => {
          remove(id)
          message.success('已删除')
        }}
        emptyText="还没有技能，点击右上角「新建技能」开始"
        actions={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null)
              setEditorOpen(true)
            }}
          >
            新建技能
          </Button>
        }
      />

      {sharedWithMe.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <Space style={{ marginBottom: 10 }}>
            <Text strong>收到的推荐</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              同事推荐给你的技能，可查看、复制与下载
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
              if (entry) downloadZip(entry.item)
            }}
            onToggleFavorite={() => message.info('推荐内容无法收藏，可先保存到我的库')}
            onShare={() => message.info('推荐内容暂不支持再次转发')}
            onDelete={() => message.info('推荐内容无法删除，可联系分享人取消推荐')}
          />
        </div>
      )}

      <SkillEditorDrawer
        open={editorOpen}
        item={editing}
        metaSkillContent={config.metaSkillContent}
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
            message.success(userIds.length ? `已推荐给 ${userIds.length} 位同事` : '已取消推荐')
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
        sharedByName={sharedWithMe.find((s) => s.item.id === detailItem?.id)?.sharedByName ?? ''}
        note={sharedWithMe.find((s) => s.item.id === detailItem?.id)?.note}
        onClose={() => {
          setDetailOpen(false)
          setDetailItem(null)
        }}
        onCopy={() => {
          if (detailItem) copyContent(detailItem)
        }}
        onDownload={() => {
          if (detailItem) downloadZip(detailItem)
        }}
        onSaveToMine={() => {
          if (detailItem) {
            duplicate(detailItem)
            message.success('已保存到我的技能库')
            setDetailOpen(false)
            setDetailItem(null)
          }
        }}
      />
    </div>
  )
}
