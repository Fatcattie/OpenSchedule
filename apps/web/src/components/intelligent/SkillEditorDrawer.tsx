/**
 * 技能编辑抽屉：手动创建 / 编辑，或基于 MetaSkill 让 AI 智能创建
 *
 * 内容为标准 SKILL.md（含 YAML frontmatter），可下载为 zip 技能包。
 */
import { useEffect, useState } from 'react'
import { App, Button, Drawer, Input, Segmented, Space, Tag, Typography } from 'antd'
import { ThunderboltOutlined } from '@ant-design/icons'
import type { SkillItem } from '@/types/intelligent'
import { generateSkill } from '@/services/aiGenerator'
import { downloadSkillZip } from '@/utils/download'

const { Text } = Typography

export interface SkillFormValues {
  name: string
  summary: string
  content: string
  tags: string[]
  version: string
  source: 'manual' | 'ai' | 'import'
}

interface SkillEditorDrawerProps {
  open: boolean
  item: SkillItem | null
  /** MetaSkill 内容（AI 生成时遵循的元规范） */
  metaSkillContent: string
  onClose: () => void
  onSave: (values: SkillFormValues) => void
}

export default function SkillEditorDrawer({
  open,
  item,
  metaSkillContent,
  onClose,
  onSave,
}: SkillEditorDrawerProps) {
  const { message } = App.useApp()
  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [content, setContent] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [version, setVersion] = useState('1.0.0')
  const [source, setSource] = useState<'manual' | 'ai' | 'import'>('manual')
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
      setVersion(item?.version ?? '1.0.0')
      setSource(item?.source ?? 'manual')
      setView('edit')
      setRequirement('')
      setGenTag(null)
    }
  }, [open, item])

  const handleGenerate = async () => {
    if (!requirement.trim()) {
      message.warning('请先描述你想要的技能')
      return
    }
    setGenerating(true)
    try {
      const res = await generateSkill(requirement.trim(), metaSkillContent)
      setContent(res.content)
      setSource('ai')
      setGenTag(res.source === 'agent' ? 'AI 模型生成' : '模拟生成（团队未配置 AI 模型）')
      if (!name.trim()) setName(requirement.trim().slice(0, 20))
      if (!summary.trim()) setSummary(requirement.trim().slice(0, 60))
      setView('edit')
      message.success('已生成 SKILL.md，请检查并补充后保存')
    } catch (e) {
      message.error(`生成失败：${e instanceof Error ? e.message : '未知错误'}`)
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = () => {
    if (!name.trim()) {
      message.warning('请填写技能名称')
      return
    }
    if (!content.trim()) {
      message.warning('请填写 SKILL.md 内容')
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
      version: version.trim() || '1.0.0',
      source,
    })
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={760}
      title={item ? '编辑技能' : '创建技能'}
      destroyOnHidden
      extra={
        <Space>
          <Button
            onClick={() =>
              downloadSkillZip({
                name: name || 'skill',
                summary,
                content,
                version,
                tags: tagsText.split(/[、,，\s]+/).filter(Boolean),
              })
            }
            disabled={!content.trim()}
          >
            下载技能包
          </Button>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" onClick={handleSave}>
            保存
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div>
          <Text strong>AI 智能创建（基于 MetaSkill 规范）</Text>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <Input.TextArea
              rows={2}
              value={requirement}
              onChange={(e) => setRequirement(e.target.value)}
              placeholder="描述你想要的技能，例如：把用户的目标拆解成带估时的任务清单"
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

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 2 }}>
            <div style={{ marginBottom: 4 }}>
              <Text>技能名称</Text>
            </div>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：任务拆解助手" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: 4 }}>
              <Text>版本</Text>
            </div>
            <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0.0" />
          </div>
        </div>

        <div>
          <div style={{ marginBottom: 4 }}>
            <Text>摘要</Text>
          </div>
          <Input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="一句话说明这个技能做什么"
          />
        </div>

        <div>
          <div style={{ marginBottom: 4 }}>
            <Text>标签</Text>
            <Text type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>
              用「、」或逗号分隔
            </Text>
          </div>
          <Input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="项目管理、拆解" />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text>SKILL.md 内容</Text>
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
              rows={18}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={'---\nname: my-skill\ndescription: 做什么、何时用\n---\n\n# 技能名'}
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
                minHeight: 360,
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
