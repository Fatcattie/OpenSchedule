/**
 * WikiKbPage.tsx —— 洞察与智能模块下的 Wiki 知识库独立页
 *
 * 由协作工作台迁移而来：类 Obsidian 三栏（知识卡列表 / 卡片详情+反向链接 / 拓扑网络）。
 * 数据通过 useWikiKb 共享（与协作工作台的 addExperience 自动建卡互通）。
 */
import WikiKnowledgeBase from '@/components/workspace/WikiKnowledgeBase'
import { useWikiKb } from '@/hooks/useWikiKb'

export default function WikiKbPage() {
  const [wikiKb, setWikiKb] = useWikiKb()
  return <WikiKnowledgeBase entries={wikiKb} setEntries={setWikiKb} />
}
