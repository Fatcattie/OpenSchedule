/**
 * 职责：全局搜索 API 封装 —— GET /search?q=&type=（任务/项目/评论全文搜索，后端 ILIKE + pg_trgm）
 * 契约（以后端为准）：返回扁平 SearchHit[] 数组（含 type/snippet/projectId/taskId），前端按 type 分组展示。
 */
import { client } from './client'
import { USE_MOCK } from './config'
import { mockSearch } from './mock/handlers'
import type { ApiResponse } from '@/types'

/** 搜索范围：all 全部 / task 任务 / project 项目 / comment 评论 */
export type SearchType = 'all' | 'task' | 'project' | 'comment'

/** 单条搜索命中（后端返回扁平数组元素；跨类型统一形状，供前端按 type 分组展示与跳转） */
export interface SearchHit {
  type: 'task' | 'project' | 'comment'
  id: string // 实体 id（评论=评论 id）
  title: string // 命中标题/名称（评论=所属任务标题）
  snippet: string // 命中片段（关键词上下文，含省略号）
  projectId: string | null // 跳转线索
  taskId: string | null // 任务/评论命中时非空（评论跳转用 taskId）
  createdAt: string
}

/** 全局搜索：GET /search?q=&type=（q 为空由前端拦截，不发请求）；返回扁平命中数组，不含 meta 的分页数据 */
export async function searchGlobal(q: string, type: SearchType = 'all'): Promise<SearchHit[]> {
  if (USE_MOCK) return mockSearch(q, type)
  const resp = await client.get<ApiResponse<SearchHit[]>>('/search', { params: { q, type } })
  return resp.data.data
}