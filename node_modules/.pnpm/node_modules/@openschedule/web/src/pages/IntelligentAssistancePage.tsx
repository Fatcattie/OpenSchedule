/**
 * 智能协助：提示词管理 / Skill 技能管理 两大板块
 *
 * - 提示词管理：参考 AI-Gist 的库管理布局，支持手动创建与 AI 辅助创建（Meta 提示词驱动）
 * - Skill 技能管理：基于 MetaSkill（默认 qiaomu-meta-skill）AI 智能创建，可下载 zip 技能包
 * - 两者均支持推荐分享给员工，对方在「收到的推荐」中可见并可复制/下载
 */
import { useState } from 'react'
import { Card, Segmented, Space, Typography } from 'antd'
import { Button } from 'antd'
import { RobotOutlined, SettingOutlined } from '@ant-design/icons'
import { useMetaConfig } from '@/hooks/useMetaConfig'
import PromptLibrary from '@/components/intelligent/PromptLibrary'
import SkillLibrary from '@/components/intelligent/SkillLibrary'
import MetaSettingsModal from '@/components/intelligent/MetaSettingsModal'
import { getAgentEndpoint } from '@/utils/aiRules'

const { Title, Text } = Typography

type PanelKey = 'prompt' | 'skill'

export default function IntelligentAssistancePage() {
  const [panel, setPanel] = useState<PanelKey>('prompt')
  const [metaOpen, setMetaOpen] = useState(false)
  const { config, updateMetaPrompt, updateMetaSkill, reset } = useMetaConfig()
  const agentReady = Boolean(getAgentEndpoint())

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <RobotOutlined style={{ marginRight: 10 }} />
            智能协助
          </Title>
          <Text type="secondary">
            提示词与技能的统一仓库：AI 辅助创建、团队推荐分享、一键复制与下载。
            {!agentReady && '（当前未配置模型端点，AI 生成使用本地模拟模板）'}
          </Text>
        </div>
        <Space wrap>
          <Segmented
            value={panel}
            onChange={(v) => setPanel(v as PanelKey)}
            options={[
              { value: 'prompt', label: '提示词管理' },
              { value: 'skill', label: 'Skill 技能管理' },
            ]}
          />
          <Button icon={<SettingOutlined />} onClick={() => setMetaOpen(true)}>
            Meta 设置
          </Button>
        </Space>
      </div>

      <Card>
        {panel === 'prompt' ? (
          <PromptLibrary />
        ) : (
          <SkillLibrary onOpenMetaSkill={() => setMetaOpen(true)} />
        )}
      </Card>

      <MetaSettingsModal
        open={metaOpen}
        config={config}
        onCancel={() => setMetaOpen(false)}
        onSaveMetaPrompt={updateMetaPrompt}
        onSaveMetaSkill={updateMetaSkill}
        onReset={reset}
      />
    </div>
  )
}
