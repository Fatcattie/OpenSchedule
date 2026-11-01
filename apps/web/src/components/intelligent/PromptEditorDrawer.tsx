/**
 * 提示词编辑抽屉：手动创建 / 编辑，或 AI 辅助创建
 *
 * AI 辅助创建使用 Meta 提示词（默认不显示，可在设置弹窗中查看编辑）作为元指令生成结构化提示词。
 */
import { useEffect, useState } from 'react'
import { App, Button, Drawer, Input, Segmented, Space, Tag, Typography } from 'antd'
import { ThunderboltOutlined } from '@ant-design/icons'
import type { PromptItem } from '@/types/intelligent'
import { generateStructuredPrompt } from '@/services/aiGenerator'

const { Text } = Typography

export interface PromptFormValues {
  name: string
  summary: string
  content: string
  tags: string[]
  source: 'manual' | 'ai'
}

interface PromptEditorDrawerProps {
  open: boolean
  /** 传入则为编辑，null 为新建 */
  item: PromptItem | null
  /** Meta 提示词（AI 生成的元指令） */
  metaPrompt: string
  onClose: () => void
  onSave: (values: PromptFormValues) => void
}

export default function PromptEditorDrawer({
  open,
  item,
  metaPrompt,
  onClose,
  onSave,
}: PromptEditorDrawerProps) {
  const { message } = App.useApp()
  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [content, setContent] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [source, setSource] = useState<'manual' | 'ai'>('manual')
  const [view, setView] = useState<'edit' | 'preview'>('edit')
  const [requirement, setRequirement] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genTag, setGenTag] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(item?.name ?? '')
      setSummary(item?.summary ?? '')
      setContent(item?.content ?? '')
      setTagsText((item?.tags ?? []).join('、'))
      setSource(item?.source ?? 'manual')
      setView('edit')
      setRequirement('')
      setGenTag(null)
    }
  }, [open, item])

  const handleGenerate = async () => {
    if (!requirement.trim()) {
      message.warning('请先描述你想要的提示词')
      return
    }
    setGenerating(true)
    try {
      const res = await generateStructuredPrompt(requirement.trim(), metaPrompt)
      setContent(res.content)
      setSource('ai')
      setGenTag(res.source === 'agent' ? 'AI 模型生成' : '模拟生成（团队未配置 AI 模型）')
      if (!name.trim()) setName(requirement.trim().slice(0, 20))
      if (!summary.trim()) setSummary(requirement.trim().slice(0, 60))
      setView('edit')
      message.success('已生成，请检查并补充后保存')
    } catch (e) {
      message.error(`生成失败：${e instanceof Error ? e.message : '未知错误'}`)
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = () => {
    if (!name.trim()) {
      message.warning('请填写名称')
      return
    }
    if (!content.trim()) {
      message.warning('请填写提示词内容')
      return
    }
    onSave({
      name: name.trim(),
      summary: summary.trim(),
      content,
      tags: tagsText
        .split(/[、,，\s]+/)
        .map((t) => t.trim())
        .filter(Boolean),
      source,
    })
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={720}
      title={item ? '编辑提示词' : '创建提示词'}
      destroyOnHidden
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" onClick={handleSave}>
            保存
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div>
          <Text strong>AI 辅助创建</Text>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <Input.TextArea
              rows={2}
              value={requirement}
              onChange={(e) => setRequirement(e.target.value)}
              placeholder="一句话描述你想要的提示词，例如：帮我把会议记录整理成带待办的纪要"
              style={{ flex: 1 }}
            />
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              loading={generating}
              onClick={handleGenerate}
              style={{ height: 'auto' }}
            >
              AI 生成
            </Button>
          </div>
          {genTag && (
            <Tag color={genTag.startsWith('模拟') ? 'default' : 'green'} style={{ marginTop: 6 }}>
              {genTag}
            </Tag>
          )}
        </div>

        <div>
          <div style={{ marginBottom: 4 }}>
            <Text>名称</Text>
          </div>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：会议纪要整理助手" />
        </div>

        <div>
          <div style={{ marginBottom: 4 }}>
            <Text>摘要</Text>
          </div>
          <Input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="一句话说明它的用途，展示在卡片上"
          />
        </div>

        <div>
          <div style={{ marginBottom: 4 }}>
            <Text>标签</Text>
            <Text type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>
              用「、」或逗号分隔
            </Text>
          </div>
          <Input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="办公效率、会议" />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text>提示词内容（Markdown）</Text>
            <Segmented
              size="small"
              value={view}
              onChange={(v) => setView(v as 'edit' | 'preview')}
              options={[
                { value: 'edit', label: '编辑' },
                { value: 'preview', label: '预览' },
              ]}
            />
          </div>
          {view === 'edit' ? (
            <Input.TextArea
              rows={16}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="在此编写提示词正文，可使用 {{变量}} 占位"
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          ) : (
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: 12,
                lineHeight: 1.7,
                padding: 12,
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 6,
                minHeight: 320,
                margin: 0,
              }}
            >
              {content || '（空）'}
            </pre>
          )}
        </div>
      </Space>
    </Drawer>
  )
}
