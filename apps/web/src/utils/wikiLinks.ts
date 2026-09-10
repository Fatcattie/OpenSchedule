import type { WikiEntry } from '@/types/wiki'

/** 提取正文中的 [[字段名]]，返回去重后的标题列表 */
export function parseLinkTitles(content: string): string[] {
  const out: string[] = []
  const re = /\[\[([^[\]]+)\]\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) {
    const t = m[1].trim()
    if (t && !out.includes(t)) out.push(t)
  }
  return out
}

/** 标题 -> id 索引（大小写不敏感） */
export function buildTitleIndex(entries: WikiEntry[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const e of entries) map.set(e.title.trim().toLowerCase(), e.id)
  return map
}

export interface WikiGraphEdge {
  from: string
  to: string
  raw: string
}

export interface WikiGraph {
  /** 已解析的连线（去重、排除自环） */
  edges: WikiGraphEdge[]
  /** targetId -> 链向它的来源 entryId 列表（反向链接） */
  backlinks: Record<string, string[]>
  /** entryId -> 正文中引用但知识库里尚不存在的字段名（待创建链接） */
  unresolvedByEntry: Record<string, string[]>
}

/** 由知识卡列表派生拓扑：节点=卡片，边=正文里的 [[链接]] */
export function buildGraph(entries: WikiEntry[]): WikiGraph {
  const idx = buildTitleIndex(entries)
  const rawEdges: WikiGraphEdge[] = []
  const backlinks: Record<string, string[]> = {}
  const unresolvedByEntry: Record<string, string[]> = {}

  for (const e of entries) {
    for (const t of parseLinkTitles(e.content)) {
      const id = idx.get(t.toLowerCase())
      if (id && id !== e.id) {
        rawEdges.push({ from: e.id, to: id, raw: t })
        ;(backlinks[id] ||= []).push(e.id)
      } else if (!id) {
        ;(unresolvedByEntry[e.id] ||= []).push(t)
      }
    }
  }

  const seen = new Set<string>()
  const edges = rawEdges.filter((ed) => {
    const k = `${ed.from}->${ed.to}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  return { edges, backlinks, unresolvedByEntry }
}

/** 按标题在知识库内查找（大小写不敏感），找不到返回 undefined */
export function findEntryByTitle(entries: WikiEntry[], title: string): WikiEntry | undefined {
  const key = title.trim().toLowerCase()
  return entries.find((e) => e.title.trim().toLowerCase() === key)
}
