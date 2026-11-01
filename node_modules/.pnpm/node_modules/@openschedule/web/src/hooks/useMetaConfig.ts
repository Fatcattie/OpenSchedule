/**
 * useMetaConfig —— Meta 提示词 / MetaSkill 配置
 *
 * Meta 提示词默认使用内置 MetaPrompt.txt 内容，界面不直接展示，仅通过设置弹窗查看与编辑。
 * MetaSkill 默认使用 qiaomu-meta-skill 的编写规范，支持编辑内容或上传文件替换。
 */
import { useCallback } from 'react'
import { useWorkspaceState } from './useWorkspaceState'
import { DEFAULT_META_CONFIG } from '@/constants/intelligentDefaults'
import type { MetaConfig } from '@/types/intelligent'

const STORAGE_KEY = 'meta_config'

export function useMetaConfig() {
  const [config, setConfig] = useWorkspaceState<MetaConfig>(STORAGE_KEY, DEFAULT_META_CONFIG)

  const updateMetaPrompt = useCallback(
    (metaPrompt: string) => {
      setConfig((prev) => ({ ...prev, metaPrompt, updatedAt: new Date().toISOString(), customized: true }))
    },
    [setConfig],
  )

  const updateMetaSkill = useCallback(
    (patch: { name?: string; source?: string; content?: string }) => {
      setConfig((prev) => ({
        ...prev,
        metaSkillName: patch.name ?? prev.metaSkillName,
        metaSkillSource: patch.source ?? prev.metaSkillSource,
        metaSkillContent: patch.content ?? prev.metaSkillContent,
        updatedAt: new Date().toISOString(),
        customized: true,
      }))
    },
    [setConfig],
  )

  const reset = useCallback(() => {
    setConfig({ ...DEFAULT_META_CONFIG, updatedAt: new Date().toISOString() })
  }, [setConfig])

  return { config, setConfig, updateMetaPrompt, updateMetaSkill, reset }
}
