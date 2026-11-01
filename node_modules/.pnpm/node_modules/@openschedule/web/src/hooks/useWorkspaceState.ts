/**
 * 职责：协作工作台状态存储（D-07 一期）—— 原 localStorage 体系切到后端 /workspace/:collection
 *
 * 与 useLocalStorageState 同签名（[value, setValue]，第三项 meta.ready 可选），调用方零改动：
 * - 真实模式：TanStack Query 缓存为单一数据源（同集合多实例天然一致）；setValue 先乐观更新缓存，
 *   再按集合串行提交差量（只传变化的条目），条目级乐观锁；30s 轮询 + 窗口聚焦拉取他人修改。
 *   提交失败（版本冲突 40901 / 只读 40301 / 网络）→ 提示并重新拉取服务器数据覆盖本地乐观值。
 * - mock 模式（VITE_USE_MOCK=true）：仍走 localStorage，本地演示不变。
 * 集合未写过时显示 initial；真实模式下调用方应传空初始值，不把 mock 演示种子带进生产租户。
 */
import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { message } from 'antd'
import { USE_MOCK } from '@/api/config'
import { ApiClientError } from '@/api/errors'
import { applyWorkspaceBatch, listWorkspaceItems } from '@/api/workspaceApi'
import { queryClient as sharedQueryClient } from '@/lib/queryClient'
import { applyOps, chunkOps, decodeEntries, diffEntries, encodeValue, type EntryMap, type SyncOps } from '@/utils/workspaceSync'
import { readLocalStorageState, useLocalStorageState, writeLocalStorageState } from './useLocalStorageState'

export interface WorkspaceStateMeta {
  /** 服务器数据已加载（真实模式首屏前为 false；mock 恒为 true） */
  ready: boolean
}

export type WorkspaceStateTuple<T> = readonly [T, Dispatch<SetStateAction<T>>, WorkspaceStateMeta]

export const workspaceQueryKey = (collection: string) => ['workspace', collection] as const

// ─────────────────────────── 每集合同步状态（模块级，跨组件共享） ───────────────────────────

interface SyncState {
  /** 服务器已确认的条目版本（提交时作为 baseVersion） */
  confirmed: Map<string, number>
  /** 串行提交链（同集合提交按顺序，避免并发读到过期版本） */
  chain: Promise<void>
  pending: number
  failed: boolean
  /** 每次排队提交 +1；拉取期间若变化，说明拉取结果可能早于提交，丢弃 */
  generation: number
}

const syncStates = new Map<string, SyncState>()

function syncStateOf(collection: string): SyncState {
  let s = syncStates.get(collection)
  if (!s) {
    s = { confirmed: new Map(), chain: Promise.resolve(), pending: 0, failed: false, generation: 0 }
    syncStates.set(collection, s)
  }
  return s
}

/** 测试用：清空模块级同步状态 */
export function resetWorkspaceSyncState(): void {
  syncStates.clear()
}

async function fetchEntries(client: QueryClient, collection: string): Promise<EntryMap> {
  const s = syncStateOf(collection)
  const startGeneration = s.generation
  const items = await listWorkspaceItems(collection)
  const cached = client.getQueryData<EntryMap>(workspaceQueryKey(collection))
  // 有未完成/拉取期间新增的提交时不覆盖乐观值（服务器结果可能早于提交），下次拉取再对齐
  if (cached && (s.pending > 0 || s.generation !== startGeneration)) return cached
  const map: EntryMap = {}
  const confirmed = new Map<string, number>()
  items.forEach((i) => {
    map[i.key] = i.data
    confirmed.set(i.key, i.version)
  })
  s.confirmed = confirmed
  return map
}

function decodeOr<T>(entries: EntryMap, fallback: () => T): T {
  return Object.keys(entries).length > 0 ? decodeEntries<T>(entries, undefined as T) : fallback()
}

function warnFailure(err: unknown): void {
  const code = err instanceof ApiClientError ? err.code : 0
  if (code === 40901) message.warning('工作台数据已被他人修改，已刷新为最新内容，请重新操作')
  // 40301：只读角色，或工作台任务写入守卫拒绝（D-07 二期，消息含具体规则与任务）
  else if (code === 40301) message.warning(`修改未保存：${err instanceof Error && err.message ? err.message : '当前角色无权执行该操作'}`)
  else message.error('工作台保存失败，已恢复为服务器数据')
}

function enqueueSend(client: QueryClient, collection: string, ops: SyncOps): void {
  const s = syncStateOf(collection)
  s.pending += 1
  s.generation += 1
  s.chain = s.chain
    .then(async () => {
      for (const batch of chunkOps(ops)) {
        const upserts = batch.upserts.map((u) => ({ key: u.key, data: u.data, baseVersion: s.confirmed.get(u.key) ?? null }))
        const deletes = batch.deletes
          .filter((k) => s.confirmed.has(k))
          .map((k) => ({ key: k, baseVersion: s.confirmed.get(k)! }))
        if (upserts.length === 0 && deletes.length === 0) continue
        const res = await applyWorkspaceBatch(collection, { upserts, deletes })
        res.items.forEach((i) => s.confirmed.set(i.key, i.version))
        res.deleted.forEach((k) => s.confirmed.delete(k))
      }
    })
    .catch((err: unknown) => {
      if (!s.failed) warnFailure(err)
      s.failed = true
    })
    .finally(() => {
      s.pending -= 1
      if (s.pending === 0 && s.failed) {
        s.failed = false
        void client.invalidateQueries({ queryKey: workspaceQueryKey(collection) })
      }
    })
}

/** 应用一次 setState：读缓存 → 计算新值 → 乐观写缓存 → 排队提交差量 */
function mutateWorkspace<T>(client: QueryClient, collection: string, action: SetStateAction<T>, fallback: () => T): void {
  const key = workspaceQueryKey(collection)
  const cur = client.getQueryData<EntryMap>(key)
  if (!cur) {
    // 首屏未加载完就写（如冷启动种子）：先拉服务器数据再基于它应用，避免空值覆盖已有数据
    client
      .ensureQueryData({ queryKey: key, queryFn: () => fetchEntries(client, collection) })
      .then(() => mutateWorkspace(client, collection, action, fallback))
      .catch(() => message.error('工作台数据加载失败，修改未保存'))
    return
  }
  const prev = decodeOr(cur, fallback)
  const next = typeof action === 'function' ? (action as (p: T) => T)(prev) : action
  if (Object.is(next, prev)) return
  const ops = diffEntries(cur, encodeValue(next))
  if (ops.upserts.length === 0 && ops.deletes.length === 0) return
  client.setQueryData<EntryMap>(key, applyOps(cur, ops))
  enqueueSend(client, collection, ops)
}

// ─────────────────────────── Hooks ───────────────────────────

function useServerWorkspaceState<T>(collection: string, initial: T | (() => T)): WorkspaceStateTuple<T> {
  const client = useQueryClient()
  const [fallback] = useState<T>(() => (typeof initial === 'function' ? (initial as () => T)() : initial))
  const query = useQuery({
    queryKey: workspaceQueryKey(collection),
    queryFn: () => fetchEntries(client, collection),
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
  const value = useMemo(() => (query.data ? decodeOr(query.data, () => fallback) : fallback), [query.data, fallback])
  const setValue = useCallback<Dispatch<SetStateAction<T>>>(
    (action) => mutateWorkspace(client, collection, action, () => fallback),
    [client, collection, fallback],
  )
  const meta = useMemo(() => ({ ready: query.isSuccess }), [query.isSuccess])
  return [value, setValue, meta] as const
}

const MOCK_META: WorkspaceStateMeta = { ready: true }

function useMockWorkspaceState<T>(collection: string, initial: T | (() => T)): WorkspaceStateTuple<T> {
  const [value, setValue] = useLocalStorageState<T>(collection, initial)
  return [value, setValue, MOCK_META] as const
}

/** 工作台集合状态（集合名须在后端白名单 workspace-collections.ts 内） */
export const useWorkspaceState: <T>(collection: string, initial: T | (() => T)) => WorkspaceStateTuple<T> = USE_MOCK
  ? useMockWorkspaceState
  : useServerWorkspaceState

/**
 * 服务端命令通道（D-07 二期，如审核命令）：先等相关集合的未完成提交落库（避免命令读到旧数据、
 * 或命令改动后本地乐观值以旧版本覆盖），执行命令，再重新拉取这些集合对齐服务器结果。
 */
export async function runWorkspaceCommand<R>(
  collections: string[],
  command: () => Promise<R>,
  client: QueryClient = sharedQueryClient,
): Promise<R> {
  await Promise.all(collections.map((c) => syncStateOf(c).chain))
  collections.forEach((c) => {
    syncStateOf(c).generation += 1
  })
  try {
    return await command()
  } finally {
    await Promise.all(collections.map((c) => client.refetchQueries({ queryKey: workspaceQueryKey(c), type: 'all' })))
  }
}

/** mock 模式命令式读取集合当前值（真实模式不使用） */
export function readWorkspaceValueLocal<T>(collection: string, fallback: T): T {
  return readLocalStorageState(collection, fallback)
}

/** 非组件代码命令式更新集合（如任务闭环沉淀 SOP） */
export function updateWorkspaceValue<T>(collection: string, updater: (prev: T) => T, fallback: T): void {
  if (USE_MOCK) writeLocalStorageState(collection, updater, fallback)
  else mutateWorkspace(sharedQueryClient, collection, updater, () => fallback)
}
