/**
 * useAiStatus —— 团队是否已接入真实 AI 模型（GET /ai/status；管理员在「设置 → AI 模型」配置）
 * 页面据此展示「已接入 xx 模型 / 使用本地规则引擎」，不含任何 key 信息。
 */
import { useQuery } from '@tanstack/react-query'
import { getAiStatus, type AiStatus } from '@/api/llmApi'

export const AI_STATUS_QUERY_KEY = ['ai-status'] as const

export function useAiStatus(): AiStatus & { loading: boolean } {
  const query = useQuery({ queryKey: AI_STATUS_QUERY_KEY, queryFn: getAiStatus, staleTime: 30_000 })
  return {
    enabled: query.data?.enabled ?? false,
    provider: query.data?.provider ?? null,
    providerName: query.data?.providerName ?? null,
    model: query.data?.model ?? null,
    loading: query.isLoading,
  }
}
