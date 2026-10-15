import type { WikiEntry } from '@/types/wiki'

/**
 * 冷启动种子：复用现有 Wiki 经验卡 / 经验记录 / SOP 自动生成首批知识卡，
 * 并按关键词重叠自动建立 [[字段名]] 互联，形成初始拓扑。
 */
const legacyWiki = [
  { title: '需求评审清单', summary: '范围、验收标准、依赖和风险的评审要点。', keywords: ['评审', '需求', '验收'] },
  { title: '设计走查规范', summary: '颜色、间距、响应式和交互状态的统一检查方法。', keywords: ['设计', '走查', 'token'] },
  { title: '联调环境排障', summary: '前端代理、服务健康检查和数据迁移的排障路径。', keywords: ['联调', '部署', '健康检查'] },
]
const legacyExp = [
  { taskTitle: '视觉规范定稿', note: '先锁定可复用的设计 token，再进行页面走查，返工明显减少。', tags: ['设计', '复用'] },
  { taskTitle: '技术选型确认', note: '先做最小可运行验证，再进入正式开发，能尽早暴露部署约束。', tags: ['架构', '验证'] },
]
const legacySop = [
  { title: '需求文档评审 SOP', steps: ['确认目标和不做范围', '逐条核对验收标准', '记录依赖与风险', '输出评审结论并同步负责人'] },
  { title: '技术选型确认 SOP', steps: ['列出候选方案', '完成最小可运行验证', '比较成本与维护约束', '记录决策和回滚方案'] },
]

export function seedWikiKb(): WikiEntry[] {
  const now = new Date().toISOString()
  const base: WikiEntry[] = [
    ...legacyWiki.map((w, i) => ({
      id: `seed-wiki-${i}`,
      title: w.title,
      summary: w.summary,
      content: `## 要点\n${w.keywords.map((k) => `- ${k}`).join('\n')}\n\n## 相关\n`,
      keywords: w.keywords,
      source: 'Wiki 经验卡',
      createdAt: now,
      updatedAt: now,
    })),
    ...legacyExp.map((e, i) => ({
      id: `seed-exp-${i}`,
      title: `经验：${e.taskTitle}`,
      summary: e.note.slice(0, 50),
      content: e.note,
      keywords: e.tags,
      source: `经验：${e.taskTitle}`,
      createdAt: now,
      updatedAt: now,
    })),
    ...legacySop.map((s, i) => ({
      id: `seed-sop-${i}`,
      title: s.title,
      summary: `包含 ${s.steps.length} 个步骤的标准作业流程。`,
      content: `## 步骤\n${s.steps.map((x) => `- ${x}`).join('\n')}\n\n## 相关\n`,
      keywords: ['SOP', ...s.title.split(/\s+/).filter(Boolean).slice(0, 2)],
      source: 'SOP 库',
      createdAt: now,
      updatedAt: now,
    })),
  ]

  for (const e of base) {
    const related = base.filter((o) => o.id !== e.id && o.keywords.some((k) => e.keywords.includes(k)))
    const links = related.map((o) => `[[${o.title}]]`).join('、')
    if (links) e.content += `关联知识：${links}`
  }

  return base
}
