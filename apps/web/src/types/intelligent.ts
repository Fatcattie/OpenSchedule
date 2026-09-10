/** 智能协助模块：提示词 / 技能 的数据模型 */

/** 一条提示词 */
export interface PromptItem {
  id: string
  /** 名称 */
  name: string
  /** 摘要（卡片上展示的一两句话） */
  summary: string
  /** 提示词正文（markdown） */
  content: string
  tags: string[]
  /** 收藏 */
  favorite: boolean
  /** 创建人 id */
  createdBy: string
  /** 创建人姓名快照（避免用户改名后列表错乱） */
  createdByName: string
  createdAt: string
  updatedAt: string
  /** 推荐分享给的员工 id 列表 */
  sharedWith: string[]
  /** 每个被推荐人的推荐语：userId -> note */
  shareNotes: Record<string, string>
  /** 创建来源 */
  source: 'manual' | 'ai'
}

/** 一个技能（Skill） */
export interface SkillItem {
  id: string
  name: string
  summary: string
  /** SKILL.md 正文（markdown） */
  content: string
  tags: string[]
  version: string
  favorite: boolean
  createdBy: string
  createdByName: string
  createdAt: string
  updatedAt: string
  sharedWith: string[]
  shareNotes: Record<string, string>
  source: 'manual' | 'ai' | 'import'
}

/** Meta 配置：生成提示词的元提示词 + 生成技能的元技能 */
export interface MetaConfig {
  /** Meta 提示词（默认使用 MetaPrompt.txt 内容，界面不直接展示，通过设置弹窗编辑） */
  metaPrompt: string
  /** MetaSkill 名称 */
  metaSkillName: string
  /** MetaSkill 来源地址 */
  metaSkillSource: string
  /** MetaSkill 内容（SKILL.md 编写规范） */
  metaSkillContent: string
  updatedAt: string
  /** 是否被用户自定义过（用于展示「已自定义 / 默认」标记与重置按钮） */
  customized: boolean
}

/** 库中条目被分享给当前用户时的展示包装 */
export interface SharedEntry<T> {
  item: T
  sharedBy: string
  sharedByName: string
  note?: string
}
