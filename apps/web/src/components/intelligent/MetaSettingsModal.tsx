/**
 * Meta 设置弹窗：编辑「Meta 提示词」与「MetaSkill」
 *
 * - Meta 提示词默认内置（界面主流程不直接展示），在此可查看与编辑。
 * - MetaSkill 默认使用 qiaomu-meta-skill 规范，可编辑内容或上传 .md/.txt/.zip 替换。
 */
import { useEffect, useState } from 'react'
import { App, Button, Input, Modal, Space, Tabs, Tag, Typography, Upload } from 'antd'
import { ReloadOutlined, UploadOutlined } from '@ant-design/icons'
import type { MetaConfig } from '@/types/intelligent'
import { parseSkillFile } from '@/utils/download'

const { Text, Paragraph } = Typography

interface MetaSettingsModalProps {
  open: boolean
  config: MetaConfig
  onCancel: () => void
  onSaveMetaPrompt: (text: string) => void
  onSaveMetaSkill: (patch: { name?: string; source?: string; content?: string }) => void
  onReset: () => void
}

export default function MetaSettingsModal({
  open,
  config,
  onCancel,
  onSaveMetaPrompt,
  onSaveMetaSkill,
  onReset,
}: MetaSettingsModalProps) {
  const { message } = App.useApp()
  const [tab, setTab] = useState<'prompt' | 'skill'>('prompt')
  const [prompt, setPrompt] = useState(config.metaPrompt)
  const [skillName, setSkillName] = useState(config.metaSkillName)
  const [skillSource, setSkillSource] = useState(config.metaSkillSource)
  const [skillContent, setSkillContent] = useState(config.metaSkillContent)

  useEffect(() => {
    if (open) {
      setPrompt(config.metaPrompt)
      setSkillName(config.metaSkillName)
      setSkillSource(config.metaSkillSource)
      setSkillContent(config.metaSkillContent)
    }
  }, [open, config])

  const handleFile = async (file: File) => {
    try {
      const text = await parseSkillFile(file)
      if (!text.trim()) {
        message.warning('文件内容为空')
        return
      }
      setSkillContent(text)
      message.success(`已读取 ${file.name}，确认无误后点击保存`)
    } catch (e) {
      message.error(`解析失败：${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  return (
    <Modal
      open={open}
      title="Meta 设置"
      onCancel={onCancel}
      width={760}
      footer={[
        <Button key="reset" icon={<ReloadOutlined />} onClick={onReset}>
          恢复默认
        </Button>,
        <Button key="close" onClick={onCancel}>
          关闭
        </Button>,
        <Button
          key="save"
          type="primary"
          onClick={() => {
            if (tab === 'prompt') {
              onSaveMetaPrompt(prompt)
              message.success('Meta 提示词已保存')
            } else {
              onSaveMetaSkill({ name: skillName, source: skillSource, content: skillContent })
              message.success('MetaSkill 已保存')
            }
          }}
        >
          保存
        </Button>,
      ]}
      destroyOnHidden
    >
      <Tabs
        activeKey={tab}
        onChange={(k) => setTab(k as 'prompt' | 'skill')}
        items={[
          {
            key: 'prompt',
            label: 'Meta 提示词',
            children: (
              <div>
                <Space style={{ marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    AI 辅助创建提示词时使用的元规范
                  </Text>
                  <Tag color={config.customized ? 'orange' : 'default'}>
                    {config.customized ? '已自定义' : '系统默认'}
                  </Tag>
                </Space>
                <Input.TextArea
                  rows={16}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                />
                <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                  默认内容来自 MetaPrompt.txt（提示词工程八大规范）。界面主流程不会直接展示它，仅用于 AI 生成时作为元指令。
                </Paragraph>
              </div>
            ),
          },
          {
            key: 'skill',
            label: 'MetaSkill',
            children: (
              <div>
                <Space style={{ marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    AI 智能创建技能时遵循的元规范
                  </Text>
                  <Tag color={config.customized ? 'orange' : 'default'}>
                    {config.customized ? '已自定义' : '系统默认'}
                  </Tag>
                </Space>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <Input
                    value={skillName}
                    onChange={(e) => setSkillName(e.target.value)}
                    placeholder="MetaSkill 名称"
                    style={{ flex: 1 }}
                  />
                  <Input
                    value={skillSource}
                    onChange={(e) => setSkillSource(e.target.value)}
                    placeholder="来源地址"
                    style={{ flex: 1 }}
                  />
                </div>
                <Upload
                  accept=".md,.txt,.zip"
                  showUploadList={false}
                  beforeUpload={(file) => {
                    void handleFile(file as File)
                    return false
                  }}
                >
                  <Button icon={<UploadOutlined />} size="small" style={{ marginBottom: 8 }}>
                    上传替换（.md / .txt / .zip）
                  </Button>
                </Upload>
                <Input.TextArea
                  rows={14}
                  value={skillContent}
                  onChange={(e) => setSkillContent(e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                />
              </div>
            ),
          },
        ]}
      />
    </Modal>
  )
}
