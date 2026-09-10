export interface WikiEntry {
  id: string
  /** 概念 / 字段名，作为 [[链接]] 的锚点（在知识库内唯一） */
  title: string
  /** 卡片外展示的摘要 */
  summary: string
  /** 详细介绍，Markdown，正文可含 [[字段名]] 链接语法 */
  content: string
  keywords: string[]
  source?: string
  createdAt: string
  updatedAt: string
}
