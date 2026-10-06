/**
 * 职责：统一异步三态 hook —— 返回 { data, loading, error, refetch, retry }（ARCH §10）。
 * 自带竞态保护与卸载保护：仅最后一次请求的结果会被采纳。
 *
 * 增量 8（A1 裁决）：新增**可选** `options.cache`，开启后启用「断网回退缓存 + 成功落盘」；
 * 不传 `cache` 时，除返回值**多出两个字段**（`isStale` / `updatedAt`）外，既有调用点行为**逐字节不变**。
 * 缓存读写内联进 `run()`，复用同一套 `requestId` / `mountedRef` 竞态守卫（单一真相源）。
 */
import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'
import { isDegradableError } from '@/types'
import { buildCacheKey, getCacheScope, readCache, writeCache } from '@/services/cache'
import { registerRefetcher } from '@/services/connectivity'

/** useAsync 返回值 */
export interface UseAsyncResult<T> {
  data: T | null
  loading: boolean
  error: unknown
  /** 当前展示的是「因取数失败而回退的缓存」（增量 8） */
  isStale: boolean
  /** 缓存数据写入时刻（epoch ms），仅 `isStale` 时有值（增量 8） */
  updatedAt: number | null
  /** 重新拉取（保留当前数据，便于下拉刷新） */
  refetch: () => Promise<void>
  /** 失败后重试（语义与 refetch 一致，供 ErrorState 使用） */
  retry: () => Promise<void>
  /** 本地更新数据（乐观更新 / 局部替换） */
  setData: (updater: T | null | ((prev: T | null) => T | null)) => void
}

/** useAsync 配置 */
export interface UseAsyncOptions<T> {
  /** 是否在挂载 / 依赖变化时立即执行（默认 true） */
  immediate?: boolean
  /** 初始数据 */
  initialData?: T | null
  /**
   * 增量 8（可选）：开启后启用「断网回退缓存 + 成功落盘」。
   * `key` 为**域内 key**（如 `projects:active`），完整 key 由 hook 拼上 scope（`<userId>:<role>`）。
   * 不传 = 与现状完全一致（新代码路径整段跳过）。
   */
  cache?: { key: string }
}

/**
 * 统一的异步数据 hook。
 * @param factory 异步取数函数（内部会自动读取最新引用，无需 useCallback 包裹）
 * @param deps 依赖数组，变化时重新执行
 * @param options immediate / initialData / cache
 */
export function useAsync<T>(
  factory: () => Promise<T>,
  deps: DependencyList = [],
  options: UseAsyncOptions<T> = {},
): UseAsyncResult<T> {
  const { immediate = true, initialData = null } = options
  const cacheKey = options.cache?.key ?? null

  const [data, setData] = useState<T | null>(initialData)
  const [rawLoading, setRawLoading] = useState<boolean>(immediate)
  const [error, setError] = useState<unknown>(null)
  const [isStale, setIsStale] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)

  const mountedRef = useRef(true)
  const requestIdRef = useRef(0)
  const factoryRef = useRef(factory)
  factoryRef.current = factory

  // 缓存 key 随渲染刷新；run 内通过 ref 读取，保持 run 引用稳定（useCallback []）
  const cacheKeyRef = useRef<string | null>(cacheKey)
  cacheKeyRef.current = cacheKey
  const fullKey = cacheKey ? buildCacheKey(cacheKey) : null
  const fullKeyRef = useRef<string | null>(fullKey)
  fullKeyRef.current = fullKey
  // 缓存 scope 参与 effect 依赖 ⇒ 角色 / 用户变化自动重取（N6）
  const cacheScope = cacheKey ? getCacheScope() : null

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const run = useCallback(async () => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setRawLoading(true)
    setError(null)
    const key = fullKeyRef.current
    const useCache = cacheKeyRef.current !== null && key !== null
    try {
      const result = await factoryRef.current()
      if (!mountedRef.current || requestId !== requestIdRef.current) return
      setData(result)
      setIsStale(false)
      setUpdatedAt(null)
      // 仅「成功取数」落盘（乐观更新 setData 不落盘，避免缓存未确认数据）
      if (useCache && key !== null) void writeCache(key, result)
    } catch (err) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return
      if (useCache && key !== null && isDegradableError(err)) {
        const entry = await readCache<T>(key)
        if (!mountedRef.current || requestId !== requestIdRef.current) return
        if (entry) {
          setData(entry.data)
          setIsStale(true)
          setUpdatedAt(entry.updatedAt)
          setError(null)
          return
        }
      }
      setError(err)
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) setRawLoading(false)
    }
  }, [])

  // 立即执行：cache 开启时把 scope 追加进依赖 ⇒ 角色 / 用户变化自动重取
  const effectDeps = cacheKey ? [...deps, cacheScope] : deps
  useEffect(() => {
    if (!immediate) return
    void run()
    // 依赖由调用方声明，故此处显式忽略 lint 规则
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, effectDeps)

  // cache 开启时注册全屏刷新（恢复网络 / 手动重试 / 回前台 / 退避探测 → refetchAll）
  useEffect(() => {
    if (!cacheKey) return
    return registerRefetcher(() => {
      void run()
    })
  }, [cacheKey, run])

  const updateData = useCallback((updater: T | null | ((prev: T | null) => T | null)) => {
    setData((prev) =>
      typeof updater === 'function' ? (updater as (previous: T | null) => T | null)(prev) : updater,
    )
  }, [])

  return {
    data,
    // 收窄：有可展示数据时不再展示 loading ⇒ 恢复刷新不闪骨架屏（N5）
    loading: rawLoading && data === null,
    error,
    isStale,
    updatedAt: isStale ? updatedAt : null,
    refetch: run,
    retry: run,
    setData: updateData,
  }
}
