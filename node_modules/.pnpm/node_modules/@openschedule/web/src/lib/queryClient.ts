/**
 * 职责：全局 TanStack Query 客户端单例 —— main.tsx 挂 Provider，非组件代码（如工作台存储的命令式读写）共用同一缓存
 */
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
})
