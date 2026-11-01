/**
 * 职责：今日聚焦数据层（R7-7 TanStack Query 全量迁移 · 第二域）
 *
 * 数据源：后端 `GET /api/v1/me/today`（`TasksController.today`）—— 聚合本人未完成团队任务
 * 与个人任务，按逾期/截止时间/优先级排序（服务端 `sortTodayItems`）。
 *
 * 设计：
 * - 以服务端为唯一来源（`useQuery` 30s 轮询 + WS 事件失效），`TodayFocusPage` 成员版面
 *   为只读消费方；前端经 `@/utils/today` 按后端同口径再排一次保证展示稳定。
 * - 管理版面的团队聚合（全部成员）无后端端点，不在本域，仍由页面经 `useWorkspaceTasks`
 *   本地承担（D-07 待拍板，见 docs/ddd/production-progress.md §R7-7）。
 * - "每日节点勾选"（toggleNode）是前端演示行为，后端无对应端点，不属本域。
 */
import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { useWsEvents } from './useWs'
import { getToday, type TodayItem as ServerTodayItem } from '@/api/todayApi'
import { sortTodayItems, type TodayItem } from '@/utils/today'

export const TODAY_QUERY_KEY = ['me/today'] as const

/** 服务端 /me/today 项 → 前端 TodayItem（dueAt: ISO 字符串 → Date） */
function toItem(raw: ServerTodayItem): TodayItem {
  return {
    id: raw.id,
    title: raw.title,
    type: raw.type === 'personal' ? 'personal' : 'team',
    status: raw.status,
    priority: raw.priority,
    dueAt: raw.dueAt ? new Date(raw.dueAt) : null,
  }
}

export function useTodayFocus() {
  const authUser = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: TODAY_QUERY_KEY,
    queryFn: async () => {
      const items = await getToday(50)
      return sortTodayItems(items.map(toItem))
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
    gcTime: 5 * 60_000,
    enabled: Boolean(authUser?.id),
  })

  // WS 任务事件（task.* / mention.parsed）可能改变今日聚焦内容 → 让缓存重新对齐
  useWsEvents(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: TODAY_QUERY_KEY })
    }, [queryClient]),
  )

  const items = query.data ?? []
  const overdue = useMemo(
    () => items.filter((t) => t.dueAt && t.dueAt.getTime() < Date.now()).length,
    [items],
  )
  const blocked = useMemo(
    () => items.filter((t) => t.status === 'blocked').length,
    [items],
  )

  return { items, overdue, blocked, isLoading: query.isLoading, error: query.error }
}
